import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {authenticated} from '../lib/security.mjs';
const filename='ExtremeLabReady_1_2_1_Kandidat.algo';
let artifact;
function loadArtifact(){
 if(artifact)return artifact;
 const root=path.join(process.cwd(),'release-artifacts');
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const data=fs.readFileSync(path.join(root,filename));
 if(metadata.filename!==filename||data.length!==metadata.bytes||createHash('sha256').update(data).digest('hex')!==metadata.sha256)throw Error('ARTIFACT_INTEGRITY');
 artifact={metadata,data};return artifact;
}
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 const url=new URL(req.url,'https://internal.invalid');
 const action=url.searchParams.get('action')||'download';
 if(!['download','manifest'].includes(action)||[...url.searchParams.keys()].some(k=>k!=='action')||url.searchParams.getAll('action').length>1)return res.status(400).json({error:'INVALID_REQUEST'});
 if(action==='download'&&!authenticated(req))return res.status(401).json({error:'Bitte zuerst im Decision Desk anmelden. Kein Brokerpasswort eingeben.'});
 try{
  const {metadata,data}=loadArtifact();
  if(action==='manifest')return res.status(200).json(metadata);
  res.statusCode=200;res.setHeader('Content-Type','application/octet-stream');
  res.setHeader('Content-Disposition','attachment; filename="'+filename+'"');res.setHeader('Content-Length',String(data.length));res.setHeader('X-Artifact-SHA256',metadata.sha256);
  return res.end(req.method==='HEAD'?undefined:data);
 }catch{return res.status(503).json({error:'BUILD_ARTIFACT_UNAVAILABLE'});}
}
