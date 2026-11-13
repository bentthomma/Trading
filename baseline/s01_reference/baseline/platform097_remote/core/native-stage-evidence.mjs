/** Read-only verification of local staging bytes. It does NOT run native code,
 * acquire the engine's cooperative .NET lock or attest to a stopped broker writer.
 * Used in a bounded worker; all imported paths remain local and non-symlinked. */
import {readFileSync,openSync,closeSync,fstatSync,readSync,lstatSync,readdirSync,constants} from 'node:fs';
import {resolve,isAbsolute,dirname,basename,join,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,digest} from './schema.mjs';
import {checkedAccount,checkedBuild,namedId,hashString,sequenceString} from './journal-build-lineage.mjs';
const MAX_JOURNAL=64*1024*1024,MAX_FILES_BYTES=32*1024*1024;
const MANIFEST='integrations/ctrader-th3revolution20/SOURCE_BUILD_MANIFEST.json';
const PROJECT='integrations/ctrader-th3revolution20/src/ExtremeLabMobile.csproj';
const IDENTITY='integrations/ctrader-th3revolution20/src/Th3BuildIdentity20.g.cs';
const SAFETY=Object.freeze({executionGrant:false,activeJournalReplaced:false,writerHandoverVerified:false,coreTransitionVerified:false,targetBinaryVerified:false,brokerStateVerified:false});
const supported=JSON.parse(readFileSync(new URL('../integrations/native-build-staging20/supported-source.json',import.meta.url),'utf8'));
const error=code=>{const e=new Error(code);e.code=code;throw e;};
const shape=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))error('BUILD_STAGE_SHAPE_INVALID');};
const sha=x=>createHash('sha256').update(x).digest('hex');
function safePath(path,directory=false){
 if(typeof path!=='string'||!isAbsolute(path)||path.length>4096||path.includes('\0'))error('BUILD_STAGE_PATH_INVALID');const p=resolve(path);
 for(let x=p;;x=dirname(x)){const st=lstatSync(x);if(st.isSymbolicLink())error('BUILD_STAGE_LINK_DENIED');if(x===p&&(directory?!st.isDirectory():!st.isFile()))error('BUILD_STAGE_PATH_INVALID');if(x===dirname(x))break;}return p;
}
function bytes(path,max){
 const p=safePath(path),before=lstatSync(p);if(before.size<1||before.size>max)error('BUILD_STAGE_SIZE_LIMIT');const fd=openSync(p,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{const st=fstatSync(fd);if(!st.isFile()||st.ino!==before.ino||st.dev!==before.dev||st.size!==before.size)error('BUILD_STAGE_FILE_CHANGED');const out=Buffer.alloc(st.size);let pos=0;while(pos<out.length){const n=readSync(fd,out,pos,out.length-pos,pos);if(!n)error('BUILD_STAGE_FILE_CHANGED');pos+=n;}const after=fstatSync(fd);if(after.size!==st.size||after.ino!==st.ino||after.mtimeMs!==st.mtimeMs)error('BUILD_STAGE_FILE_CHANGED');return out;}finally{closeSync(fd);}
}
function jsonFile(path,max=1024*1024){const data=bytes(path,max);let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{error('BUILD_STAGE_JSON_INVALID');}return{value,data,hash:sha(data)};}
function under(root,path){if(typeof path!=='string'||path.length>1024||path.includes('\\')||path.startsWith('/')||path.split('/').some(x=>!x||x==='.'||x==='..'))error('BUILD_INPUT_PATH_INVALID');const p=resolve(root,path);if(!p.startsWith(root+sep))error('BUILD_INPUT_PATH_INVALID');return p;}
function product(root){
 root=safePath(root,true);const mf=jsonFile(under(root,MANIFEST)),m=mf.value;shape(m,['schema','engine','version','sourceHash','algorithm','files','nativeExecutionVerified']);checkedBuild({engine:m.engine,version:m.version,sourceHash:m.sourceHash});
 if(m.schema!==1||m.algorithm!==supported.algorithm||!Array.isArray(m.files)||!m.files.length||m.files.length>256||typeof m.nativeExecutionVerified!=='boolean')error('BUILD_MANIFEST_INVALID');
 const map=new Map();let total=0;for(const f of m.files){shape(f,['path','bytes','sha256']);if(map.has(f.path)||!hashString(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>4*1024*1024)error('BUILD_MANIFEST_INVALID');const data=bytes(under(root,f.path),4*1024*1024);total+=data.length;if(total>MAX_FILES_BYTES||f.bytes!==data.length||f.sha256!==sha(data))error('BUILD_INPUT_MISMATCH');map.set(f.path,f);}
 const actual=[];for(const folder of ['integrations/ctrader-th3revolution20/src','sdk'])for(const item of readdirSync(under(root,folder),{withFileTypes:true})){const p=join(under(root,folder),item.name);if(item.isSymbolicLink())error('BUILD_STAGE_LINK_DENIED');if(item.isDirectory()){if(!['bin','obj'].includes(item.name)&&!(folder==='sdk'&&item.name==='tests'))error('NESTED_BUILD_INPUT_REQUIRES_ADAPTER');continue;}if(!item.isFile())error('BUILD_INPUT_PATH_INVALID');if(/\.(cs|csproj|json)$/i.test(item.name)&&folder+'/'+item.name!==IDENTITY)actual.push(folder+'/'+item.name);}
 actual.sort();if(canonical(actual)!==canonical([...map.keys()].sort()))error('BUILD_INPUT_SET_MISMATCH');const lines=[...map.values()].sort((a,b)=>a.path<b.path?-1:1).map(f=>f.sha256+'  '+f.path+'\n').join('');if(sha(lines)!==m.sourceHash)error('BUILD_SOURCE_HASH_MISMATCH');
 const identity=bytes(under(root,IDENTITY),8192).toString('utf8').replace(/\r\n/g,'\n');const expected='// Generated by scripts/generate-source-identity.mjs; excluded from its own input set.\nnamespace cAlgo.Robots\n{\n internal static class Th3BuildIdentity20\n {\n  public const string Version = "'+m.version+'";\n  public const string SourceHash = "'+m.sourceHash+'";\n }\n}\n';if(identity!==expected)error('GENERATED_IDENTITY_MISMATCH');
 return{manifest:m,files:map,descriptor:{root,build:{engine:m.engine,version:m.version,sourceHash:m.sourceHash},manifestSHA256:mf.hash,inputs:map.size,sourceSetSHA256:sha(actual.join('\n'))}};
}
function buildPair(plan){
 shape(plan,['rule','source','target','publisherAuthenticated','targetBinaryVerified']);if(plan.rule!=='identical-source-and-sdk-only-project-version/1'||plan.publisherAuthenticated!==false||plan.targetBinaryVerified!==false)error('BUILD_COMPATIBILITY_INVALID');
 const source=product(plan.source.root),target=product(plan.target.root);if(canonical(source.descriptor)!==canonical(plan.source)||canonical(target.descriptor)!==canonical(plan.target))error('BUILD_STAGE_MANIFEST_CHANGED');
 const a=source.manifest,b=target.manifest;if(a.sourceHash!==supported.sourceHash||a.version!==supported.version||canonical([...a.files].sort((x,y)=>x.path<y.path?-1:1))!==canonical([...supported.files].sort((x,y)=>x.path<y.path?-1:1)))error('SOURCE_BUILD_NOT_SUPPORTED');
 if(a.sourceHash===b.sourceHash||a.version===b.version||source.descriptor.root===target.descriptor.root||canonical([...source.files.keys()].sort())!==canonical([...target.files.keys()].sort()))error('BUILD_PAIR_INVALID');
 for(const [path,f]of source.files){const q=target.files.get(path);if(path!==PROJECT&&(q.sha256!==f.sha256||q.bytes!==f.bytes))error('MIGRATION_ADAPTER_REQUIRED');}
 const old=bytes(under(source.descriptor.root,PROJECT),65536).toString('utf8'),next=bytes(under(target.descriptor.root,PROJECT),65536).toString('utf8');const oldTag='<Version>'+a.version+'</Version>',newTag='<Version>'+b.version+'</Version>';
 // Narrower than the native XML normalizer on purpose: do not grant arbitrary
 // XML/compiler changes. Any other byte/whitespace change needs another adapter.
 if(old.split(oldTag).length!==2||next.split(newTag).length!==2||old.replace(oldTag,'<Version>__VERSION__</Version>')!==next.replace(newTag,'<Version>__VERSION__</Version>'))error('MIGRATION_ADAPTER_REQUIRED');return{source:source.descriptor,target:target.descriptor};
}
function nativeState(data){
 if(data.length===0||data.at(-1)!==10)error('NATIVE_STAGE_INCOMPLETE');let previous='0'.repeat(64),scope,ack=0n,highest=0n;const keys=new Map(),intents=new Map(),pending=new Map();let number=0;
 const text=new TextDecoder('utf-8',{fatal:true}).decode(data);for(const line of text.split('\n').slice(0,-1)){
  if(line.length>MAX_JOURNAL)error('NATIVE_STAGE_LIMIT');let row;try{row=JSON.parse(line);}catch{error('NATIVE_STAGE_INVALID');}shape(row,['previousHash','body','checksum']);if(canonical(row)!==line)error('NATIVE_STAGE_NONCANONICAL');if(row.previousHash!==previous||row.checksum!==digest({previousHash:previous,body:row.body}))error('NATIVE_STAGE_CHECKSUM');previous=row.checksum;const v=row.body;
  if(number++===0){shape(v,['kind','format','botId','streamId','account','build','acknowledgedSequence','knownKeys','nativeIntents']);if(v.kind!=='header'||v.format!==1||!namedId(v.botId)||!namedId(v.streamId)||!sequenceString(v.acknowledgedSequence)||!Array.isArray(v.knownKeys)||!Array.isArray(v.nativeIntents))error('NATIVE_STAGE_INVALID');checkedAccount(v.account);checkedBuild(v.build);scope={botId:v.botId,streamId:v.streamId,account:v.account,build:v.build};ack=highest=BigInt(v.acknowledgedSequence);if(v.knownKeys.length>100000||v.nativeIntents.length>100000)error('NATIVE_STAGE_LIMIT');for(const k of v.knownKeys){if(keys.has(k.key))error('NATIVE_STAGE_DUPLICATE');keys.set(k.key,k);}for(const n of v.nativeIntents){if(intents.has(n.intentId))error('NATIVE_STAGE_DUPLICATE');intents.set(n.intentId,n);}continue;}
  if(v.kind==='event'){shape(v,['kind','key','event']);const e=v.event;if(!e||!sequenceString(e.sequence)||BigInt(e.sequence)!==highest+1n||e.payloadHash!==digest(e.payload))error('NATIVE_STAGE_SEQUENCE');highest++;pending.set(e.sequence,e);if(v.key!==null){const item={key:v.key,identityHash:digest({type:e.type,sourceTime:e.sourceTime,correlationId:e.correlationId,causationId:e.causationId,payloadHash:e.payloadHash}),receipt:{eventId:e.eventId,sequence:e.sequence,payloadHash:e.payloadHash}};if(keys.has(v.key)&&canonical(keys.get(v.key))!==canonical(item))error('NATIVE_STAGE_KEY_CONFLICT');keys.set(v.key,item);}}
  else if(v.kind==='native_intent'){shape(v,['kind','intent']);if(intents.has(v.intent.intentId))error('NATIVE_STAGE_DUPLICATE');intents.set(v.intent.intentId,v.intent);}
  else if(v.kind==='ack'){shape(v,['kind','sequence']);if(!sequenceString(v.sequence)||BigInt(v.sequence)<ack||BigInt(v.sequence)>highest)error('NATIVE_STAGE_ACK');ack=BigInt(v.sequence);for(const k of pending.keys())if(BigInt(k)<=ack)pending.delete(k);}
  else error('NATIVE_STAGE_KIND');
  if(keys.size>100000||intents.size>100000||pending.size>4096)error('NATIVE_STAGE_LIMIT');
 }
 for(const k of keys.values()){shape(k,['key','identityHash','receipt']);shape(k.receipt,['eventId','sequence','payloadHash']);if(typeof k.key!=='string'||k.key.length<1||k.key.length>200||/[^\x21-\x7e]/.test(k.key)||!hashString(k.identityHash)||!namedId(k.receipt.eventId)||!sequenceString(k.receipt.sequence)||k.receipt.sequence==='0'||BigInt(k.receipt.sequence)>highest||!hashString(k.receipt.payloadHash))error('NATIVE_STAGE_CRITICAL_INVALID');}
 for(const n of intents.values()){shape(n,['intentId','payloadHash','payload']);if(!namedId(n.intentId)||n.payloadHash!==digest(n.payload))error('NATIVE_STAGE_INTENT_INVALID');}
 if(!scope)error('NATIVE_STAGE_INVALID');const summary={acknowledgedSequence:String(ack),highestSequence:String(highest),pendingEvents:pending.size,criticalKeys:keys.size,nativeIntents:intents.size};
 const preserved={botId:scope.botId,streamId:scope.streamId,account:scope.account,ack:String(ack),highest:String(highest),pending:[...pending.values()],knownKeys:[...keys.values()].sort((a,b)=>a.key<b.key?-1:1),nativeIntents:[...intents.values()].sort((a,b)=>a.intentId<b.intentId?-1:1)};
 return{scope,summary,preservedHash:digest(preserved),criticalReferences:preserved.knownKeys,preserved};
}
function inspectStage(stageDirectory,installed=false){
 const dir=safePath(stageDirectory,true),request=jsonFile(join(dir,'request.json')),receipt=jsonFile(join(dir,'receipt.json')),q=request.value,r=receipt.value;
 shape(q,['format','reviewDigest','review']);if(q.format!=='th3.native-build-stage.request/1'||!hashString(q.reviewDigest)||digest(q.review)!==q.reviewDigest||basename(dir)!==q.reviewDigest)error('BUILD_STAGE_REVIEW_INVALID');
 if(request.data.toString('utf8')!==canonical(q)+'\n'||receipt.data.toString('utf8')!==canonical(r)+'\n')error('BUILD_STAGE_NONCANONICAL');
 const v=q.review;shape(v,['format','journalPath','builds','originalScope','sourceSHA256','sourceBytes','targetCandidateSHA256','targetCandidateBytes','preservedStateSHA256','state','sidecars','safety']);if(v.format!=='th3.native-build-stage.review/1'||canonical(v.safety)!==canonical(SAFETY)||!hashString(v.sourceSHA256)||!hashString(v.targetCandidateSHA256)||!hashString(v.preservedStateSHA256))error('BUILD_STAGE_REVIEW_INVALID');
 shape(v.originalScope,['botId','streamId','account','build']);checkedAccount(v.originalScope.account);checkedBuild(v.originalScope.build);if(!/^[A-Za-z0-9_-]{1,100}$/.test(v.originalScope.botId)||!namedId(v.originalScope.streamId)||!/^[A-Za-z0-9_-]{1,100}$/.test(v.originalScope.account.id))error('BUILD_STAGE_SCOPE_INVALID');
 const sourcePath=safePath(v.journalPath);if(basename(sourcePath)!=='journal20-'+v.originalScope.botId+'.jsonl'||dirname(dirname(dir))!==join(dirname(sourcePath),'native-build-staging')||basename(dirname(dir))!==basename(sourcePath,'.jsonl'))error('BUILD_STAGE_LOCATION_MISMATCH');
 shape(r,['format','reviewDigest','sourceFile','targetCandidateFile','sourceSHA256','targetCandidateSHA256','preservedStateSHA256','completedAtUtc','safety']);if(r.format!=='th3.native-build-stage.receipt/1'||r.reviewDigest!==q.reviewDigest||r.sourceFile!=='source.journal.jsonl'||r.targetCandidateFile!=='candidate.journal.jsonl'||r.sourceSHA256!==v.sourceSHA256||r.targetCandidateSHA256!==v.targetCandidateSHA256||r.preservedStateSHA256!==v.preservedStateSHA256||canonical(r.safety)!==canonical(SAFETY)||!Number.isFinite(Date.parse(r.completedAtUtc)))error('BUILD_STAGE_RECEIPT_INVALID');
 const pair=buildPair(v.builds);if(canonical(pair.source.build)!==canonical(v.originalScope.build))error('BUILD_STAGE_SCOPE_INVALID');
 for(const [n,h]of [['sourceBytes',v.sourceBytes],['targetCandidateBytes',v.targetCandidateBytes]])if(!Number.isSafeInteger(h)||h<1||h>MAX_JOURNAL)error('BUILD_STAGE_SIZE_LIMIT');
 const a=bytes(join(dir,r.sourceFile),MAX_JOURNAL),b=bytes(join(dir,r.targetCandidateFile),MAX_JOURNAL);if(a.length!==v.sourceBytes||sha(a)!==v.sourceSHA256||b.length!==v.targetCandidateBytes||sha(b)!==v.targetCandidateSHA256)error('BUILD_STAGE_BYTES_CHANGED');
 // The current source still has to match. This is a byte check, not proof of
 // an exclusive account writer; Core consequently keeps a permanent entry hold.
 const current=bytes(sourcePath,MAX_JOURNAL);if(!installed&&(sha(current)!==v.sourceSHA256||current.length!==v.sourceBytes))error('BUILD_STAGE_SOURCE_ADVANCED');
 const sa=nativeState(a),sb=nativeState(b);if(canonical(sa.scope)!==canonical(v.originalScope)||canonical(sb.scope)!==canonical({...v.originalScope,build:pair.target.build})||canonical(sa.summary)!==canonical(v.state)||canonical(sa.summary)!==canonical(sb.summary)||sa.summary.pendingEvents!==0||sa.summary.acknowledgedSequence!==sa.summary.highestSequence||sa.preservedHash!==v.preservedStateSHA256||sb.preservedHash!==sa.preservedHash)error('BUILD_STAGE_PRESERVED_STATE_MISMATCH');
 if(!Array.isArray(v.sidecars)||v.sidecars.length!==4)error('BUILD_STAGE_SIDECAR_INVALID');const names=['positions_'+sa.scope.account.id+'.json','submissions_v5_'+sa.scope.account.id+'.json','pending_v18_'+sa.scope.account.id+'.json','hub-state-'+sa.scope.botId+'.json'];let total=0;
 for(let i=0;i<4;i++){const s=v.sidecars[i];shape(s,['name','present','bytes','sha256']);if(s.name!==names[i]||typeof s.present!=='boolean'||!Number.isSafeInteger(s.bytes)||s.bytes<0||s.bytes>16*1024*1024||(s.present?(!hashString(s.sha256)||s.bytes<1):(s.bytes!==0||s.sha256!==null)))error('BUILD_STAGE_SIDECAR_INVALID');
  if(s.present){const staged=jsonFile(join(dir,'sidecar-'+s.name+'.bytes'),16*1024*1024),active=installed?null:jsonFile(join(dirname(sourcePath),s.name),16*1024*1024);if(!staged.value||typeof staged.value!=='object'||staged.hash!==s.sha256||staged.data.length!==s.bytes||(!installed&&active.hash!==s.sha256))error('BUILD_STAGE_SIDECAR_CHANGED');total+=s.bytes;if(total>32*1024*1024)error('BUILD_STAGE_SIZE_LIMIT');}
  else{try{lstatSync(join(dir,'sidecar-'+s.name+'.bytes'));error('BUILD_STAGE_SIDECAR_CHANGED');}catch(e){if(e.code!=='ENOENT')throw e;}if(!installed){try{lstatSync(join(dirname(sourcePath),s.name));error('BUILD_STAGE_SIDECAR_CHANGED');}catch(e){if(e.code!=='ENOENT')throw e;}}}
 }
 const evidence={format:'th3.core-verified-stage/1',stageDirectory:dir,requestSHA256:request.hash,receiptSHA256:receipt.hash,stageReviewDigest:q.reviewDigest,sourceSHA256:v.sourceSHA256,targetCandidateSHA256:v.targetCandidateSHA256,preservedStateSHA256:v.preservedStateSHA256,source:pair.source,target:pair.target,scope:sa.scope,state:sa.summary,sidecars:v.sidecars,verification:'NODE_BYTE_MANIFEST_AND_CORE_MATCH_NOT_NATIVE_RUNTIME',nativeActivationAllowed:false};
 if(!installed)return{evidence,evidenceDigest:digest(evidence),criticalReferences:sa.criticalReferences};
 const active=nativeState(current);if(canonical(active.scope)!==canonical(sb.scope)||BigInt(active.summary.acknowledgedSequence)<BigInt(sb.summary.acknowledgedSequence))error('INSTALLED_JOURNAL_IDENTITY_MISMATCH');
 const activeKeys=new Map(active.preserved.knownKeys.map(k=>[k.key,k])),activeIntents=new Map(active.preserved.nativeIntents.map(k=>[k.intentId,k]));
 for(const k of sb.preserved.knownKeys)if(canonical(activeKeys.get(k.key))!==canonical(k))error('INSTALLED_CRITICAL_KEY_MISSING');
 for(const n of sb.preserved.nativeIntents)if(canonical(activeIntents.get(n.intentId))!==canonical(n))error('INSTALLED_NATIVE_INTENT_MISSING');
 return{evidence,evidenceDigest:digest(evidence),stageReview:v,stageReviewDigest:q.reviewDigest,stageCompletedAt:r.completedAtUtc,active:{journalPath:sourcePath,sha256:sha(current),bytes:current.length,scope:active.scope,summary:active.summary,additionalNativeIntents:activeIntents.size-sb.preserved.nativeIntents.length},criticalReferences:sa.criticalReferences};
}

// The original pre-install public entry remains strict and unchanged in purpose.
export function verifyNativeStage(path){return inspectStage(path,false);}
// Read-only POST-install evidence, never an execution permission. The original
// source/archive/candidate are all rechecked; the active target may have appended.
export function verifyInstalledStage(path){return inspectStage(path,true);}
export {bytes as readStageFile,jsonFile as readStageJson,safePath as checkedStagePath};
