#!/usr/bin/env python3
"""Reproduce the genuine account-addon stage, not the complete deployment.

All executions operate on temporary copies. This uses the existing Linux
network-denial helper; no provider credentials, installs or broker contacts.
"""
from __future__ import annotations
import argparse,base64,hashlib,json,os,re,shutil,subprocess,sys,tempfile,zipfile
from pathlib import Path
from no_connect import install

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'baseline/vercel_recovered/src'
ASSETS=ROOT/'baseline/derived_assets'
DONOR=ROOT/'baseline/original_accountlive134.zip'
ARCHIVE_ROOT='ExtremeLab_AccountLive_1_3_4/'
DONOR_SHA='6d01f3abb68974f5f6a6289138bb52f21cf6f9275a5fed1d388fe4ee21bc8b1b'
PACK_SHA='321aa9d5065ade59fc22bac871ea4f2b162c12ade105e3104477a19ae7c88283'
EXPECTED=('lib/ctrader-readonly.mjs','lib/account-handler.mjs','public/konto-live.html','public/konto-live.js','public/konto-live.css','add-account-link.mjs')


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tree(root: Path) -> dict[str,str]:
    out={}
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise ValueError('Symlink not permitted in an audited build tree: '+str(p))
        if p.is_file():out[p.relative_to(root).as_posix()]=sha(p.read_bytes())
    return out


def pinned_inputs() -> dict:
    """Bind full originals before execution; incomplete source prefixes are not executed."""
    if sha(DONOR.read_bytes())!=DONOR_SHA:raise ValueError('DONOR_HASH_MISMATCH')
    rows=json.loads((ROOT/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json').read_text())['sources']
    for row in rows:
        p=ROOT/'baseline/vercel_recovered'/row['path']
        if row['status']=='byte_recovered':
            if p.is_symlink() or not p.is_file():raise ValueError('MISSING_OR_LINKED_ORIGINAL')
            data=p.read_bytes()
            if hashlib.sha1(data).hexdigest()!=row['source_uid_sha1'] or sha(data)!=row['sha256']:raise ValueError('ORIGINAL_HASH_MISMATCH')
        elif p.exists() or p.is_symlink():raise ValueError('UNRECOVERED_ORIGINAL_REPLACED')
    packed=(SOURCE/'account-addon.br').read_bytes()
    if sha(packed)!=PACK_SHA:raise ValueError('PACK_HASH_MISMATCH')
    import brotli
    decoded=json.loads(brotli.decompress(packed))
    if set(decoded)!=set(EXPECTED) or any(not isinstance(v,str) for v in decoded.values()):raise ValueError('PACK_SHAPE_MISMATCH')
    with zipfile.ZipFile(DONOR) as z:
        if z.testzip() is not None:raise ValueError('DONOR_CRC_MISMATCH')
        manifest=json.loads(z.read(ARCHIVE_ROOT+'evidence/source-hashes.json'))
        if set(manifest)!=set(EXPECTED):raise ValueError('DONOR_MANIFEST_PATH_MISMATCH')
        for name in EXPECTED:
            data=decoded[name].encode()
            if data!=z.read(ARCHIVE_ROOT+name) or sha(data)!=manifest[name]:raise ValueError('DONOR_SOURCE_DIFFERENCE')
        for name in ('build-account-addon.mjs','api/account-live.js','lib/security.mjs'):
            if (SOURCE/name).read_bytes()!=z.read(ARCHIVE_ROOT+name):raise ValueError('DONOR_PROVIDER_DIFFERENCE:'+name)
    return {'donor_sha256':DONOR_SHA,'packed_sha256':PACK_SHA,'generated':{name:{'bytes':len(decoded[name].encode()),'sha256':sha(decoded[name].encode())} for name in EXPECTED},'full_provider_input_count':sum(r['status']=='byte_recovered' for r in rows),'missing_provider_input_count':sum(r['status']!='byte_recovered' for r in rows),'provider_total':len(rows)}


def prepare(path: Path) -> None:
    if path.exists():raise ValueError('REFUSE_OVERWRITE_WORKSPACE')
    shutil.copytree(SOURCE,path)
    shutil.copytree(ASSETS,path,dirs_exist_ok=True)


def run_node(args: list[str],cwd: Path,timeout: int=30) -> subprocess.CompletedProcess:
    # An explicit environment prevents accidental inheritance of connection secrets.
    env={'PATH':os.environ.get('PATH',''),'HOME':str(cwd),'TMPDIR':'/tmp','LANG':'C.UTF-8'}
    return subprocess.run(['node',*args],cwd=cwd,env=env,preexec_fn=install,capture_output=True,text=True,timeout=timeout)


def observe_skin_writers() -> dict:
    cap=json.loads((ROOT/'evidence/S01/S01_SKIN_BUILD_PREFIX_CAPTURE.json').read_text())
    if cap['truncated'] is not True or cap['executed'] is not False:raise ValueError('PREFIX_NOT_A_FULL_SOURCE')
    data=base64.b64decode(cap['data_prefix_base64'],validate=True)
    if len(data)!=cap['prefix_bytes'] or sha(data)!=cap['prefix_sha256']:raise ValueError('PREFIX_HASH_MISMATCH')
    code=data.decode()
    rows=json.loads((ROOT/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json').read_text())['sources']
    entry=next(r for r in rows if r['path']==cap['path'])
    if cap['fileId']!=entry['source_uid_sha1'] or entry['status']!='not_recovered':raise ValueError('PREFIX_BINDING_MISMATCH')
    source=code.split('const allowed=',1)[1].split(';',1)[0]
    allowed=re.findall(r"'([^']+)'",source)
    aliases=re.findall(r"'([^']+)'",code.split('for(const target of ',1)[1].split('])',1)[0])
    release=(SOURCE/'build-release20.mjs').read_text()
    order=re.findall(r"'([^']+\.mjs)'",release)
    if order.index('build-account-addon.mjs')>=order.index('build-ui.mjs'):raise ValueError('UNEXPECTED_STAGE_ORDER')
    return {'source':'authenticated truncated build-ui.mjs prefix, not executable full file','later_stage':'build-ui.mjs','release_order':order,'observed_bundle_members':allowed,'observed_page_aliases':aliases,'overwrites_of_addon_members':sorted(set(EXPECTED)&set(allowed+aliases)),'skin_payload_sha256':re.search(r"sha\(raw\)!=='([a-f0-9]{64})'",code).group(1),'full_skin_stage_executed':False,'final_deployment_reader_verified':False,'conclusion':'Addon-stage outputs are verified intermediate sources, NOT proof of the final reader or UI after skin and subsequent stages.'}


def audit(logs: Path,export: Path|None=None) -> dict:
    logs=logs.resolve()
    if logs==ROOT or ROOT in logs.parents:raise ValueError('LOGS_MUST_BE_EXTERNAL')
    if logs.exists() and any(logs.iterdir()):raise ValueError('REFUSE_OVERWRITE_REPORTS')
    logs.mkdir(parents=True,exist_ok=True)
    if export is not None and (export.exists() or export.is_symlink()):raise ValueError('REFUSE_OVERWRITE_EXPORT')
    proof=pinned_inputs()
    result={'work_id':'S01-ADDON-BUILD-AUDIT','bindings':proof,'skin_boundary':observe_skin_writers(),'commands':[],'full_website_build':False,'broker_connected':False,'stage_outputs_represent_final_deployment':False}
    def record(label: str,p: subprocess.CompletedProcess):
        (logs/(label+'.log')).write_text(p.stdout+'\n--- STDERR ---\n'+p.stderr)
        result['commands'].append({'name':label,'exit':p.returncode,'log':label+'.log'})
        if p.returncode:raise RuntimeError(label+' failed; see log')
    with tempfile.TemporaryDirectory(prefix='s01-addon-stage-') as tmp:
        work=Path(tmp)/'stage';prepare(work)
        p=run_node(['build-account-addon.mjs'],work);record('genuine_build',p)
        for name,expected in proof['generated'].items():
            if sha((work/name).read_bytes())!=expected['sha256']:raise RuntimeError('GENERATED_OUTPUT_MISMATCH:'+name)
        p=run_node(['--input-type=module','-e',"const a=await import('./api/account-live.js');const b=await import('./lib/account-handler.mjs');if(a.default!==b.default||a.createHandler!==b.createHandler||typeof a.default!=='function')throw Error('ENTRYPOINT_IDENTITY');console.log('ORIGINAL_ACCOUNT_ENDPOINT_IMPORT_OK');"],work)
        record('native_entrypoint_import',p)
        (work/'tests').mkdir(exist_ok=True)
        with zipfile.ZipFile(DONOR) as z:
            test=z.read(ARCHIVE_ROOT+'tests/reader.test.mjs')
            (work/'tests/reader.test.mjs').write_bytes(test)
        result['original_test_sha256']=sha(test)
        p=run_node(['--test','tests/reader.test.mjs'],work);record('original_reader_tests',p)
        counts={key:int(re.search(r'^# '+key+r' (\d+)\s*$',p.stdout,re.M).group(1)) for key in ['tests','pass','fail','skipped','cancelled']}
        if counts!={'tests':26,'pass':26,'fail':0,'skipped':0,'cancelled':0}:raise RuntimeError('ORIGINAL_TEST_RESULT_UNEXPECTED')
        for name,expected in proof['generated'].items():
            if sha((work/name).read_bytes())!=expected['sha256']:raise RuntimeError('SOURCE_CHANGED_DURING_ORIGINAL_TESTS:'+name)
        result['generated_sources_unchanged_after_original_tests']=True
        result['original_reader_test_counts']=counts
        result['mock_boundary']='Unchanged archived tests inject synthetic fetcher/handler read functions; no broker, HTTP server, credentials or native provider API is used. JS native module resolution and Node builtins are real.'
        if export:
            export.mkdir(parents=True)
            for name in EXPECTED:
                p=export/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((work/name).read_bytes())
        result['generated_output_tree_sha256']=sha(json.dumps({n:sha((work/n).read_bytes()) for n in EXPECTED},sort_keys=True).encode())
    (logs/'result.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--reports-dir',type=Path,required=True);ap.add_argument('--export-derived',type=Path)
    a=ap.parse_args();print(json.dumps(audit(a.reports_dir,a.export_derived),indent=2))

if __name__=='__main__':main()
