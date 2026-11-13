import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {inspectDatabaseSchema} from './store.mjs';
import {EngineJournal} from './engine-journal.mjs';
import {ObservationService} from './observation.mjs';
import {captureTargetAdmission} from './target-admission-context.mjs';
import {compareTargetReports} from './target-runtime-reports.mjs';
import {inspectTargetInstall} from './target-install-evidence.mjs';
export function inspectTarget(job){
 const st=lstatSync(job.databasePath);if(!st.isFile()||st.isSymbolicLink())throw Object.assign(Error(),{code:'TARGET_SNAPSHOT_PATH'});
 const db=new DatabaseSync(job.databasePath,{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON;BEGIN');if(!inspectDatabaseSchema(db).schemaCompatible)throw Object.assign(Error(),{code:'TARGET_SNAPSHOT_SCHEMA'});
  const store={db,get:(key,fallback=null)=>{const r=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return r?JSON.parse(r.value):fallback;}};
  // Read-only snapshot adapter. Authorization is checked by the real outer
  // Core before the copy, after the worker and again inside its commit.
  const control={db,store,now:()=>job.now,requireAccess:()=>{},requireHuman:a=>{if(a?.kind!=='human')throw Object.assign(Error(),{code:'HUMAN_CONFIRMATION_REQUIRED'});},rawBot:id=>{const b=db.prepare('SELECT * FROM bots WHERE id=?').get(id);if(!b)throw Object.assign(Error(),{code:'BOT_NOT_FOUND'});return b;}};
  control.engineJournal=new EngineJournal(control);control.engineJournal.epoch=job.engineEpoch;
  control.observation=new ObservationService(control);control.observation.epoch=job.observerEpoch;
  const state=captureTargetAdmission(control,job.selection,{includeViews:true});
  const files=inspectTargetInstall({...job.selection,confirmed:state.confirmed,now:job.now});
  const comparison=compareTargetReports({engine:state.engine,observer:state.observer,transition:state.confirmed,now:job.now,after:job.after??null});
  const extra=code=>{comparison.issueCount++;if(comparison.issues.length<256)comparison.issues.push({code,objectId:null});comparison.issuesTruncated=comparison.issueCount>comparison.issues.length;};
  if(files.activeJournal.summary.pendingEvents>0)extra('TARGET_NATIVE_JOURNAL_DELIVERY_UNCONFIRMED');
  if(files.activeJournal.summary.acknowledgedSequence!==comparison.sample?.engineCursor)extra('TARGET_NATIVE_CORE_CURSOR_DIFFER');
  comparison.reportsMatched=comparison.issueCount===0;
  db.exec('COMMIT');return{identity:state.identity,identityDigest:state.identityDigest,guardDigest:state.guardDigest,files,comparison};
 }finally{db.close();}
}
if(parentPort){try{parentPort.postMessage({ok:true,result:inspectTarget(workerData)});}catch(e){parentPort.postMessage({ok:false,code:typeof e.code==='string'&&/^[A-Z_0-9]{1,100}$/.test(e.code)?e.code:'TARGET_INSPECTION_FAILED'});}}
