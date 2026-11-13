import {execFile,spawn,fork} from 'node:child_process';
import {readFile,lstat,mkdir,chmod,realpath} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectCliVersion,cliChildEnvironment} from './cli.mjs';
import {fail} from '../core/errors.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const powershell=()=>join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const PRIVATE_DIRECTORY_SCRIPT=`$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd()|ConvertFrom-Json;$d=Get-Item -LiteralPath $p.path;if(-not $d.PSIsContainer -or ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'INVALID_DIRECTORY'};$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($sid);$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);Set-Acl -LiteralPath $p.path -AclObject $acl;$check=Get-Acl -LiteralPath $p.path;if(-not $check.AreAccessRulesProtected){throw 'ACL_NOT_PROTECTED'};foreach($r in $check.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if($r.IdentityReference.Value -ne $sid.Value -or $r.AccessControlType -ne 'Allow'){throw 'ACL_NOT_PRIVATE'}};[Console]::Out.Write('PRIVATE')`;

export async function secureObserverDirectory(path){
  await mkdir(path,{recursive:false,mode:0o700});
  const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink())fail('OBSERVER_DIRECTORY_UNSAFE','Das private Startverzeichnis ist nicht sicher.',503);
  if(process.platform==='win32')await new Promise((resolve,reject)=>{
    const p=execFile(powershell(),['-NoLogo','-NoProfile','-NonInteractive','-Command',PRIVATE_DIRECTORY_SCRIPT],{windowsHide:true,shell:false,timeout:10000,maxBuffer:4096,env:cliChildEnvironment()},(error,stdout)=>error||stdout!=='PRIVATE'?reject(Object.assign(new Error('Private Windows ACL unavailable'),{code:'OBSERVER_DIRECTORY_UNSAFE',status:503,safe:true})):resolve());
    p.stdin.on('error',()=>{});p.stdin.end(JSON.stringify({path}));
  });
  else {await chmod(path,0o700);if((await lstat(path)).mode&0o077)fail('OBSERVER_DIRECTORY_UNSAFE','Das Startverzeichnis ist nicht privat.',503);}
  return realpath(path);
}

export async function inspectObserverCli(path){
  const cli=await inspectCliVersion(path);
  if(!cli)fail('CTRADER_CLI_UNAVAILABLE','Eine installierte cTrader CLI muss zuerst in den Einstellungen bestätigt werden.',503);
  if(cli.version!=='5.10.1.0')fail('OBSERVER_CLI_VERSION_UNVERIFIED','Der kontrollierte Observer-Start ist für cTrader CLI 5.10.1.0 geprüft. Diese andere Version benötigt eine eigene Syntaxprüfung.',409);
  const files=[cli.path,...(cli.command!==cli.path?[cli.command]:[])],hashes=[];
  for(const file of files){const before=await lstat(file);if(!before.isFile()||before.isSymbolicLink()||before.size>300*1024*1024)fail('CTRADER_CLI_CHANGED','CLI-Datei kann nicht gebunden werden.',409);const bytes=await readFile(file),after=await lstat(file);if(before.ino!==after.ino||before.dev!==after.dev||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||before.size!==after.size||bytes.length!==before.size)fail('CTRADER_CLI_CHANGED','CLI-Datei wurde während der Prüfung verändert.',409);hashes.push({path:file,sha256:sha(bytes),bytes:bytes.length});}
  return {...cli,hashes,identity:sha(JSON.stringify(hashes))};
}

/** One fixed observer invocation; no shell, arbitrary operation, FullAccess,
 * interactive command stream or password argument. authorize is checked at the
 * last synchronous boundary before the OS process is created. */
export async function startObserverCli(spec){
  const {cli,algoPath,passwordPath,pairingPath,cwd,ctid,accountId,broker,symbol,period,authorize}=spec;
  const args=[...cli.prefix,'run',algoPath,'--ctid='+ctid,'--pwd-file='+passwordPath,'--account='+accountId,'--broker='+broker,'--symbol='+symbol,'--period='+period,'--exit-on-stop','--reconnect-timeout=15','--ManagedHubConnection='+pairingPath];
  const env=cliChildEnvironment();
  let owner,readyResolve,readyReject,exitResolve,started=false,ended=false,lastExit=null,stopping=false;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),exited=new Promise(resolve=>exitResolve=resolve);
  // Avoid an unhandled rejection if the process exits before a caller awaits it.
  ready.catch(()=>{});
  const script=process.platform==='win32'?await readFile(join(HERE,'observer-job-windows.ps1'),'utf8'):null;
  authorize();
  if(process.platform==='win32'){
    owner=spawn(powershell(),['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{shell:false,windowsHide:true,stdio:['pipe','pipe','ignore'],cwd,env});
    owner.stdin.on('error',()=>{});owner.stdin.write(JSON.stringify({command:cli.command,args,cwd})+'\n');
    let buffer='';owner.stdout.setEncoding('utf8');owner.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>16384){stop();return;}let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);let msg;try{msg=JSON.parse(line);}catch{stop();continue;}message(msg);}});
  }else{
    owner=fork(join(HERE,'observer-cli-worker.mjs'),[],{execPath:process.execPath,execArgv:[],detached:true,silent:true,stdio:['ignore','ignore','ignore','ipc'],cwd,env});
    owner.on('message',message);owner.send({operation:'start',spec:{command:cli.command,args,cwd,env}});
  }
  function message(msg){
    if(msg?.type==='spawned'&&!started&&Number.isSafeInteger(msg.pid)&&msg.pid>0){started=true;clearTimeout(deadline);readyResolve({pid:msg.pid});}
    else if(msg?.type==='exited'){lastExit={code:Number.isSafeInteger(msg.code)?msg.code:null,signal:typeof msg.signal==='string'?msg.signal:null};}
    else if(msg?.type==='failed'){readyReject(Object.assign(new Error('Observer-CLI konnte nicht gestartet werden.'),{code:'OBSERVER_PROCESS_START_FAILED',safe:true,status:503}));stop();}
  }
  function finish(code,signal){if(ended)return;ended=true;clearTimeout(deadline);clearTimeout(force);if(!started)readyReject(Object.assign(new Error('Observer-CLI wurde nicht gestartet.'),{code:'OBSERVER_PROCESS_START_FAILED',safe:true,status:503}));exitResolve({...lastExit,ownerExitCode:code??null,ownerSignal:signal??null,terminationScope:process.platform==='win32'?'windows_job':'posix_process_group'});}
  owner.once('error',()=>finish(null,null));owner.once('exit',finish);
  let force;
  function stop(){if(ended||stopping)return;stopping=true;try{if(process.platform==='win32')owner.stdin.end('stop\n');else if(owner.connected)owner.send({operation:'stop'});}catch{}force=setTimeout(()=>{if(ended)return;try{if(process.platform==='win32')owner.kill('SIGKILL');else process.kill(-owner.pid,'SIGKILL');}catch{}},2000);force.unref();}
  const deadline=setTimeout(()=>{readyReject(Object.assign(new Error('Observer-Prozessstart hat zu lange gedauert.'),{code:'OBSERVER_PROCESS_START_TIMEOUT',status:504,safe:true}));stop();},15000);deadline.unref();
  return {ready,exited,stop,ownerPid:owner.pid,terminationScope:process.platform==='win32'?'windows_job':'posix_process_group'};
}

export const observerCliAdapter=Object.freeze({inspect:inspectObserverCli,secureDirectory:secureObserverDirectory,start:startObserverCli});
