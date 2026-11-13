#!/usr/bin/env python3
"""Check the exact private package file set, bytes and unchanged formal gate state.

Integrity is not independent review. The externally supplied ZIP hash remains the
anchor for this self-contained manifest. No files or status records are written.
"""
from pathlib import Path
import hashlib,json,stat,sys
root=Path(__file__).resolve().parent
try:
    manifest=root/'MANIFEST.json'
    if not stat.S_ISREG(manifest.lstat().st_mode):raise ValueError('MANIFEST_NOT_REGULAR')
    data=json.loads(manifest.read_text())
    files={}
    for p in root.rglob('*'):
        if '__pycache__' in p.parts:continue
        mode=p.lstat().st_mode
        if stat.S_ISLNK(mode):raise ValueError('SYMLINK_NOT_ALLOWED: '+str(p.relative_to(root)))
        if stat.S_ISDIR(mode):continue
        if not stat.S_ISREG(mode):raise ValueError('SPECIAL_FILE_NOT_ALLOWED')
        rel=p.relative_to(root).as_posix()
        if rel=='MANIFEST.json':continue
        files[rel]=p
    if set(files)!=set(data['files']):raise ValueError('SOURCE_FILE_SET_MISMATCH')
    for rel,digest in data['files'].items():
        if hashlib.sha256(files[rel].read_bytes()).hexdigest()!=digest:raise ValueError('HASH_MISMATCH: '+rel)
    plan=json.loads((root/'baseline/masterplan_1_1_0_plan.json').read_text())
    gate=json.loads((root/'evidence/S01/GATE_STATUS.json').read_text())
    if plan['version']!='1.1.0' or gate['finish_authorized'] or gate['s01_official_status']!='pending':raise ValueError('CANONICAL_GATE_STATE_CHANGED')
    print(json.dumps({'verified_files':len(files),'formal_status_unchanged':True,'s01_private_work':'active','independent_review':False}))
except (OSError,ValueError,KeyError) as exc:
    print('REJECTED',str(exc));sys.exit(2)
