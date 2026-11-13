import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail, object } from './errors.mjs';
import { readActiveJob, readStoredJobs, isTerminal, pidAlive, jobId as validateJobId } from './maintenance-journal.mjs';

// One OS-backed guard for the Core, offline restore and crash recovery. The
// visible PID record is diagnostic ownership metadata, never the primary lock.
export function acquireProfileLock(directory,{role='core',jobId=null}={}){
  if(!['core','maintenance'].includes(role))fail('PROFILE_ROLE_INVALID','Der lokale Profilzugriff ist ungültig.',500);
  directory=resolve(directory);const ownerId=randomUUID(),pid=process.pid,lockPath=join(directory,'runtime.lock');
  let guard=null,held=false,released=false;
  const current=()=>{try{return JSON.parse(readFileSync(lockPath,'utf8'));}catch{return null;}};
  function release(){
    if(released)return;released=true;
    if(held){const recorded=current();if(recorded?.pid===pid&&recorded?.owner===ownerId)try{unlinkSync(lockPath);}catch{}}
    held=false;guard?.close();guard=null;
  }
  function assertHeld(){
    const recorded=current();if(released||!guard||!held||recorded?.pid!==pid||recorded?.owner!==ownerId)
      fail('PROFILE_OWNERSHIP_CHANGED','Der lokale Profilbesitz konnte nicht mehr bestätigt werden.',409);
  }
  function setPort(port){
    assertHeld();if(!Number.isSafeInteger(port)||port<1||port>65535)fail('PORT_INVALID','Port ist nicht gültig.');
    const temporary=lockPath+'.'+ownerId+'.tmp';
    try{writeFileSync(temporary,JSON.stringify({pid,port,owner:ownerId,role}),{flag:'wx',mode:0o600});renameSync(temporary,lockPath);}
    finally{if(existsSync(temporary))unlinkSync(temporary);}
  }
  try{
    try{mkdirSync(directory,{recursive:true,mode:0o700});guard=new DatabaseSync(join(directory,'instance-guard.sqlite'),{timeout:0,allowExtension:false});guard.exec('PRAGMA busy_timeout=0;BEGIN EXCLUSIVE;');}
    catch(error){if(error?.errcode===5||error?.errcode===6)fail('ALREADY_RUNNING','Die Anwendung oder eine Wiederherstellung verwendet dieses Profil bereits.',409);fail('DATA_DIRECTORY_UNAVAILABLE','Der Datenordner kann nicht exklusiv geöffnet werden. Einen beschreibbaren eigenen Ordner auf diesem Computer wählen.',503);}
    const active=readActiveJob(directory),unfinished=readStoredJobs(directory).filter(job=>!isTerminal(job));
    if(active&&!isTerminal(active)&&!unfinished.some(job=>job.id===active.id))unfinished.push(active);
    for(const pending of unfinished){
      if(role==='core'||jobId===null||validateJobId(jobId)!==pending.id)fail('MAINTENANCE_IN_PROGRESS','Eine Wiederherstellung ist vorbereitet oder muss nach einem Abbruch zuerst geklärt werden.',409);
      if(pending.workerPid!==null&&pending.workerPid!==pid&&pidAlive(pending.workerPid))fail('MAINTENANCE_IN_PROGRESS','Der Wiederherstellungsprozess arbeitet noch an diesem Profil.',409);
    }
    if(existsSync(lockPath)){
      let old;try{old=JSON.parse(readFileSync(lockPath,'utf8'));}catch{fail('LOCK_INVALID','Die Startsperre ist beschädigt. Laufenden Dienst prüfen.',409);}
      if(!object(old)||!Number.isSafeInteger(old.pid)||old.pid<1||(old.port!==null&&(!Number.isSafeInteger(old.port)||old.port<1||old.port>65535)))fail('LOCK_INVALID','Die Startsperre ist beschädigt. Laufenden Dienst prüfen.',409);
      if(pidAlive(old.pid))fail('ALREADY_RUNNING','Die Anwendung oder ein Wartungsprozess läuft bereits. Das bestehende Startfenster prüfen.',409);
      unlinkSync(lockPath);
    }
    try{writeFileSync(lockPath,JSON.stringify({pid,port:null,owner:ownerId,role}),{flag:'wx',mode:0o600});held=true;}
    catch(error){if(error?.code==='EEXIST')fail('ALREADY_RUNNING','Eine weitere Instanz wird bereits gestartet. Das andere Startfenster prüfen.',409);throw error;}
    return {directory,ownerId,pid,role,setPort,assertHeld,release};
  }catch(error){release();throw error;}
}
