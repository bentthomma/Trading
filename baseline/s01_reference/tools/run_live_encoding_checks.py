#!/usr/bin/env python3
"""Reproduce the private HTTP proposal without changing baseline/product files.

Real Node HTTP over AF_UNIX, real security module and zlib, synthetic relay only.
Linux seccomp denies creation of non-Unix sockets in all children. This is not a
full security sandbox. Output belongs outside the immutable package.
"""
from __future__ import annotations
import argparse, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile, time
from datetime import datetime, timezone
from unix_http_offline import install

ROOT=pathlib.Path(__file__).resolve().parents[1]

def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def tap(text):
    vals={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|skipped|cancelled|todo) (\d+)$',text,re.M)}
    if 'tests' not in vals: raise AssertionError('Missing TAP totals')
    return vals

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--node',required=True,help='Absolute path to Node executable')
    ap.add_argument('--reports-dir',required=True,help='New directory outside this package')
    a=ap.parse_args()
    node=pathlib.Path(a.node).resolve(strict=True)
    reports=pathlib.Path(a.reports_dir).resolve()
    if reports.is_relative_to(ROOT): raise ValueError('Reports must be outside package')
    reports.mkdir(parents=True,exist_ok=False)
    summary={'schema':'extremelab-live-encoding-execution/v1','started_utc':datetime.now(timezone.utc).isoformat(),
        'uid':os.getuid(),'python':sys.version,'package_root':str(ROOT),
        'manifest_sha256':digest(ROOT/'MANIFEST.json'),'executions':[],
        'original_inputs':38,'missing_inputs':21,'product_integration':False,
        'cloud_broker_or_account_access':False,'canonical_gate_changed':False,
        'success':False}
    try:
      with tempfile.TemporaryDirectory(prefix='xl-encoding-run-') as td:
        temp=pathlib.Path(td)
        env={'PATH':str(node.parent)+':/usr/bin:/bin','HOME':str(temp),'TMPDIR':str(temp),
             'LANG':'C.UTF-8','LC_ALL':'C.UTF-8','PYTHONDONTWRITEBYTECODE':'1'}
        def run(label,cmd,*,cwd=ROOT,extra=None,expected=0,timeout=40):
            started=time.monotonic();proc=subprocess.run([str(x) for x in cmd],cwd=cwd,
                env={**env,**(extra or {})},preexec_fn=install,close_fds=True,
                stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
            text=proc.stdout.decode('utf-8','replace');(reports/(label+'.log')).write_text(text)
            row={'label':label,'command':[str(x) for x in cmd],'returncode':proc.returncode,
                 'elapsed_seconds':round(time.monotonic()-started,3),'log_sha256':hashlib.sha256(proc.stdout).hexdigest()}
            summary['executions'].append(row)
            if proc.returncode!=expected:raise AssertionError(f'{label}: exit {proc.returncode}, expected {expected}')
            return text,row
        run('00_package_before',[sys.executable,'-B','verify_package.py'])
        out,_=run('01_environment',[node,'-e','console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,uid:process.getuid()}))'])
        summary['node_environment']=json.loads(out)
        probe="""import socket,errno,json
r={}
for name,family in [('ipv4',socket.AF_INET),('ipv6',socket.AF_INET6),('packet',socket.AF_PACKET)]:
 try:
  s=socket.socket(family,socket.SOCK_STREAM);s.close();raise AssertionError(name+' unexpectedly available')
 except OSError as e:
  assert e.errno==errno.EPERM,(name,e);r[name]='EPERM'
a,b=socket.socketpair();a.sendall(b'local-only');assert b.recv(100)==b'local-only';a.close();b.close();r['unix_roundtrip']='passed';print(json.dumps(r))
"""
        out,_=run('02_socket_guard',[sys.executable,'-B','-c',probe]);summary['socket_guard']=json.loads(out)
        binding=json.loads((ROOT/'proposals/live-encoding/proposal.json').read_text())['files'][0]
        original=ROOT/binding['original'];candidate=ROOT/binding['candidate']
        assert digest(original)==binding['original_sha256'] and digest(candidate)==binding['candidate_sha256']
        patchroot=temp/'patch-roundtrip';(patchroot/'api').mkdir(parents=True)
        shutil.copy2(original,patchroot/'api/live.js')
        patch=ROOT/'proposals/live-encoding/live-encoding.diff'
        run('02a_patch_forward',['/usr/bin/patch','--batch','--fuzz=0','-p1','-i',patch],cwd=patchroot)
        assert (patchroot/'api/live.js').read_bytes()==candidate.read_bytes()
        run('02b_patch_reverse',['/usr/bin/patch','--batch','--fuzz=0','-R','-p1','-i',patch],cwd=patchroot)
        assert (patchroot/'api/live.js').read_bytes()==original.read_bytes()
        summary['native_patch_roundtrip']='exact_candidate_and_original_bytes'
        testcmd=[node,'--experimental-vm-modules','--test','--test-reporter=tap','tests/live_encoding_http.test.mjs']
        text,row=run('03_original_countercheck',testcmd,extra={'XL_ENCODING_TARGET':'original'},expected=1)
        counts=tap(text);assert counts['tests']==18 and counts['pass']==2 and counts['fail']==16 and counts['cancelled']==0,counts
        assert 'not ok 1 - explicit gzip q=0' in text and 'ok 2 - gzip-positive response' in text
        row['counts']=counts;row['meaning']='Expected mismatch with expanded proposed contract, not sixteen independent product bugs'
        text,row=run('04_candidate_http',testcmd);counts=tap(text)
        assert counts['tests']==18 and counts['pass']==18 and counts['fail']==0 and counts['skipped']==0,counts
        row['counts']=counts
        security=temp/'original-security';(security/'tests').mkdir(parents=True);(security/'lib').mkdir()
        src=ROOT/'baseline/recovery_donors/security.test.mjs'
        shutil.copy2(src,security/'tests/security.test.mjs')
        src2=ROOT/'baseline/vercel_recovered/src/lib/security.mjs';shutil.copy2(src2,security/'lib/security.mjs')
        text,row=run('05_original_security',[node,'--test','--test-reporter=tap','tests/security.test.mjs'],cwd=security)
        counts=tap(text);assert counts['tests']==9 and counts['pass']==9 and counts['skipped']==0,counts
        row['counts']=counts;row['original_test_sha256']=digest(src);row['original_module_sha256']=digest(src2)
        for label,file,number in [('06_inventory_policy','test_s01_candidate.py',12),('07_inventory_sources','test_s01_recovery.py',8)]:
            text,row=run(label,[sys.executable,'-B','-m','unittest','discover','-s','tests','-p',file,'-v'])
            assert re.search(r'Ran '+str(number)+r' tests? in ',text) and '\nOK\n' in text,text
            row['methods']=number
        contract=json.loads((ROOT/'proposals/live-encoding/proposal.json').read_text());binding=contract['files'][0]
        candidate=ROOT/binding['candidate'];original=candidate.read_text()
        mutations=[
          ('08_mutation_q0','weights.set(coding,Math.min(weights.get(coding)??1,q));','weights.set(coding,1);','explicit gzip q=0'),
          ('09_mutation_vary',"res.setHeader('Vary',fields.join(', '));","res.setHeader('Vary','Accept-Encoding');",'Vary retains existing fields'),
          ('10_mutation_small','const useGzip=encodings.gzip>0&&','const useGzip=payload.length>4096&&encodings.gzip>0&&','gzip-only clients receive compressed small')]
        for label,before,after,pattern in mutations:
            assert original.count(before)==1,before
            copy=temp/label;shutil.copytree(ROOT,copy,ignore=shutil.ignore_patterns('__pycache__'))
            target=copy/binding['candidate'];target.write_text(original.replace(before,after))
            m=json.loads((copy/'proposals/live-encoding/proposal.json').read_text());m['files'][0]['candidate_sha256']=digest(target)
            (copy/'proposals/live-encoding/proposal.json').write_text(json.dumps(m))
            cmd=[node,'--experimental-vm-modules','--test','--test-reporter=tap','--test-name-pattern='+pattern,'tests/live_encoding_http.test.mjs']
            text,row=run(label,cmd,cwd=copy,expected=1);counts=tap(text)
            assert counts['fail']==1 and re.search(r'not ok \d+ - '+re.escape(pattern),text),text
            assert 'assert.equal(sha(fs.readFileSync(entry))' not in text
            row['counts']=counts;row['expected_behavior_regression_detected']=True
        for label,kind,reason in [('11_package_bytes','bytes','HASH_MISMATCH'),('12_package_extra','extra','SOURCE_FILE_SET_MISMATCH'),('13_package_symlink','symlink','SYMLINK_NOT_ALLOWED')]:
            copy=temp/label;shutil.copytree(ROOT,copy,ignore=shutil.ignore_patterns('__pycache__'))
            if kind=='bytes':
                p=copy/binding['candidate'];p.write_bytes(p.read_bytes()+b'\n// test damage\n')
            elif kind=='extra':(copy/'unexpected.txt').write_text('synthetic extra')
            else:(copy/'unexpected-link').symlink_to('README.md')
            text,row=run(label,[sys.executable,'-B','verify_package.py'],cwd=copy,expected=2)
            assert reason in text,text;row['expected_rejection']=reason
        out,row=run('14_package_after',[sys.executable,'-B','verify_package.py'])
        summary['package_verified_files']=json.loads(out)['verified_files']
        summary['candidate_and_regression_methods']={'candidate_native_http':18,'original_security':9,'inventory':20,'total_distinct':49}
        summary['countercheck']={'original_target':{'pass':2,'fail':16,'total':18},'excluded_from_passing_total':True}
        summary['mutations_detected']=3;summary['package_tamper_rejected']=3
        summary['success']=True
    except BaseException as exc:
        summary['error']=f'{type(exc).__name__}: {exc}'
        raise
    finally:
        summary['finished_utc']=datetime.now(timezone.utc).isoformat()
        (reports/'execution.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'success':True,'distinct_methods':49,'reports':str(reports)},ensure_ascii=False))

if __name__=='__main__':main()
