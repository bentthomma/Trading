#!/usr/bin/env python3
"""Read-only integrity and scope binding, never an independent approval."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[3];A=Path(__file__).resolve().parent
H=lambda b:hashlib.sha256(b).hexdigest()
def check():
 b=json.loads((A/'source-bindings.json').read_text());old=(ROOT/b['baseline_path']).read_bytes();new=(A/'candidate/core/control.mjs').read_bytes()
 assert H(old)==b['baseline_sha256'];assert H(new)==b['candidate_sha256'];assert H((A/'negative-ack-receipt.patch').read_bytes())==b['patch_sha256']
 def outside(x):s=x.decode();i=s.index('  ack(input,actor){');j=s.index('  export(',i);return s[:i],s[j:]
 assert outside(old)==outside(new),'CHANGE_OUTSIDE_ACK'
 assert H((ROOT/'baseline/original_platform097.zip').read_bytes())==b['original_archive_sha256']
 assert H((ROOT/'baseline/masterplan_1_1_0_plan.json').read_bytes())=='60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d'
 manifest=json.loads((ROOT/'baseline/negative_ack_checkpoint/ORIGINAL_MANIFEST.json').read_text())['files'];changed=[]
 for rel,h in manifest.items():
  if (ROOT/rel).is_file() and H((ROOT/rel).read_bytes())==h:continue
  backup=ROOT/'baseline/negative_ack_checkpoint'/rel
  assert backup.is_file() and H(backup.read_bytes())==h,('PREDECESSOR_LOST',rel)
  changed.append(rel)
 assert sorted(changed)==['README.md','RUN_S01_REPORT.md','UEBERGABE.md'],changed
 with zipfile.ZipFile(ROOT/'baseline/original_platform097.zip') as z:
  prefix='Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/'
  for item in b['original_sources']:
   assert H(z.read(prefix+item['path']))==item['sha256'],item['path']
 # The tests reuse the previous fixture; the only textual changes are exports.
 prior=(ROOT/'evidence/S01/control-ack-audit/control_ack.test.mjs').read_text().split("test('C01 ")[0]
 expected=prior.replace('const ok=','export const ok=').replace('const err=','export const err=').replace('async function setup(','export async function setup(')
 assert (A/'ack_fixture.mjs').read_text()==expected,'FIXTURE_REPLACED'
 return {'predecessor_files_reconstructable':len(manifest),'predecessor_same_path':len(manifest)-len(changed),'modified_candidate_methods':['Control.ack'],'original_sources_bound':len(b['original_sources']),'schema_changed':False,'formal_gates_unchanged':True,'original_product_modified':False}
if __name__=='__main__':print(json.dumps(check(),indent=2))
