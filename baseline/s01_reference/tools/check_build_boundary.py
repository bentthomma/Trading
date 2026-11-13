#!/usr/bin/env python3
"""Read actual build dependencies; attempt only the pinned, incomplete first stage."""
from __future__ import annotations
import hashlib,json,os,re,shutil,subprocess,tempfile,sys
from pathlib import Path
from no_connect import install
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'baseline/vercel_recovered/src'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    original=json.loads((ROOT/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json').read_text())
    for row in original['sources']:
        if row['status']=='byte_recovered':
            b=(ROOT/'baseline/vercel_recovered'/row['path']).read_bytes()
            assert hashlib.sha1(b).hexdigest()==row['source_uid_sha1'] and sha(b)==row['sha256']
    top=(SOURCE/'build-release20.mjs').read_text()
    stages=re.findall(r"'([^']+\.mjs)'",top)
    nested=re.findall(r"import\('([^']+\.mjs)'\)",(SOURCE/'build.mjs').read_text())
    stage_rows=[{'path':p,'complete_source_present':(SOURCE/p).is_file()} for p in stages]
    nested_rows=[{'parent':'build.mjs','path':p.removeprefix('./'),'complete_source_present':(SOURCE/p.removeprefix('./')).is_file(),'origin':'generated_from_live-overlay.b64' if p=='./patch-live.mjs' else 'listed_provider_source'} for p in nested]
    # Test the installed restriction in a real child before any source stage.
    probe=subprocess.run([sys.executable,'-c',"import socket,errno; s=socket.socket();\ntry: s.connect(('127.0.0.1',9)); raise AssertionError('network allowed')\nexcept PermissionError as e: assert e.errno==errno.EPERM; print('CONNECT_DENIED_EPERM')"],capture_output=True,text=True,preexec_fn=install,timeout=10)
    assert probe.returncode==0 and 'CONNECT_DENIED_EPERM' in probe.stdout
    with tempfile.TemporaryDirectory(prefix='s01-first-stage-') as tmp:
        tmp=Path(tmp);shutil.copytree(SOURCE,tmp,dirs_exist_ok=True)
        run=subprocess.run(['node','build.mjs'],cwd=tmp,env={'PATH':os.environ.get('PATH',''),'HOME':str(tmp),'TMPDIR':str(tmp)},capture_output=True,text=True,preexec_fn=install,timeout=20)
        assert run.returncode!=0 and 'ENOENT' in run.stderr and 'live-overlay.b64' in run.stderr
        produced=json.loads(__import__('brotli').decompress(b''.join((SOURCE/f'assets.{i}').read_bytes() for i in range(4))))
        for p,text in produced.items():assert (tmp/p).read_bytes()==text.encode('utf8')
        output={'top_level_stages':stage_rows,'nested_imports':nested_rows,'full_pipeline_executed':False,'full_pipeline_successful':False,
            'first_stage_attempt':{'script':'build.mjs','exit_code':run.returncode,'expected_missing_input':'live-overlay.b64','original_asset_outputs_verified':len(produced),'stdout':run.stdout,'stderr':run.stderr},
            'connect_deny_probe':probe.stdout.strip(),'network_restriction':'Linux seccomp: connect, sendto, sendmsg, sendmmsg denied with EPERM; no general sandbox claim',
            'native_compiler_invoked':False,'bot_executed':False,'source_inputs_unchanged':True,
            'toolchain':{'node':subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip(),'dotnet_path':shutil.which('dotnet')}}
        print(json.dumps(output,indent=2))
if __name__=='__main__':main()
