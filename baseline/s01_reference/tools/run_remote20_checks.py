#!/usr/bin/env python3
"""Verify and exercise the private S01 remote-view package. Never contacts providers."""
from pathlib import Path
import argparse,hashlib,json,os,re,shutil,subprocess,sys,tempfile,zipfile
import remote20_runtime as rt
from no_connect import install
ROOT=Path(__file__).resolve().parents[1]
sha=lambda b:hashlib.sha256(b).hexdigest()

def run(args,cwd,env,log):
    p=subprocess.run(args,cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,preexec_fn=install,timeout=90)
    log.write_bytes(p.stdout+b'\n--- STDERR ---\n'+p.stderr)
    return p

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--reports-dir',required=True,type=Path);ap.add_argument('--node',type=Path,default=rt.NODE);a=ap.parse_args()
    out=a.reports_dir.resolve();root=ROOT.resolve()
    if out==root or root in out.parents:raise ValueError('reports must be external to package')
    out.mkdir(parents=True,exist_ok=False);rt.NODE=a.node.resolve()
    env={'PATH':str(rt.NODE.parent)+':/usr/bin:/bin','HOME':str(out),'LANG':'C.UTF-8','TZ':'UTC','PYTHONDONTWRITEBYTECODE':'1'}
    result={'schema':'extremelab-s01-remote20-execution/v1','fresh_output_dir':str(out),'uid':os.getuid(),'tests':{},'mutations':[],'package_tamper':[],'network':'seccomp denied connect/sendto/sendmsg/sendmmsg in test child processes; not a general sandbox','live_provider':False,'broker_actions':False,'source_modified':False}
    def require(p,name):
        if p.returncode:raise AssertionError(name+' failed; read '+str(out))
    pre=run([sys.executable,'-B',str(root/'verify_package.py')],root,env,out/'manifest_before.log');require(pre,'manifest before');result['manifest_before']=json.loads(pre.stdout)
    probe=run([sys.executable,'-B','-c','import socket,errno\ns=socket.socket()\ntry:s.connect(("127.0.0.1",9))\nexcept OSError as e:assert e.errno==errno.EPERM;print("EPERM_CONFIRMED")\nelse:raise AssertionError("network allowed")'],root,env,out/'network_deny.log');require(probe,'network guard');result['network_probe']=probe.stdout.decode().strip()
    version=run([str(rt.NODE),'--version'],root,env,out/'node_version.log');require(version,'Node version');nv=version.stdout.decode().strip()
    if not re.fullmatch(r'v24\.\d+\.\d+',nv):raise ValueError('original project requires Node 24.x')
    result['runtime']={'node':nv,'node_sha256':sha(rt.NODE.read_bytes()),'python':sys.version,'platform':sys.platform}
    selected=json.loads((root/'vendor-manifests/S01_REMOTE20_PLATFORM_SOURCE_SUBSET.json').read_text())
    arc=root/'baseline/original_platform097.zip';assert sha(arc.read_bytes())==selected['original_archive_sha256']
    with zipfile.ZipFile(arc) as z:
        assert z.testzip() is None
        prefix='Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/'
        for rel,digest in selected['selected_files'].items():
            data=(root/'baseline/platform097_remote'/rel).read_bytes();assert sha(data)==digest;assert data==z.read(prefix+rel)
    bindings=json.loads((root/'evidence/S01/S01_REMOTE20_SOURCE_BINDING.json').read_text())
    for row in bindings['files']:
        data=(root/'baseline/vercel_recovered'/row['source_path']).read_bytes();assert sha(data)==row['sha256'];assert hashlib.sha1(data).hexdigest()==row['current_provider_uid_sha1'];assert data==(root/'baseline/platform097_remote'/row['platform_path']).read_bytes()
    with zipfile.ZipFile(root/'baseline/prior_addon_build_audit.zip') as z:
        prefix='ExtremeLab_S01_AddonBuildAudit_Offline/'
        unchanged=0
        for p in (root/'baseline/vercel_recovered/src').rglob('*'):
            if p.is_file():assert p.read_bytes()==z.read(prefix+p.relative_to(root).as_posix());unchanged+=1
        for rel in ['baseline/masterplan_1_1_0_plan.json','evidence/S01/GATE_STATUS.json']:
            assert (root/rel).read_bytes()==z.read(prefix+rel)
    result['source_binding']={'archive_selected_members':len(selected['selected_files']),'production_correspondences':len(bindings['files']),'unchanged_provider_sources':unchanged,'canonical_plan_and_gate_unchanged':True}
    with tempfile.TemporaryDirectory(prefix='s01-remote-check-') as td:
        source,platform=rt.stage(root,Path(td))
        before={str(p.relative_to(platform)):sha(p.read_bytes()) for p in platform.rglob('*') if p.is_file()}
        p=rt.command(root,source,platform,root/'tests/test_remote20_production_entry.mjs',out/'production_entry.tap');require(p,'production entry')
        def counts(raw):
            d={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|skipped|cancelled) (\d+)$',raw.decode(),re.M)}
            assert d['fail']==d['skipped']==d['cancelled']==0 and d['tests']==d['pass'];return d
        result['tests']['production_entry']=counts(p.stdout)
        p=rt.command(root,source,platform,platform/'tests/remote-view20.mjs',out/'original_remote20.tap');require(p,'original remote20');result['tests']['original_remote20']=counts(p.stdout)
        assert before=={str(p.relative_to(platform)):sha(p.read_bytes()) for p in platform.rglob('*') if p.is_file()}
        changes=[('owner_session',source/'lib/http.mjs',"if(!authenticated(req))",'if(false)'),('registry_etag',source/'api/revolution.js','ifMatch:etag','ifMatch:null'),('persisted_slot',platform/'core/remote-view20.mjs','this.store.set(SLOT,{deviceId:c.deviceId,slot:value.slot});','void 0;')]
        for name,path,old,new in changes:
            raw=path.read_text();assert raw.count(old)==1;path.write_text(raw.replace(old,new))
            try:
                p=rt.command(root,source,platform,root/'tests/test_remote20_production_entry.mjs',out/('mutation_'+name+'.tap'))
                # A parse/import failure is not evidence that an assertion detects the regression.
                failed=re.findall(r'^not ok \d+ - (.+)$',p.stdout.decode(),re.M)
                assert p.returncode!=0 and failed and 'ERR_MODULE_NOT_FOUND' not in p.stderr.decode()
                result['mutations'].append({'name':name,'exit':p.returncode,'failing_test_methods':failed})
            finally:path.write_text(raw)
    p=run([sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_s01*.py','-v'],root,env,out/'inventory_regressions.log');require(p,'inventory regressions')
    n=int(re.search(r'Ran (\d+) tests?',p.stderr.decode()).group(1));result['tests']['inventory']={'tests':n,'pass':n,'fail':0,'skipped':0}
    # Test the delivered package verifier with actual copied package bytes.
    for name in ['changed_bytes','extra_file','symlink']:
        with tempfile.TemporaryDirectory(prefix='s01-package-negative-') as td:
            c=Path(td)/'copy';shutil.copytree(root,c)
            target=c/'tests/test_remote20_production_entry.mjs'
            if name=='changed_bytes':target.write_bytes(target.read_bytes()+b'\n// synthetic tamper\n')
            elif name=='extra_file':(c/'UNEXPECTED.txt').write_text('synthetic')
            else:target.unlink();target.symlink_to(root/'tests/test_remote20_production_entry.mjs')
            p=run([sys.executable,'-B',str(c/'verify_package.py')],c,env,out/('tamper_'+name+'.log'))
            assert p.returncode==2 and b'REJECTED' in p.stdout
            result['package_tamper'].append({'kind':name,'exit':p.returncode})
    post=run([sys.executable,'-B',str(root/'verify_package.py')],root,env,out/'manifest_after.log');require(post,'manifest after');result['manifest_after']=json.loads(post.stdout)
    result['unique_test_methods']=sum(x['tests'] for x in result['tests'].values())
    result['status']='OFFLINE_ORIGINAL_CONSUMER_REPLAY_PASSED_WITH_DOCUMENTED_NONATOMIC_BOUNDARIES'
    result['not_performed']=['Real Vercel SDK/cloud cache/blob semantics','real HTTP network or browser rendering','complete website pipeline','cTrader/native bot build or broker connection','official S01 acceptance']
    (out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))

if __name__=='__main__':main()
