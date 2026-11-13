#!/usr/bin/env python3
"""Reproduce this bounded offline work package without touching the package tree.

The original builder is stopped before installing any SDK. Download bodies are
synthetic bytes and are never loaded as bots. Exit 0 means these bounded checks
passed, not native compilation, website build, cloud test or formal acceptance.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,os,re,shutil,subprocess,sys,tempfile,zipfile
from no_connect import install
ROOT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--node',required=True);ap.add_argument('--reports-dir',required=True)
    a=ap.parse_args();node=Path(a.node).resolve(strict=True);out=Path(a.reports_dir).resolve()
    if out==ROOT or ROOT in out.parents:raise ValueError('Reports must be outside the immutable package')
    out.mkdir(parents=True,exist_ok=False)
    env={k:v for k,v in os.environ.items() if k in ['PATH','LANG','LC_ALL','TZ']}
    env.update(PYTHONDONTWRITEBYTECODE='1',EXTREMELAB_TEST_NODE=str(node),EXTREMELAB_TEST_REPORTS=str(out))
    results=[]
    def run(name,cmd,*,cwd=ROOT,extra=None,expected=0):
        cfg={**env,**(extra or {})}
        r=subprocess.run([str(x) for x in cmd],cwd=cwd,env=cfg,text=True,capture_output=True,timeout=90,preexec_fn=install)
        (out/(name+'.log')).write_text(r.stdout+r.stderr)
        results.append({'name':name,'command':[str(x) for x in cmd],'exit':r.returncode,'expected_exit':expected,'log':name+'.log'})
        if (expected==0 and r.returncode!=0) or (expected=='nonzero' and r.returncode==0):
            raise AssertionError(f'{name} unexpected exit {r.returncode}; inspect {out/(name+".log")}')
        return r.stdout+r.stderr
    summary={'work_id':'S01-BOT-DELIVERY-RECOVERY','executed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'python':sys.version.split()[0],'commands':results,'native_compilation':False,'real_bot_started':False,'website_full_build':False,'independent_acceptance':False}
    try:
        summary['package_before']=json.loads(run('package_before',[sys.executable,'-B',ROOT/'verify_package.py']))
        summary['node_version']=run('node_version',[node,'--version']).strip();summary['node_sha256']=hashlib.sha256(node.read_bytes()).hexdigest()
        probe="import socket,errno; s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('EPERM: network denied')\nelse:raise AssertionError('network allowed')"
        run('network_denied',[sys.executable,'-B','-c',probe])
        summary['source_binding']=json.loads(run('source_binding',[sys.executable,'-B',ROOT/'tools/bot_delivery_sources.py']))
        py_groups=[]
        for name,file in [('new_sources_and_builder','test_bot_delivery_sources.py'),('inventory_candidate','test_s01_candidate.py'),('inventory_recovery','test_s01_recovery.py')]:
            log=run(name,[sys.executable,'-B','-m','unittest','discover','-s','tests','-p',file,'-v'])
            m=re.search(r'Ran (\d+) tests? in',log)
            if not m or not re.search(r'\nOK\s*$',log):raise AssertionError('Unittest summary incomplete: '+name)
            py_groups.append({'name':name,'methods':int(m.group(1))})
        summary['python_groups']=py_groups
        with tempfile.TemporaryDirectory(prefix='el-delivery-stage-') as tmp:
            stage=Path(tmp);(stage/'api').mkdir();(stage/'lib').mkdir()
            source=ROOT/'baseline/vercel_recovered/src'
            shutil.copyfile(source/'api/bot-download.js',stage/'api/bot-download.mjs')
            shutil.copyfile(source/'lib/security.mjs',stage/'lib/security.mjs')
            shutil.copyfile(ROOT/'tests/original_download121.test.mjs',stage/'original.test.mjs')
            original=json.loads(run('original_download_checks',[node,stage/'original.test.mjs'],cwd=stage))
            if original['failed'] or len(original['checks'])!=15 or original['passed']!=15:raise AssertionError('Original checks incomplete')
            summary['original_download_assertions']=original
            extra={'EXTREMELAB_DELIVERY_STAGE':str(stage)}
            tap=run('download_boundary_tests',[node,'--test','--test-reporter=tap',ROOT/'tests/bot_delivery_boundaries.test.mjs'],cwd=stage,extra=extra)
            counts={x:int(re.search(r'^# '+x+r' (\d+)$',tap,re.M).group(1)) for x in ['tests','pass','fail','skipped']}
            if counts!={'tests':6,'pass':6,'fail':0,'skipped':0}:raise AssertionError('Unexpected Node tests summary')
            summary['node_methods']=counts
            original_source=(stage/'api/bot-download.mjs').read_text()
            mutations=[('owner_check_removed',"action==='download'&&!authenticated(req)","action==='download'&&false",'warm artifact'),('checksum_check_removed',"||createHash('sha256').update(data).digest('hex')!==metadata.sha256",'', 'cold module')]
            probes=[]
            for name,before,after,pattern in mutations:
                if original_source.count(before)!=1:raise AssertionError('Mutation anchor ambiguous')
                (stage/'api/bot-download.mjs').write_text(original_source.replace(before,after))
                log=run('mutation_'+name,[node,'--test','--test-reporter=tap','--test-name-pattern='+pattern,ROOT/'tests/bot_delivery_boundaries.test.mjs'],cwd=stage,extra=extra,expected='nonzero')
                if 'AssertionError' not in log or '# fail 1' not in log:raise AssertionError('Mutation failed for wrong reason')
                probes.append({'mutation':name,'caught_by_behavior_assertion':True})
            (stage/'api/bot-download.mjs').write_text(original_source)
            summary['behavior_mutations']=probes
        summary['distinct_test_methods']=sum(g['methods'] for g in py_groups)+6
        summary['additional_original_assertions']=15
        summary['builder_outcomes']=[json.loads(f.read_text()) for f in sorted(out.glob('builder-*.json'))]
        # Three negative package copies remain separate from behavior-method counts.
        negatives=[]
        with tempfile.TemporaryDirectory(prefix='el-delivery-package-negative-') as tmp:
            q=Path(tmp)/'copy';shutil.copytree(ROOT,q)
            target=q/'baseline/vercel_recovered/src/api/bot-download.js';before=target.read_bytes();target.write_bytes(before+b'\n')
            log=run('package_changed_byte',[sys.executable,'-B',q/'verify_package.py'],cwd=q,expected='nonzero')
            if 'REJECTED HASH_MISMATCH:' not in log:raise AssertionError('Wrong package-tamper failure')
            negatives.append('changed_bytes');target.write_bytes(before)
            unexpected=q/'unexpected.tmp';unexpected.write_text('synthetic');log=run('package_extra_file',[sys.executable,'-B',q/'verify_package.py'],cwd=q,expected='nonzero')
            if 'REJECTED SOURCE_FILE_SET_MISMATCH' not in log:raise AssertionError('Wrong extra-file failure')
            negatives.append('extra_file');unexpected.unlink()
            link=q/'unexpected-link';link.symlink_to('README.md');log=run('package_symlink',[sys.executable,'-B',q/'verify_package.py'],cwd=q,expected='nonzero')
            if 'REJECTED SYMLINK_NOT_ALLOWED:' not in log:raise AssertionError('Wrong symlink failure')
            negatives.append('symlink')
        summary['package_negative_probes']=negatives
        summary['package_after']=json.loads(run('package_after',[sys.executable,'-B',ROOT/'verify_package.py']))
        summary['bounded_checks_passed']=True
    except Exception as e:
        summary['bounded_checks_passed']=False;summary['failure']=str(e)
        raise
    finally:
        (out/'RESULT.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'bounded_checks_passed':True,'distinct_test_methods':summary['distinct_test_methods'],'original_assertions':15,'native_build':False,'report':str(out/'RESULT.json')}))

if __name__=='__main__':main()
