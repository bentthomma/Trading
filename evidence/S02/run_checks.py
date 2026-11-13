"""Reproduce S02 from actual checked-in contracts and bound original sources.

Exit 0: all checks, including native C#, ran successfully.
Exit 1: actual failure. Exit 2: executed checks passed, native SDK evidence unavailable.
No controller status is changed. Outputs must be outside the checkout.
"""
from pathlib import Path,PurePosixPath
import argparse,datetime,hashlib,importlib.util,json,os,re,shutil,stat,subprocess,sys,tempfile,zipfile
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).parent))
from check_sources import check
_guard_path=R/'baseline/s01_reference/tools/no_connect.py'
if hashlib.sha256(_guard_path.read_bytes()).hexdigest()!='c325318380f4ab85900fc1535b9790abfb84389f60393924e1fdf416c218ea10':
    raise RuntimeError('NETWORK_GUARD_SOURCE_CHANGED')
_guard_spec=importlib.util.spec_from_file_location('s02_network_guard',_guard_path)
no_connect=importlib.util.module_from_spec(_guard_spec);_guard_spec.loader.exec_module(no_connect)

def sha(b):return hashlib.sha256(b).hexdigest()
def snapshot(root):
    return {p.relative_to(root).as_posix():sha(p.read_bytes()) for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts and '__pycache__'not in p.relative_to(root).parts}
def extract(zfile,out):
    with zipfile.ZipFile(zfile)as z:
        for i in z.infolist():
            p=PurePosixPath(i.filename)
            if p.is_absolute()or '..'in p.parts or stat.S_ISLNK(i.external_attr>>16):raise ValueError('UNSAFE_ARCHIVE')
        if z.testzip():raise ValueError('ARCHIVE_CRC')
        z.extractall(out)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reports-dir',required=True);parser.add_argument('--node',default=shutil.which('node'));parser.add_argument('--dotnet');a=parser.parse_args()
    out=Path(a.reports_dir).resolve()
    if out==R or R in out.parents:raise SystemExit('Reports must be external to repository')
    out.mkdir(parents=True,exist_ok=False)
    if not a.node or not Path(a.node).is_file():raise SystemExit('Actual Node executable required')
    os.environ['S02_NODE']=str(Path(a.node).resolve());os.environ['PYTHONDONTWRITEBYTECODE']='1';os.environ['PYTHONHASHSEED']='0'
    report={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'commands':[],'unique_test_methods':0,'native_test_methods':0,'product_installed':False,'broker_actions':False}
    initial=snapshot(R)
    def call(name,cmd,env=None,allowed=(0,),timeout=90):
        p=subprocess.run(cmd,cwd=R,env=env or os.environ.copy(),text=True,capture_output=True,timeout=timeout)
        (out/(name+'.stdout')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
        report['commands'].append({'name':name,'argv':cmd,'exit_code':p.returncode,'stdout_sha256':sha(p.stdout.encode()),'stderr_sha256':sha(p.stderr.encode())})
        if p.returncode not in allowed:raise RuntimeError(name+' failed: '+str(p.returncode))
        return p
    try:
        no_connect.install()
        probe=call('network_probe',[sys.executable,'-B','-c',"import socket,errno; s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')\nelse:raise Exception('network gate failed')"])
        report['network_syscalls_denied']=True
        report['source_bindings']=check(R)
        report['node_version']=call('node_version',[a.node,'--version']).stdout.strip();report['python_version']=sys.version
        py=call('contracts_and_architecture',[sys.executable,'-B','-m','unittest','discover','-s','evidence/S02','-p','test_*.py','-v'])
        m=re.search(r'Ran (\d+) tests',py.stderr);assert m;report['python_test_methods']=int(m.group(1));report['unique_test_methods']+=int(m.group(1))
        with tempfile.TemporaryDirectory(prefix='s02-original-')as td:
            td=Path(td);extract(R/'baseline/s01_reference/baseline/original_platform097.zip',td)
            original=td/'Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local';original_before=snapshot(original)
            core=call('original_core',[a.node,'--test',str(original/'tests/core.mjs')])
            m=re.search(r'# tests (\d+)',core.stdout);assert m;report['original_test_methods']=int(m.group(1));report['unique_test_methods']+=int(m.group(1))
            env=os.environ.copy();env['S02_ORIGINAL_ROOT']=str(original)
            boundary=call('original_website_and_research_boundaries',[a.node,'--test','evidence/S02/original_boundaries.mjs'],env=env)
            m=re.search(r'# tests (\d+)',boundary.stdout);assert m;report['new_original_boundary_methods']=int(m.group(1));report['unique_test_methods']+=int(m.group(1))
            if snapshot(original)!=original_before:raise RuntimeError('ORIGINAL_SOURCE_MUTATED')
            report['extracted_original_files_unchanged']=len(original_before)
            mutations=[]
            # Original permission boundary mutation; changed only in the disposable copy.
            f=original/'core/control.mjs';old=f.read_text();needle="requireHuman(actor){if(actor?.kind!=='human')fail('HUMAN_CONFIRMATION_REQUIRED','Diese Aktion benötigt die Bestätigung in der lokalen Oberfläche.',403);}"
            if needle not in old:raise RuntimeError('MUTATION_TARGET_CHANGED')
            f.write_text(old.replace(needle,'requireHuman(actor){}'))
            p=call('mutation_original_actor_gate',[a.node,'--test','--test-name-pattern','C03','evidence/S02/original_boundaries.mjs'],env=env,allowed=(1,))
            if 'AssertionError'not in p.stdout and 'ERR_ASSERTION'not in p.stdout:raise RuntimeError('MUTATION_FAILED_FOR_WRONG_REASON')
            mutations.append('original_actor_check_removed');f.write_text(old)
            if snapshot(original)!=original_before:raise RuntimeError('ORIGINAL_RESTORE_FAILED')
        for name in ['terminal_anchor','policy_binding']:
            with tempfile.TemporaryDirectory(prefix='s02-mutation-')as td:
                clone=Path(td)
                for rel in ['contracts','adapters/contracts']:
                    shutil.copytree(R/rel,clone/rel)
                tests=clone/'evidence/S02';tests.mkdir(parents=True);shutil.copy2(R/'evidence/S02/test_contracts.py',tests/'test_contracts.py')
                if name=='terminal_anchor':
                    f=clone/'contracts/domain/v1/schema.json';s=json.loads(f.read_text());s['$defs']['Id']['pattern']=r'^[A-Za-z0-9][A-Za-z0-9_.:/-]*$';f.write_text(json.dumps(s));method='test_terminal_newlines_cannot_bypass_anchored_types'
                else:
                    f=clone/'adapters/contracts/v1/domain.py';t=f.read_text();needle="        need(policy['status']=='active' and policy['revision']==p['expected_policy_revision'] and pe['payload_hash']==p['policy_hash'],'POLICY_BINDING')";assert needle in t;f.write_text(t.replace(needle,'        pass # controlled mutation'));method='test_catalog_must_be_exact_unique_valid_and_current'
                p=call('mutation_'+name,[sys.executable,'-B',str(tests/'test_contracts.py'),'Contracts.'+method],allowed=(1,))
                if 'AssertionError'not in p.stderr:raise RuntimeError('MUTATION_FAILED_FOR_WRONG_REASON')
                mutations.append(name)
        report['mutations_detected']=mutations
        native_cmd=[sys.executable,'-B','evidence/S02/check_native.py','--output',str(out/'native')]
        if a.dotnet:native_cmd+=['--dotnet',a.dotnet]
        native=call('native_probe',native_cmd,allowed=(0,2),timeout=240);report['native']=json.loads(native.stdout)
        call('plan_validate',[sys.executable,'-B','governance/masterplan/control/planctl.py','--project-root',str(R),'validate'])
        final=snapshot(R)
        if initial!=final:raise RuntimeError('CHECKOUT_CONTENT_CHANGED')
        report['checked_out_files_unchanged']=len(final)
        report['test_status']='passed';report['s02_gate_status']='native_blocked' if native.returncode==2 else 'tests_ready_scope_amendment_pending';rc=native.returncode
    except Exception as e:
        report.update(test_status='failed',error=repr(e));rc=1
    report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();report['exit_code']=rc
    (out/'execution.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));return rc
if __name__=='__main__':raise SystemExit(main())
