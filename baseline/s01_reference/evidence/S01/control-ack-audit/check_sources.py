#!/usr/bin/env python3
"""Read-only binding check. Integrity is not independent review or activation."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[3]
AUDIT=Path(__file__).resolve().parent
H=lambda b:hashlib.sha256(b).hexdigest()
def check():
    data=json.loads((AUDIT/'source-bindings.json').read_text())
    ar=ROOT/data['archive']['path']
    assert H(ar.read_bytes())==data['archive']['sha256'],'ARCHIVE_CHANGED'
    with zipfile.ZipFile(ar) as z:
        for f in data['sources']:
            b=z.read(data['archive']['prefix']+f['path']);assert H(b)==f['sha256'],f['path']
            lines=b.decode().splitlines(keepends=True)
            for frag in f['fragments']:
                part=''.join(lines[frag['start_line']-1:frag['end_line']]).encode()
                assert H(part)==frag['sha256'],'FRAGMENT_CHANGED: '+f['path']
        old=z.read(data['archive']['prefix']+'core/control.mjs').decode()
    expected=old
    for e in data['exact_edits']:
        assert expected.count(e['old'])==1,'EDIT_ANCHOR_NOT_UNIQUE'
        expected=expected.replace(e['old'],e['new'])
    candidate=(AUDIT/'candidate/core/control.mjs').read_bytes()
    assert candidate==expected.encode(),'UNDECLARED_CODE_CHANGE'
    assert H(candidate)==data['candidate_sha256'],'CANDIDATE_CHANGED'
    assert H((ROOT/'baseline/masterplan_1_1_0_plan.json').read_bytes())=='60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d'
    old_manifest=json.loads((ROOT/'baseline/control_ack_checkpoint/ORIGINAL_MANIFEST.json').read_text())['files']
    changed=[]
    for rel,h in old_manifest.items():
        p=ROOT/rel
        if H(p.read_bytes())==h:continue
        p=ROOT/'baseline/control_ack_checkpoint'/rel
        assert p.is_file() and H(p.read_bytes())==h,'PREDECESSOR_LOST: '+rel
        changed.append(rel)
    assert sorted(changed)==['README.md','RUN_S01_REPORT.md','UEBERGABE.md'],changed
    return {'source_files':len(data['sources']),'fragment_bindings':sum(len(f['fragments']) for f in data['sources']),
            'predecessor_reconstructable':len(old_manifest),'predecessor_unchanged_same_path':len(old_manifest)-len(changed),
            'candidate_product_files':1,'existing_product_originals_changed':0,'new_website_inputs':0,'formal_acceptance':False}
if __name__=='__main__':
    print(json.dumps(check(),ensure_ascii=False,indent=2))
