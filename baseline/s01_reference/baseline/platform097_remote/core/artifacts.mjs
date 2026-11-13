import {readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

export const READY17_ARTIFACT_URL='/api/hub/artifacts/extremelab-ready17';
const filename='ExtremeLabReady17Local.algo';
const relative='integrations/ctrader-extremelab17';
const output='artifacts/'+filename;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// Only this shipped artifact is downloadable. No filename, filesystem path or
// URL from a request or a build report is used as a source. Keep the verified
// bytes in memory so a later file replacement cannot change what is delivered.
export async function loadReady17Artifact(root){
  const absent=status=>({descriptor:Object.freeze({available:false,status,filename,url:null}),bytes:null});
  try{
    const reportPath=join(root,relative,'docs/BUILD-RESULT.json'),artifactPath=join(root,relative,output);
    const stats=await Promise.all([lstat(reportPath),lstat(artifactPath)]);
    if(stats.some(s=>!s.isFile()||s.isSymbolicLink())||stats[0].size>131072||stats[1].size>16*1024*1024)return absent('invalid');
    const [reportBytes,bytes]=await Promise.all([readFile(reportPath),readFile(artifactPath)]);
    if(reportBytes.length>131072||bytes.length>16*1024*1024)return absent('invalid');
    const report=JSON.parse(reportBytes.toString('utf8'));
    if(report.output!==output||report.robot!=='ExtremeLabReady17Local'||report.typeName!=='cAlgo.Robots.ExtremeLabReady17Local'
      ||report.parameterCount!==73||!['net10.0','net6.0'].includes(report.framework)
      ||!Number.isSafeInteger(report.bytes)||report.bytes!==bytes.length
      ||typeof report.sha256!=='string'||!/^[a-f0-9]{64}$/.test(report.sha256)||sha256(bytes)!==report.sha256)return absent('invalid');
    if(bytes.length<20||bytes.subarray(0,5).toString('hex')!=='616c676f02')return absent('invalid');
    const length=bytes.readUInt32BE(5);
    if(length<10||length>1048576||9+length>=bytes.length)return absent('invalid');
    const metadata=JSON.parse(gunzipSync(bytes.subarray(9,9+length),{maxOutputLength:1048576}).toString('utf8'));
    const robot=metadata.Types?.[0];
    if(metadata.TargetFramework!==report.framework||metadata.Types?.length!==1||robot?.FriendlyName!==report.robot
      ||robot.TypeName!==report.typeName||robot.Flags!=='Robot'||robot.Parameters?.length!==report.parameterCount)return absent('invalid');
    if(report.framework==='net10.0'&&report.minimumCTraderVersion!=='5.10')return absent('invalid');
    const descriptor=Object.freeze({available:true,status:report.framework==='net10.0'?'verified':'legacy_compatibility',filename,
      sha256:report.sha256,bytes:bytes.length,targetFramework:report.framework,
      minimumCTraderVersion:report.minimumCTraderVersion||null,url:READY17_ARTIFACT_URL});
    return {descriptor,bytes};
  }catch(error){return absent(error?.code==='ENOENT'?'missing':'invalid');}
}
