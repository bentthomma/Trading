"""Broker-free production-consumer replay; SDK storage and wire transport are doubles."""
from pathlib import Path
import os,sys,json,shutil,subprocess,tempfile,hashlib
from no_connect import install
NODE=Path(os.environ.get('S01_NODE_EXECUTABLE','/opt/pyvenv/lib/python3.13/site-packages/playwright/driver/node')).resolve()
def command(root,source,platform,testfile,out):
    env={'PATH':str(NODE.parent)+':/usr/bin:/bin','HOME':str(out.parent),'LANG':'C.UTF-8','TZ':'UTC','S01_REMOTE_SOURCE':str(source),'S01_REMOTE_PLATFORM':str(platform),'NODE_DISABLE_COLORS':'1'}
    args=[str(NODE),'--test','--test-reporter=tap',str(testfile)]
    result=subprocess.run(args,cwd=platform,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,preexec_fn=install,timeout=90)
    out.write_bytes(result.stdout+b'\n--- STDERR ---\n'+result.stderr)
    return result

def stage(root,dest):
    source=dest/'source'; platform=dest/'platform'
    shutil.copytree(root/'baseline/vercel_recovered/src',source)
    shutil.copytree(root/'baseline/platform097_remote',platform)
    for name in ['functions','blob']:
        d=source/'node_modules/@vercel'/name;d.mkdir(parents=True)
        (d/'package.json').write_text(json.dumps({'name':'@vercel/'+name,'type':'module','exports':'./index.mjs','private':True}))
        shutil.copy2(root/'tests/remote20_provider'/(name+'.mjs'),d/'index.mjs')
    return source,platform

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1];out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=False)
    with tempfile.TemporaryDirectory(prefix='s01-remote-') as d:
        source,platform=stage(root,Path(d))
        r=command(root,source,platform,root/'tests/test_remote20_production_entry.mjs',out/'production_entry.tap')
        print('entry exit',r.returncode);print(r.stdout.decode()[-3500:]);print(r.stderr.decode()[-2000:])
        sys.exit(r.returncode)
