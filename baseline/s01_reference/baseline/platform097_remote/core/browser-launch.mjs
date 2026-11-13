import {spawn} from 'node:child_process';

// A successful OS launcher only proves that the launch command completed.
// It cannot prove that a browser rendered the page. Never log the private URL.
export async function launchBrowser(url,{platform=process.platform,spawnProcess=spawn,timeoutMs=2000}={}){
  const parsed=new URL(url);
  if(parsed.protocol!=='http:'||parsed.hostname!=='127.0.0.1'||!parsed.port||parsed.username||parsed.password)throw new Error('LOCAL_BROWSER_URL_REQUIRED');
  const command=platform==='win32'?'rundll32.exe':platform==='darwin'?'open':'xdg-open';
  const args=platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  return new Promise(resolve=>{
    let child,timer,settled=false;
    const finish=status=>{if(settled)return;settled=true;clearTimeout(timer);resolve({status});};
    try{
      child=spawnProcess(command,args,{detached:true,stdio:'ignore',windowsHide:true});
      child.once('error',()=>finish('failed'));
      child.once('exit',code=>finish(code===0?'launched':'failed'));
      timer=setTimeout(()=>finish('unconfirmed'),timeoutMs);
      child.unref();
    }catch{finish('failed');}
  });
}
