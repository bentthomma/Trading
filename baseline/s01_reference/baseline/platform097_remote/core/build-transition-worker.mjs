import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {lstatSync} from 'node:fs';
import {inspectDatabaseSchema} from './store.mjs';
import {verifyNativeStage} from './native-stage-evidence.mjs';
import {coreBuildContext} from './core-build-context.mjs';
function inspect(job){
 const st=lstatSync(job.databasePath);if(!st.isFile()||st.isSymbolicLink())throw Object.assign(Error(),{code:'BUILD_SNAPSHOT_PATH_INVALID'});
 const db=new DatabaseSync(job.databasePath,{readOnly:true});
 try{db.exec('PRAGMA query_only=ON;BEGIN');if(!inspectDatabaseSchema(db).schemaCompatible)throw Object.assign(Error(),{code:'BUILD_SNAPSHOT_SCHEMA_INVALID'});
  const checked=verifyNativeStage(job.stageDirectory);const store={db,get:(key,fallback=null)=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):fallback}};
  const control={db,store,now:()=>job.now,rawBot:id=>{const row=db.prepare('SELECT * FROM bots WHERE id=?').get(id);if(!row)throw Object.assign(Error(),{code:'BOT_NOT_FOUND'});return row}};
  const state=coreBuildContext(control,job.botId,checked.evidence,{verifyEvents:true,criticalReferences:checked.criticalReferences});db.exec('COMMIT');
  return{evidence:checked.evidence,evidenceDigest:checked.evidenceDigest,coreDigest:state.digest,sourceRuntimeId:state.context.bot.runtimeId};
 }finally{db.close();}
}
if(parentPort){try{parentPort.postMessage({ok:true,result:inspect(workerData)});}catch(e){parentPort.postMessage({ok:false,code:typeof e.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(e.code)?e.code:'BUILD_STAGE_INSPECTION_FAILED'});}}
export {inspect};
