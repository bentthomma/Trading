import {spawn} from 'node:child_process';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {fail,HubError} from './errors.mjs';
import {getLatestRestoreJob,readRestoreJob} from './maintenance.mjs';

const WORKER=fileURLToPath(new URL('../scripts/maintenance.mjs',import.meta.url));
const ROOT=resolve(dirname(WORKER),'..');
const TERMINAL=new Set(['succeeded','rolled_back','failed']);
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));

// The worker only receives fixed flags and a server-issued job ID. No keys or
// resume tickets enter command arguments, child environment additions or logs.
export async function executeMaintenanceWorker({directory,jobId,recover=false}){
  const args=[WORKER,'--data-dir',directory,...(recover?['--recover']:['--job-id',jobId])];
  return new Promise((resolveRun,reject)=>{
    let child;try{child=spawn(process.execPath,args,{cwd:ROOT,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});}catch{reject(new HubError('MAINTENANCE_START_FAILED','Die lokale Wartung konnte nicht gestartet werden.',503));return;}
    let size=0,settled=false,timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},120000);timer.unref();
    const output=chunk=>{size+=chunk.length;if(size>65536)child.kill('SIGKILL');};
    child.stdout.on('data',output);child.stderr.on('data',output);
    const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolveRun(value);};
    child.once('error',()=>done(new HubError('MAINTENANCE_START_FAILED','Die lokale Wartung konnte nicht gestartet werden.',503)));
    child.once('exit',(code,signal)=>{
      if(timedOut)done(new HubError('MAINTENANCE_TIMEOUT','Die Wartung wurde unterbrochen. Der Datenstand muss vor dem nächsten Öffnen abgeglichen werden.',503));
      else if(size>65536)done(new HubError('MAINTENANCE_OUTPUT_INVALID','Die Wartung lieferte kein gültiges begrenztes Ergebnis.',503));
      else done(null,{exitCode:code,signal});
    });
  });
}

// The application process owns the terminal; each Core owns exactly one SQLite
// connection lifetime. Offline replacement always runs in a separate process.
export async function createManagedApplication(createCore,options){
  if(options.lock===false)fail('MAINTENANCE_LOCK_REQUIRED','Die lokale Wartung benötigt exklusiven Zugriff auf das Profil.',503);
  if(options.dependencies?.vault)fail('MAINTENANCE_VAULT_FACTORY_REQUIRED','Ein wiederverwendeter Zugangsspeicher kann nicht für Core-Neustarts verwendet werden.',503);
  const directory=resolve(options.dataDir);let current=null,transition=null,closed=false,handoff=null,lastOrigin=null,lastFailure=null;
  const maintenance={
    supported:true,
    async status(){return {supported:true,job:await getLatestRestoreJob({directory}),...(lastFailure?{error:lastFailure}:{} )};},
    register(job){
      if(closed)fail('SHUTDOWN','Die Anwendung wird beendet.',503);
      if(handoff?.jobId===job.id&&Date.now()<handoff.expiresAt)return {jobId:handoff.jobId,ticket:handoff.ticket,expiresAt:new Date(handoff.expiresAt).toISOString()};
      if(transition)fail('MAINTENANCE_IN_PROGRESS','Die Wiederherstellung läuft bereits.',409);
      handoff={jobId:job.id,ticket:randomBytes(32).toString('base64url'),expiresAt:Date.now()+5*60000};
      return {jobId:handoff.jobId,ticket:handoff.ticket,expiresAt:new Date(handoff.expiresAt).toISOString()};
    },
    async resume({jobId,ticket}){
      const valid=()=>handoff&&jobId===handoff.jobId&&Date.now()<handoff.expiresAt&&equal(ticket,handoff.ticket);
      if(!valid())fail('MAINTENANCE_TICKET_INVALID','Die Wiederanmeldung ist abgelaufen oder passt nicht zu diesem Wartungsvorgang. Anwendung erneut öffnen.',401);
      const job=await readRestoreJob({directory,jobId});
      if(!valid())fail('MAINTENANCE_TICKET_INVALID','Die Wiederanmeldung ist nicht mehr gültig.',401);
      return {authenticated:!!current&&!transition&&TERMINAL.has(job.state),job};
    },
    start(job){
      if(transition)return transition;
      const previous=current;lastOrigin=previous.origin;
      transition=(async()=>{
        // If closing fails, keep the old Core's guard held. The worker must not
        // be launched against an unclosed database connection.
        await previous.close();current=null;
        try{await executeMaintenanceWorker({directory,jobId:job.id});}
        catch(error){lastFailure={code:error.code||'MAINTENANCE_FAILED',message:error.message};}
        // This supervisor may resume its exact prepared job. A generic startup
        // recovery must not take over another still-living supervisor's job.
        let outcome=await readRestoreJob({directory,jobId:job.id});
        if(!TERMINAL.has(outcome.state)){
          await executeMaintenanceWorker({directory,jobId:job.id});
          outcome=await readRestoreJob({directory,jobId:job.id});
        }
        if(!TERMINAL.has(outcome.state))fail('MAINTENANCE_RECOVERY_REQUIRED','Die Wartung konnte nicht abgeschlossen werden. Der vorherige Datenstand wird nicht ungeprüft geöffnet.',503);
        if(!closed)current=await createCore({...options,port:Number(new URL(lastOrigin).port),openBrowser:false,maintenance});
      })().catch(error=>{
        lastFailure={code:error.code||'MAINTENANCE_FAILED',message:error instanceof HubError?error.message:'Die Wiederherstellung konnte nicht abgeschlossen werden. Anwendung erneut öffnen und den Datenstand prüfen.'};
      }).finally(()=>{transition=null;});
      return transition;
    }
  };
  const recovery=await executeMaintenanceWorker({directory,recover:true});
  if(![0,2].includes(recovery.exitCode))fail('MAINTENANCE_RECOVERY_REQUIRED','Ein früherer Wartungsvorgang konnte nicht abgeschlossen werden. Datenstand prüfen.',503);
  current=await createCore({...options,maintenance});lastOrigin=current.origin;
  const app={
    async close(){closed=true;if(transition)await transition;if(current)await current.close();handoff=null;},
    async maintenanceStatus(){return maintenance.status();},
    newLocalSessionLink(){if(!current||transition)fail('MAINTENANCE_IN_PROGRESS','Die Wiederherstellung läuft. Das bestehende Fenster geöffnet lassen.',503);return current.newLocalSessionLink();}
  };
  for(const name of ['origin','startUrl','browserLaunch','store','control','vault','registry','server','state','refreshBroker'])Object.defineProperty(app,name,{enumerable:true,get:()=>name==='origin'?(current?.origin||lastOrigin):current?.[name]});
  return app;
}
