import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sourceHash='9e919ec1a94a5c0c569d7b9f46811ae98fed92a02b74773ef12d1821a14d81a3';
const packed=Buffer.concat([0,1,2].map(i=>fs.readFileSync('bot-src.'+i)));
if(createHash('sha256').update(packed).digest('hex')!==sourceHash)throw Error('BOT_SOURCE_HASH_MISMATCH');
const files=JSON.parse(brotliDecompressSync(packed));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'extremelab-build-'));
const source=path.join(work,'src');fs.mkdirSync(source);
for(const [name,text]of Object.entries(files)){
 if(!/^[A-Za-z0-9]+\.(cs|csproj)$/.test(name)||typeof text!=='string')throw Error('INVALID_BOT_SOURCE');
 fs.writeFileSync(path.join(source,name),text);
}
const sdk=path.join(work,'dotnet'),installer=path.join(work,'install.sh');
const env={...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_SKIP_FIRST_TIME_EXPERIENCE:'1',DOTNET_SYSTEM_GLOBALIZATION_INVARIANT:'1',DOTNET_NOLOGO:'1',DOTNET_CLI_HOME:work,NUGET_PACKAGES:path.join(work,'packages')};
execFileSync('curl',['--fail','--silent','--show-error','--location','--max-time','60','https://dot.net/v1/dotnet-install.sh','-o',installer],{stdio:'inherit',timeout:65000});
execFileSync('bash',[installer,'--version','6.0.428','--install-dir',sdk,'--no-path'],{env,stdio:'inherit',timeout:240000});
let output;
try{output=execFileSync(path.join(sdk,'dotnet'),['build',path.join(source,'ExtremeLabMobile.csproj'),'-c','Release','--nologo','-warnaserror'],{env,encoding:'utf8',timeout:180000});}
catch(e){console.error(e.stdout?.toString()||'');throw e;}
console.log(output);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);}
const algos=walk(path.join(source,'bin','Release')).filter(x=>x.endsWith('.algo'));
if(algos.length!==1)throw Error('EXPECTED_EXACTLY_ONE_ALGO: '+algos.length);
const binary=fs.readFileSync(algos[0]);if(binary.length<10000||binary.length>2*1024*1024)throw Error('INVALID_ALGO_SIZE');
const out='release-artifacts';fs.mkdirSync(out,{recursive:true});
const filename='ExtremeLabReady_1_2_1_Kandidat.algo';
fs.writeFileSync(path.join(out,filename),binary);
const metadata={name:'ExtremeLabReady121',version:'1.2.1',filename,bytes:binary.length,sha256:createHash('sha256').update(binary).digest('hex'),sourceSha256:sourceHash,builtUtc:new Date().toISOString(),sdk:'6.0.428',automate:'1.0.21',buildSucceeded:true,warningsAsErrors:true,cloudRuntimeVerified:false,brokerExecutionVerified:false,onlineSenderDefault:false,previousInstanceConfirmationRequired:true,existingBotChanged:false,classification:'INTEGRATION_CANDIDATE_NOT_LIVE_RELEASE'};
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(metadata,null,2));
fs.writeFileSync(path.join(out,'BUILD.log'),output);
console.log('EXTREMELAB_BOT_ARTIFACT '+JSON.stringify(metadata));
fs.rmSync(work,{recursive:true,force:true});
