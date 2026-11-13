import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const REVOLUTION_ARTIFACTS=Object.freeze([
 Object.freeze({profileId:'th3rev.observer.v1',relative:'integrations/ctrader-observer20',filename:'Th3RevolutionObserver20_2_0_0_alpha4.algo',robot:'Th3RevolutionObserver20',url:'/api/hub/artifacts/th3revolution-observer20'}),
 Object.freeze({profileId:'th3rev.ready20.v1',relative:'integrations/ctrader-th3revolution20',filename:'Th3Revolution20_2_0_0_alpha5.algo',robot:'Th3Revolution20',url:'/api/hub/artifacts/th3revolution20'})
]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Only fixed, locally shipped paths. A request, report or runtime never selects
// an arbitrary file. A hash is integrity evidence, not publisher or host proof.
export async function loadRevolutionArtifact(root,profileId){
 const spec=REVOLUTION_ARTIFACTS.find(x=>x.profileId===profileId);if(!spec)throw Error('Unknown bundled artifact profile.');
 const absent=status=>({descriptor:Object.freeze({available:false,status,filename:spec.filename,url:null}),bytes:null});
 try{
  const reportPath=join(root,spec.relative,'artifacts/BUILD-RESULT.json'),artifactPath=join(root,spec.relative,'artifacts',spec.filename);
  const before=await Promise.all([lstat(reportPath),lstat(artifactPath)]);
  if(before.some(x=>!x.isFile()||x.isSymbolicLink())||before[0].size>131072||before[1].size>16*1024*1024)return absent('invalid');
  const [reportBytes,bytes]=await Promise.all([readFile(reportPath),readFile(artifactPath)]);
  const after=await Promise.all([lstat(reportPath),lstat(artifactPath)]);
  if(after.some((x,i)=>!x.isFile()||x.isSymbolicLink()||x.dev!==before[i].dev||x.ino!==before[i].ino||x.size!==before[i].size||x.mtimeMs!==before[i].mtimeMs||x.ctimeMs!==before[i].ctimeMs)||reportBytes.length!==before[0].size||bytes.length!==before[1].size)return absent('invalid');
  const report=JSON.parse(reportBytes.toString('utf8'));
  if(report.schema!==1||report.output!=='artifacts/'+spec.filename||report.robot!==spec.robot||report.typeName!=='cAlgo.Robots.'+spec.robot||report.framework!=='net10.0'||report.minimumCTraderVersion!=='5.10'||report.nativeExecutionVerified!==false||
   !Number.isSafeInteger(report.parameterCount)||report.parameterCount<1||report.parameterCount>200||report.bytes!==bytes.length||!/^[a-f0-9]{64}$/.test(report.sha256||'')||sha(bytes)!==report.sha256)return absent('invalid');
  if(bytes.length<20||bytes.subarray(0,5).toString('hex')!=='616c676f02')return absent('invalid');
  const length=bytes.readUInt32BE(5);if(length<10||length>1048576||9+length>=bytes.length)return absent('invalid');
  const metadata=JSON.parse(gunzipSync(bytes.subarray(9,9+length),{maxOutputLength:1048576}).toString('utf8')),robot=metadata.Types?.[0];
  if(metadata.TargetFramework!==report.framework||metadata.Types?.length!==1||robot?.FriendlyName!==spec.robot||robot.TypeName!==report.typeName||robot.Flags!=='Robot'||robot.Parameters?.length!==report.parameterCount)return absent('invalid');
  if(profileId==='th3rev.ready20.v1'){
   const mode=robot.Parameters.find(p=>p.PropertyName==='HubMode');
   if(mode?.ParameterType!=='Enum'||mode.EnumValues?.Observe!==0||mode.DefaultValue!==0)return absent('invalid');
  }
  return {descriptor:Object.freeze({available:true,status:'verified_candidate',filename:spec.filename,url:spec.url,sha256:report.sha256,bytes:bytes.length,targetFramework:report.framework,minimumCTraderVersion:report.minimumCTraderVersion,nativeExecutionVerified:false,publisherVerified:false}),bytes};
 }catch(error){return absent(error?.code==='ENOENT'?'missing':'invalid');}
}
export async function loadRevolutionArtifacts(root){
 return Object.fromEntries(await Promise.all(REVOLUTION_ARTIFACTS.map(async x=>[x.profileId,await loadRevolutionArtifact(root,x.profileId)])));
}
