#!/usr/bin/env python3
"""Fresh-package reproduction of S01's addon provenance and original tests."""
from pathlib import Path
import argparse,datetime,json,os,re,shutil,subprocess,sys,tempfile
from no_connect import install
ROOT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--reports-dir',type=Path,required=True);a=ap.parse_args()
    logs=a.reports_dir.resolve()
    if logs==ROOT or ROOT in logs.parents:raise ValueError('LOGS_MUST_BE_EXTERNAL')
    if logs.exists() and any(logs.iterdir()):raise ValueError('REFUSE_OVERWRITE_LOGS')
    logs.mkdir(parents=True,exist_ok=True)
    out={'work_id':'S01-ADDON-BUILD-AUDIT','executed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'python':sys.version.split()[0],'commands':[],'full_website_build':False,'provider_source_inputs':{'full':36,'missing':23,'total':59},'original_product_files_changed':False,'official_gate_changed':False,'broker_actions':False,'deployment':False}
    def run(label,args,cwd=ROOT,expected=(0,)):
        env={'PATH':os.environ.get('PATH',''),'HOME':str(logs),'TMPDIR':'/tmp','PYTHONDONTWRITEBYTECODE':'1','PYTHONHASHSEED':'0','LANG':'C.UTF-8'}
        p=subprocess.run(args,cwd=cwd,env=env,preexec_fn=install,text=True,capture_output=True,timeout=45)
        (logs/(label+'.log')).write_text(p.stdout+'\n--- STDERR ---\n'+p.stderr)
        row={'name':label,'exit':p.returncode,'expected_exit':list(expected),'log':label+'.log'}
        match=re.search(r'Ran (\d+) tests?',p.stderr)
        if label in ('new_build_tests','inventory_regressions'):
            if not match:raise RuntimeError('TEST_COUNT_ABSENT:'+label)
            row['test_methods']=int(match.group(1))
        out['commands'].append(row)
        if p.returncode not in expected:raise RuntimeError(label+' failed; see '+str(logs))
        return p
    p=run('package_before',[sys.executable,'-B','verify_package.py']);out['manifest_before']=json.loads(p.stdout)
    p=run('node_version',['node','--version']);out['node']=p.stdout.strip()
    run('network_denial',[sys.executable,'-c',"import socket,errno; s=socket.socket();\ntry: s.connect(('127.0.0.1',9));raise AssertionError('NETWORK_ALLOWED')\nexcept PermissionError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')"])
    run('genuine_stage_and_original_tests',[sys.executable,'-B','tools/addon_build_audit.py','--reports-dir',str(logs/'stage')])
    stage=json.loads((logs/'stage/result.json').read_text());out['stage']=stage
    run('new_build_tests',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_addon_build_audit.py','-v'])
    run('inventory_regressions',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_s01_*.py','-v'])
    run('behavior_mutations',[sys.executable,'-B','tools/check_addon_mutations.py','--reports-dir',str(logs/'mutations')])
    out['mutations']=json.loads((logs/'mutations/result.json').read_text())
    negatives=[]
    for label in ('changed_bytes','extra_file','symlink'):
        with tempfile.TemporaryDirectory(prefix='s01-package-negative-') as t:
            dst=Path(t)/'package';shutil.copytree(ROOT,dst)
            target=dst/'baseline/derived_account_stage/lib/ctrader-readonly.mjs'
            if label=='changed_bytes':target.write_bytes(target.read_bytes()+b'\n')
            elif label=='extra_file':(dst/'UNEXPECTED.txt').write_text('synthetic negative')
            else:target.unlink();target.symlink_to(dst/'README.md')
            p=run('package_'+label,[sys.executable,'-B','verify_package.py'],cwd=dst,expected=(2,))
            error={'changed_bytes':'HASH_MISMATCH','extra_file':'SOURCE_FILE_SET_MISMATCH','symlink':'SYMLINK_NOT_ALLOWED'}[label]
            if error not in p.stdout:raise RuntimeError('WRONG_PACKAGE_NEGATIVE:'+label)
            negatives.append({'case':label,'exit':p.returncode,'diagnostic':p.stdout.strip()})
    out['package_negatives']=negatives
    p=run('package_after',[sys.executable,'-B','verify_package.py']);out['manifest_after']=json.loads(p.stdout)
    out['unique_test_methods']=stage['original_reader_test_counts']['tests']+sum(c.get('test_methods',0) for c in out['commands'])
    out['test_scope']='26 unchanged original reader tests on genuine generated modules; 9 original-build boundary tests; 20 inventory regressions. Mutation repetitions and package controls excluded from count.'
    out['network_boundary']='Linux seccomp denied connect,sendto,sendmsg,sendmmsg in all subprocesses; actual EPERM probe. No full security-sandbox claim.'
    out['known_unfixed_boundaries']=['failed addon writes can leave partial or all generated files','replaying addon after view stage removes the later account-page link until the view stage is replayed','skin prefix shows later replacement of the addon reader and page; final sources remain missing','historical HTTP-ENCODING-Q0 defect not re-tested or fixed']
    out['not_executed']=['full website pipeline','missing skin code','provider/broker integration','browser/UI acceptance','native C# build','previous endpoint handler suite']
    out['result']='PASSED_FOR_PRIVATE_INTERMEDIATE_BUILD_AUDIT_ONLY'
    (logs/'result.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
