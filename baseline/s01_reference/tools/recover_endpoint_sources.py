#!/usr/bin/env python3
"""Reproduce five original sources, with provider UID as the acceptance anchor.

No completion of arbitrary missing code: only captured full bytes or a bounded
archived suffix recipe is considered. Output is accepted only after matching the
full provider SHA-1, recorded SHA-256 and encoded length. No original is edited.
"""
from __future__ import annotations
import argparse,base64,hashlib,json,re,stat
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
class RecoveryError(ValueError):pass

def safe_file(root:Path,rel:str)->Path:
    q=PurePosixPath(rel)
    if not isinstance(rel,str) or not rel or q.is_absolute() or '..' in q.parts or '\\' in rel or str(q)!=rel:
        raise RecoveryError('INVALID_PATH')
    p=root
    for part in q.parts:
        p=p/part
        if p.is_symlink():raise RecoveryError('SYMLINK_NOT_ALLOWED')
    if p.exists() and not stat.S_ISREG(p.lstat().st_mode):raise RecoveryError('NOT_REGULAR_FILE')
    return p

def reconstruct(c:dict,provider_uid:str,root:Path=ROOT)->bytes:
    if not re.fullmatch(r'[0-9a-f]{40}',provider_uid) or c['vercel_source_uid']!=provider_uid:
        raise RecoveryError('PROVIDER_UID_MISMATCH')
    try:prefix=base64.b64decode(c['data_base64'],validate=True)
    except (ValueError,TypeError) as e:raise RecoveryError('INVALID_BASE64') from e
    if len(prefix)!=c['prefix_bytes']:raise RecoveryError('PREFIX_LENGTH_MISMATCH')
    status=c['capture_status']
    if status=='complete':
        if c['omittedStringChars']!=0 or c['method']!='complete_connector_response':raise RecoveryError('INCONSISTENT_COMPLETENESS')
        result=prefix
    elif status=='truncated':
        if c['omittedStringChars']<=0 or len(prefix)<80:raise RecoveryError('TRUNCATED_NOT_RECOVERABLE')
        donor=safe_file(root,c['donor_path']).read_bytes()
        if hashlib.sha256(donor).hexdigest()!=c['donor_sha256']:raise RecoveryError('DONOR_HASH_MISMATCH')
        if c['overlap_bytes']!=80 or c['prefix_end']!=len(prefix):raise RecoveryError('OVERLAP_BINDING_MISMATCH')
        end=c['donor_suffix_start'];anchor=prefix[-80:]
        if not isinstance(end,int) or end<80 or end>len(donor) or donor[end-80:end]!=anchor or donor.count(anchor)!=1:
            raise RecoveryError('OVERLAP_MISSING_OR_AMBIGUOUS')
        suffix=donor[end:];transform=c.get('transformation','as-is')
        if transform=='as-is':pass
        elif transform=='remove-comment':
            suffix=b'\n'.join(line for line in suffix.split(b'\n') if not line.lstrip().startswith(b'//'))
        elif transform=='compact-lines-preserve-export':
            # Specific formatting recovery; full hash prevents semantic guessing.
            if suffix.splitlines()[-1]!=b'export default server;':raise RecoveryError('UNEXPECTED_EXPORT_BOUNDARY')
            suffix=b''.join(line.strip() for line in suffix.splitlines() if not line.startswith(b'export default'))+b'\nexport default server;\n'
        else:raise RecoveryError('UNKNOWN_TRANSFORMATION')
        result=prefix+suffix
    else:raise RecoveryError('UNKNOWN_CAPTURE_STATUS')
    if len(base64.b64encode(result))!=len(c['data_base64'])+c['omittedStringChars']:
        raise RecoveryError('FULL_ENCODED_LENGTH_MISMATCH')
    if hashlib.sha1(result).hexdigest()!=provider_uid:raise RecoveryError('FULL_PROVIDER_HASH_MISMATCH')
    if len(result)!=c['bytes'] or hashlib.sha256(result).hexdigest()!=c['sha256']:
        raise RecoveryError('FULL_LOCAL_BINDING_MISMATCH')
    return result

def run(write_dir:Path|None=None)->dict:
    tree=json.loads((ROOT/'vendor-manifests/vercel_prod_source_tree.json').read_text())
    uids={x['path']:x['vercel_source_uid'] for x in tree['files']}
    captures=json.loads((ROOT/'evidence/S01/S01_ENDPOINT_PROVIDER_CAPTURES.json').read_text())
    output=[]
    for c in captures:
        path=c['path']
        if path not in uids:raise RecoveryError('UNLISTED_SOURCE')
        b=reconstruct(c,uids[path])
        present=safe_file(ROOT/'baseline/vercel_recovered',path)
        if present.read_bytes()!=b:raise RecoveryError('RECORDED_ORIGINAL_MISMATCH')
        if write_dir is not None:
            p=safe_file(write_dir,path)
            if p.exists():raise RecoveryError('OUTPUT_EXISTS_NO_OVERWRITE')
            p.parent.mkdir(parents=True,exist_ok=True)
            with p.open('xb') as f:f.write(b)
        output.append({'path':path,'bytes':len(b),'sha1':hashlib.sha1(b).hexdigest(),'sha256':hashlib.sha256(b).hexdigest(),'method':c['method'],'transformation':c.get('transformation')})
    return {'work_id':'S01-ENDPOINTRECOVERY-20261113','source_files_reproduced':len(output),'files':output,'publishes':False,'product_repair':False,'full_website_build':False}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--write-dir',type=Path);a=p.parse_args()
    print(json.dumps(run(a.write_dir),indent=2))
