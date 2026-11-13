/** Fixed POSIX owner for one CLI process group. The IPC parent is its lifetime.
 * Native CLI output is deliberately discarded: it can contain credentials or
 * personal account information and is not a trusted readiness protocol. */
import {spawn} from 'node:child_process';

let started=false,child=null,ending=false;
function end(){if(ending)return;ending=true;try{process.kill(-process.pid,'SIGKILL');}catch{process.exit(1);}}
process.on('disconnect',end);
process.on('message',message=>{
  if(message?.operation==='stop'){end();return;}
  if(started||message?.operation!=='start')return end();
  started=true;
  const spec=message.spec;
  if(!spec||typeof spec.command!=='string'||!Array.isArray(spec.args)||spec.args.some(x=>typeof x!=='string')||typeof spec.cwd!=='string')return end();
  try{
    child=spawn(spec.command,spec.args,{shell:false,cwd:spec.cwd,env:spec.env,windowsHide:true,stdio:'ignore'});
    child.once('spawn',()=>process.send?.({type:'spawned',pid:child.pid}));
    child.once('error',()=>{process.send?.({type:'failed'},end);});
    child.once('exit',(code,signal)=>{process.send?.({type:'exited',code,signal},end);});
  }catch{end();}
});
setTimeout(()=>{if(!started)end();},5000).unref();
