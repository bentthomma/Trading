"""Real original builder extraction, with SDK download refused rather than faked."""
from pathlib import Path
import os,sys,json,hashlib,zipfile,tempfile,shutil,subprocess,unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from bot_delivery_sources import recover_bytes,verify
NODE=os.environ['EXTREMELAB_TEST_NODE']
SOURCE=ROOT/'baseline/vercel_recovered/src'

def baseline_engine():
    with zipfile.ZipFile(ROOT/'baseline/original_engine121_source.zip') as z:
        out={Path(x).name:z.read(x) for x in z.namelist() if x.startswith('ExtremeLab_1_2_1_Integrationskandidat/src/') and not x.endswith('/')}
    if len(out)!=12:raise AssertionError('Expected twelve genuine engine input files')
    return out

class RecoveryAndBuild(unittest.TestCase):
    def test_donor_and_two_full_production_bindings(self):
        r=verify();self.assertEqual(len(r['recovered']),2);self.assertEqual(r['donor_manifest_members'],11)
    def test_changed_donor_rejected_without_reconstruction(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'changed.zip';data=bytearray((ROOT/'baseline/original_release121_audit.zip').read_bytes());data[-1]^=1;p.write_bytes(data)
            with self.assertRaisesRegex(ValueError,'DONOR_ARCHIVE_CHANGED'):recover_bytes(p)
    def test_previous_sources_plan_and_gate_byte_unchanged(self):
        prior=json.loads((ROOT/'baseline/remoteview_checkpoint/prior_manifest.json').read_text())['files']
        paths=[p for p in prior if p.startswith('baseline/vercel_recovered/src/')]
        self.assertEqual(len(paths),36)
        for p in paths+['baseline/masterplan_1_1_0_plan.json','evidence/S01/GATE_STATUS.json']:
            self.assertEqual(hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),prior[p],p)
    def test_original_download_test_and_security_dependency_unchanged(self):
        with zipfile.ZipFile(ROOT/'baseline/original_release121_audit.zip') as z:
            self.assertEqual(z.read('ExtremeLab_Release_1_2_1/tests/download.test.mjs'),(ROOT/'tests/original_download121.test.mjs').read_bytes())
            self.assertEqual(z.read('ExtremeLab_Release_1_2_1/tests/lib/security.mjs'),(SOURCE/'lib/security.mjs').read_bytes())
    def run_builder(self,mode):
        with tempfile.TemporaryDirectory(prefix='el-builder-boundary-') as tmp:
            t=Path(tmp);work=t/'workspace';work.mkdir();scratch=t/'scratch';scratch.mkdir();tools=t/'refuse-tools';tools.mkdir()
            shutil.copyfile(SOURCE/'build-bot.mjs',work/'build-bot.mjs')
            for i in range(3):shutil.copyfile(SOURCE/f'bot-src.{i}',work/f'bot-src.{i}')
            if mode=='tamper':
                p=work/'bot-src.0';v=bytearray(p.read_bytes());v[20]^=1;p.write_bytes(v)
            elif mode=='missing':(work/'bot-src.1').unlink()
            elif mode=='reordered':
                p,q=work/'bot-src.0',work/'bot-src.1';a,b=p.read_bytes(),q.read_bytes();p.write_bytes(b);q.write_bytes(a)
            # This executable refuses the first external operation. It never fetches
            # or supplies an installer/compiler. The production script stays exact.
            guard=tools/'curl';guard.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$BOUNDARY_LOG"\nprintf "SDK_DOWNLOAD_REFUSED_OFFLINE\\n" >&2\nexit 125\n');guard.chmod(0o755)
            env={k:v for k,v in os.environ.items() if k in ['LANG','LC_ALL','TZ']}
            env.update(PATH=str(tools),TMPDIR=str(scratch),BOUNDARY_LOG=str(t/'curl-arguments.txt'),HOME=str(t))
            r=subprocess.run([NODE,'build-bot.mjs'],cwd=work,env=env,text=True,capture_output=True,timeout=15)
            self.assertNotEqual(r.returncode,0);self.assertFalse((work/'release-artifacts').exists())
            reached=(t/'curl-arguments.txt').exists()
            extracted=list(scratch.glob('extremelab-build-*/src'))
            proof={'mode':mode,'exit':r.returncode,'sdk_download_refused':reached,'native_compilation':False}
            if mode=='valid':
                self.assertTrue(reached);self.assertIn('SDK_DOWNLOAD_REFUSED_OFFLINE',r.stderr);self.assertEqual(len(extracted),1)
                contents={p.name:p.read_bytes() for p in extracted[0].iterdir()};self.assertEqual(contents,baseline_engine())
                args=(t/'curl-arguments.txt').read_text().splitlines();self.assertIn('https://dot.net/v1/dotnet-install.sh',args)
                self.assertFalse(list(scratch.rglob('install.sh')));self.assertFalse(list(scratch.rglob('dotnet')))
                proof['extracted_original_sources']=len(contents);proof['download_arguments']=args[:-1]+['<ephemeral installer path>']
                # Original finally-cleanup is after the build: these are temporary
                # leftovers at the failure boundary, removed by this test owner.
                proof['temporary_source_tree_remains_at_failure']=True
            else:
                self.assertFalse(reached);self.assertEqual(extracted,[])
                if mode in ['tamper','reordered']:self.assertIn('BOT_SOURCE_HASH_MISMATCH',r.stderr)
                else:self.assertIn('ENOENT',r.stderr)
            out=os.environ.get('EXTREMELAB_TEST_REPORTS')
            if out:(Path(out)/f'builder-{mode}.json').write_text(json.dumps(proof,indent=2)+'\n')
    def test_real_builder_extracts_exact_originals_then_refuses_sdk(self):self.run_builder('valid')
    def test_real_builder_rejects_corrupted_or_reordered_source_before_download(self):
        for mode in ['tamper','reordered']:
            with self.subTest(mode=mode):self.run_builder(mode)
    def test_real_builder_missing_segment_never_reaches_download(self):self.run_builder('missing')

if __name__=='__main__':unittest.main(verbosity=2)
