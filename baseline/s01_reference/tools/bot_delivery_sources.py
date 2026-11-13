#!/usr/bin/env python3
"""Read-only recovery proof. No install, network, compiler, or broker actions."""
from pathlib import Path
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
DONOR_SHA='c7ed79c05ecfbdd1ba75e0974aa850de44d78ed265859621570d8a8dadc24c0c'
PREFIX='ExtremeLab_Release_1_2_1/'
TARGETS={
 'src/build-bot.mjs':('deployment/build-bot.mjs','cb2628ce0d6dafe7f0a5805c23ac71df0ed1aa4b'),
 'src/api/bot-download.js':('deployment/bot-download.js','6aea26a19a9f84fd97286554d44a6d564264329e'),
}
def sha256(data:bytes)->str:return hashlib.sha256(data).hexdigest()
def recover_bytes(archive:Path)->dict[str,bytes]:
    """Return only completely hash-bound source bytes; never infer missing suffixes."""
    if sha256(archive.read_bytes())!=DONOR_SHA:raise ValueError('DONOR_ARCHIVE_CHANGED')
    result={}
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:raise ValueError('CRC_FAILED')
        rows={}
        for line in z.read(PREFIX+'SHA256SUMS.txt').decode().splitlines():
            digest,name=line.split('  ',1)
            if name in rows:raise ValueError('DUPLICATE_MANIFEST_PATH')
            rows[name]=digest
            if sha256(z.read(PREFIX+name))!=digest:raise ValueError('DONOR_MEMBER_CHANGED')
        names={i.filename for i in z.infolist() if not i.is_dir()}
        if names!={PREFIX+x for x in rows}|{PREFIX+'SHA256SUMS.txt'}:raise ValueError('DONOR_FILE_SET_CHANGED')
        for target,(source,uid) in TARGETS.items():
            raw=z.read(PREFIX+source)
            cleaned=b''.join(line for line in raw.splitlines(keepends=True) if not line.strip().startswith(b'//'))
            if hashlib.sha1(cleaned).hexdigest()!=uid:raise ValueError('FULL_SOURCE_UID_MISMATCH')
            result[target]=cleaned
    return result

def verify(root:Path=ROOT)->dict:
    recovered=recover_bytes(root/'baseline/original_release121_audit.zip')
    rows=[]
    for path,data in recovered.items():
        actual=(root/'baseline/vercel_recovered'/path).read_bytes()
        if actual!=data:raise ValueError('RECOVERED_SOURCE_CHANGED: '+path)
        rows.append({'path':path,'bytes':len(data),'sha256':sha256(data)})
    return {'recovered':rows,'donor_manifest_members':11,'native_build':False,'formal_acceptance':False}
if __name__=='__main__':print(json.dumps(verify(),indent=2))
