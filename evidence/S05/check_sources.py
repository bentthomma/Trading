"""Bind S05 checks to exact original bytes; no network, overwrite or source repair."""
from pathlib import Path, PurePosixPath
import hashlib, json, stat, zipfile
ROOT=Path(__file__).resolve().parents[2]
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def bytes_sha(b):return hashlib.sha256(b).hexdigest()
def checked_file(path, expected, size=None):
    p=Path(path)
    if p.is_symlink() or not p.is_file():raise ValueError('SOURCE_FILE_TYPE:'+p.name)
    if sha(p)!=expected or (size is not None and p.stat().st_size!=size):raise ValueError('SOURCE_BYTES_CHANGED:'+p.name)
    return p

def safe_members(z):
    seen=set()
    for i in z.infolist():
        n=PurePosixPath(i.filename)
        if n.is_absolute() or '..' in n.parts or '\\' in i.filename or i.filename in seen or stat.S_ISLNK(i.external_attr>>16):raise ValueError('UNSAFE_ARCHIVE_MEMBER')
        seen.add(i.filename)
    if z.testzip() is not None:raise ValueError('ARCHIVE_CRC')

def check(sources,workbook,root=ROOT):
    root=Path(root);b=json.loads((root/'evidence/S05/source-bindings.json').read_text())
    checked_file(root/b['plan']['path'],b['plan']['sha256'])
    for s in b['S02_bindings']:checked_file(root/s['path'],s['sha256'])
    p=checked_file(root/b['platform_archive']['path'],b['platform_archive']['sha256'])
    with zipfile.ZipFile(p) as z:
        safe_members(z)
        for s in b['platform_archive']['members']:
            raw=z.read(s['archive_member'])
            if len(raw)!=s['bytes'] or bytes_sha(raw)!=s['sha256']:raise ValueError('PLATFORM_MEMBER_CHANGED')
    m=b['selected_master_sources'];checked_file(sources,m['sha256'],m['bytes'])
    with zipfile.ZipFile(sources) as z:
        safe_members(z)
        if set(z.namelist())!={r['path']for r in m['members']}:raise ValueError('MASTER_MEMBER_SET')
        for s in m['members']:
            raw=z.read(s['path'])
            if len(raw)!=s['bytes'] or bytes_sha(raw)!=s['sha256']:raise ValueError('MASTER_MEMBER_CHANGED')
    w=b['workbook'];checked_file(workbook,w['sha256'],w['bytes'])
    plan=json.loads((root/b['plan']['path']).read_text());state=json.loads((root/'governance/masterplan/control/state.json').read_text())
    if plan['version']!='1.2.0' or state['steps']['S00']['status']!='passed' or state['steps']['S01']['status']!='passed':raise ValueError('BASE_STATE_CHANGED')
    spec=json.loads((root/'evidence/S05/order-state-machine.json').read_text())
    if spec['product_writer_implemented'] or spec['native_adapter_executed'] or spec['known_gap']['fixed']:raise ValueError('UNSUPPORTED_COMPLETION_CLAIM')
    return {'original_platform_members':len(b['platform_archive']['members']),'master_original_members':len(m['members']),
        'workbook_sha256':w['sha256'],'plan_version':plan['version'],'S05_product_gate':'pending','product_installed':False}

def extract(sources,workbook,destination,root=ROOT):
    check(sources,workbook,root)
    dst=Path(destination);dst.mkdir(parents=True,exist_ok=False)
    b=json.loads((Path(root)/'evidence/S05/source-bindings.json').read_text())
    with zipfile.ZipFile(Path(root)/b['platform_archive']['path']) as z:
        for i in z.infolist():
            if '/Trading_Local/' not in i.filename or i.is_dir():continue
            rel=PurePosixPath(i.filename.split('/Trading_Local/',1)[1]);p=dst/'Trading_Local'/str(rel)
            p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(i))
    with zipfile.ZipFile(sources) as z:
        for i in z.infolist():
            p=dst/'Master'/i.filename;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(z.read(i))
    return dst/'Trading_Local',dst/'Master'
