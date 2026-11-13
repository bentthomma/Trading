/** Local read-only installation/artifact evidence. Hashes prove consistency of
 * the selected files, NOT their publisher, loaded process or broker authority. */
import {dirname,basename,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {canonical,digest} from './schema.mjs';
import {verifyInstalledStage,readStageJson,readStageFile,checkedStagePath} from './native-stage-evidence.mjs';
import {hashString,transitionHash,BUILD_TRANSITION_SAFETY} from './journal-build-lineage.mjs';
const SOURCE_ALGO_SHA=JSON.parse(readFileSync(new URL('../integrations/ctrader-th3revolution20/artifacts/BUILD-RESULT.json',import.meta.url),'utf8')).sha256;
export const TARGET_EVIDENCE_SAFETY=Object.freeze({grantsTrading:false,entryHoldStillRequired:true,writerHandoverVerified:false,targetBinaryExecuted:false,targetBinarySourceBindingVerified:false,independentBrokerVerified:false,nativeFileLocksHeldByCore:false});
const INSTALL_SAFETY=Object.freeze({grantsTrading:false,brokerStateVerified:false,targetBinaryVerified:false,writerHandoverVerified:false,liveCoreChecked:false,entryHoldStillRequired:true});
const bad=code=>{throw Object.assign(Error(code),{code});};
const eq=(a,b)=>canonical(a)===canonical(b);
function shape(x,keys){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))bad('TARGET_INSTALL_SHAPE');}
function record(path){const r=readStageJson(path);if(r.data.toString('utf8')!==canonical(r.value)+'\n')bad('TARGET_INSTALL_NONCANONICAL');return r;}
function at(t){if(typeof t!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|\+00:00)$/.test(t)||(!Number.isFinite(Date.parse(t))||new Date(Date.parse(t)).toISOString().slice(0,19)!==t.slice(0,19)))bad('TARGET_INSTALL_TIME');return Date.parse(t);}
function artifact(path){
 path=checkedStagePath(path);if(!path.toLowerCase().endsWith('.algo'))bad('TARGET_ARTIFACT_TYPE');
 const b=readStageFile(path,16*1024*1024),sha256=createHash('sha256').update(b).digest('hex');
 if(sha256===SOURCE_ALGO_SHA)bad('TARGET_ARTIFACT_IS_SOURCE_BUILD');
 if(b.length<20||b.subarray(0,5).toString('hex')!=='616c676f02')bad('TARGET_ARTIFACT_METADATA');
 const n=b.readUInt32BE(5);if(n<10||n>1048576||9+n>=b.length)bad('TARGET_ARTIFACT_METADATA');let m;
 try{m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(gunzipSync(b.subarray(9,9+n),{maxOutputLength:1048576})));}catch{bad('TARGET_ARTIFACT_METADATA');}
 const r=m.Types?.[0],params=r?.Parameters;
 if(m.TargetFramework!=='net10.0'||m.Flags!=='Robot'||m.Types?.length!==1||r?.FriendlyName!=='Th3Revolution20'||r?.TypeName!=='cAlgo.Robots.Th3Revolution20'||r?.Flags!=='Robot'||!Array.isArray(params)||params.length<1||params.length>200)bad('TARGET_ARTIFACT_METADATA');
 const mode=params.filter(p=>p.PropertyName==='HubMode');if(mode.length!==1||mode[0].ParameterType!=='Enum'||mode[0].DefaultValue!==0||mode[0].EnumValues?.Observe!==0)bad('TARGET_ARTIFACT_DEFAULT_NOT_OBSERVE');
 return{path,sha256,bytes:b.length,metadataHash:digest(m),robot:r.TypeName,framework:m.TargetFramework,parameters:params.length,defaultObserve:true,association:'HUMAN_SELECTED_LOCAL_FILE_NOT_LOADED_BINARY_ATTESTATION',sourceBindingVerified:false,executed:false};
}
/** Parameters are selected by a locally authenticated human and bound by the
 * real confirmed Core transition. Never run source, target or an imported exe. */
export function inspectTargetInstall({installDirectory,artifactPath,confirmed,now}){
 const directory=checkedStagePath(installDirectory,true),request=record(join(directory,'request.json')),receipt=record(join(directory,'receipt.json'));
 const q=request.value,r=receipt.value;shape(q,['format','reviewDigest','review','preparedAtUtc']);shape(r,['format','reviewDigest','contextDigest','coreReceiptHash','sourceSHA256','targetSHA256','preservedStateSHA256','completedAtUtc','nativeJournalInstalled','safety']);
 if(q.format!=='th3.native-journal-install.request/1'||r.format!=='th3.native-journal-install.receipt/1'||!hashString(q.reviewDigest)||digest(q.review)!==q.reviewDigest||r.reviewDigest!==q.reviewDigest||r.nativeJournalInstalled!==true||!eq(r.safety,INSTALL_SAFETY))bad('TARGET_INSTALL_RECEIPT');
 const v=q.review;shape(v,['format','contextFile','contextFileSHA256','contextDigest','coreReceiptHash','journalPath','sourceSHA256','targetSHA256','preservedStateSHA256','builds','sidecars','safety']);
 if(v.format!=='th3.native-journal-install.review/1'||!eq(v.safety,INSTALL_SAFETY)||['contextDigest','coreReceiptHash','sourceSHA256','targetSHA256','preservedStateSHA256'].some(k=>!hashString(v[k])||v[k]!==r[k]))bad('TARGET_INSTALL_RECEIPT');
 if(directory!==resolve(dirname(v.journalPath),'native-build-install',basename(v.journalPath,'.jsonl'),q.reviewDigest))bad('TARGET_INSTALL_LOCATION');
 const cfile=readStageJson(v.contextFile);if(cfile.hash!==v.contextFileSHA256)bad('TARGET_CONTEXT_CHANGED');const top=cfile.value;
 shape(top,['format','contextDigest','context']);const c=top.context;shape(c,['format','exportedAt','expiresAt','reviewId','reviewDigest','review','receipt','hold','safety']);
 if(top.format!=='th3.native-journal-install.context/1'||top.contextDigest!==digest(c)||v.contextDigest!==top.contextDigest||c.format!=='th3.core-native-install.snapshot/1'||c.reviewId!==confirmed.reviewId||c.reviewDigest!==confirmed.reviewDigest||!eq(c.review,confirmed.review)||!eq(c.receipt,confirmed.receipt)||!eq(c.hold,confirmed.hold))bad('TARGET_CONTEXT_CORE_MISMATCH');
 const contextSafety={grantsTrading:false,liveCoreCheckedByNative:false,targetBinaryVerified:false,brokerStateVerified:false,writerHandoverVerified:false,requiresSeparateNativeConsent:true,entryHoldStillRequired:true};
 if(!eq(c.safety,contextSafety)||!eq(c.receipt.safety,BUILD_TRANSITION_SAFETY)||c.receipt.receiptHash!==transitionHash(c.receipt)||c.receipt.receiptHash!==v.coreReceiptHash)bad('TARGET_CONTEXT_SAFETY');
 const prepared=at(q.preparedAtUtc),completed=at(r.completedAtUtc),exported=at(c.exportedAt),expires=at(c.expiresAt);
 if(expires-exported!==300000||prepared<exported||prepared>expires||completed<prepared||completed>now+5000||at(c.receipt.confirmedAt)>exported)bad('TARGET_INSTALL_TIME');
 const stage=verifyInstalledStage(c.review.evidence.stageDirectory),s=stage.stageReview;
 if(!eq(stage.evidence,c.review.evidence)||stage.evidenceDigest!==c.review.evidenceDigest||!eq(v.builds,s.builds)||!eq(v.sidecars,s.sidecars)||v.journalPath!==s.journalPath||v.sourceSHA256!==s.sourceSHA256||v.targetSHA256!==s.targetCandidateSHA256||v.preservedStateSHA256!==s.preservedStateSHA256)bad('TARGET_STAGE_BINDING');
 if(stage.active.additionalNativeIntents!==0)bad('TARGET_NEW_NATIVE_INTENT_WHILE_HELD');
 const a=artifact(artifactPath);
 const immutable={format:'th3.target-install-evidence/1',installDirectory:directory,requestSHA256:request.hash,receiptSHA256:receipt.hash,installReviewDigest:q.reviewDigest,contextDigest:top.contextDigest,coreReceiptHash:r.coreReceiptHash,stageEvidenceDigest:stage.evidenceDigest,sourceBuild:stage.evidence.source.build,targetBuild:stage.evidence.target.build,installedOriginalTargetSHA256:r.targetSHA256,completedAtUtc:r.completedAtUtc,artifact:a,safety:TARGET_EVIDENCE_SAFETY};
 return{immutable,immutableDigest:digest(immutable),activeJournal:stage.active,criticalReferenceCount:stage.criticalReferences.length,criticalReferencesDigest:digest(stage.criticalReferences)};
}
