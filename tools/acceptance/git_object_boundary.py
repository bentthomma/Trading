"""Private offline Git-object diagnostic. No provider or trading authorization.

Inspection runs in a disposable bare repository populated only with regular
object-store files. The source repository's config, refs, hooks and attributes
are never used by Git. Objects are read by full SHA-1 and their bytes rehashed.
This is NOT a sandbox against a hostile OS/Git binary and not a merge gate.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import unicodedata

HEX40 = re.compile(r'^[0-9a-f]{40}$')
ALLOWED_EXACT = {'.github/workflows/plan-gates.yml'}
ALLOWED_PREFIX = ('governance/', 'docs/plan/', 'tools/acceptance/', 'evidence/S00/')
FORBIDDEN_PATHS = {'governance/masterplan/plan.json', 'governance/masterplan/control/plan.lock.json'}
MAX_STORE_BYTES = 128 * 1024 * 1024
MAX_STORE_FILES = 20000
MAX_OBJECT_BYTES = 8 * 1024 * 1024
MAX_EXPANDED_BYTES = 128 * 1024 * 1024
MAX_TREE_ENTRIES = 50000
MAX_TREE_DEPTH = 64

class InspectionError(ValueError):
    """Missing, unsupported or inconsistent evidence: never a successful audit."""

def fail(code: str):
    raise InspectionError(code)

def oid(value):
    if not isinstance(value, str) or not HEX40.fullmatch(value):
        fail('FULL_LOWERCASE_SHA1_REQUIRED')
    return value

def _regular(path: Path):
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode):
        fail('OBJECT_STORE_NONREGULAR_FILE')
    return s

def _directory(path: Path):
    if not stat.S_ISDIR(path.lstat().st_mode):
        fail('REPOSITORY_DIRECTORY_REQUIRED')

def _copy_regular(src: Path, dest: Path, limit: int) -> int:
    """No symlink following for files; copy, never hardlink, never mutate source."""
    before = _regular(src)
    if before.st_size > limit:
        fail('OBJECT_STORE_BUDGET_EXCEEDED')
    fd = os.open(src, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or (st.st_dev, st.st_ino) != (before.st_dev, before.st_ino):
            fail('OBJECT_STORE_CHANGED_DURING_COPY')
        dest.parent.mkdir(parents=True, exist_ok=True)
        n = 0
        with dest.open('xb') as out:
            while True:
                b = os.read(fd, 65536)
                if not b:
                    break
                n += len(b)
                if n > limit:
                    fail('OBJECT_STORE_BUDGET_EXCEEDED')
                out.write(b)
        after = os.fstat(fd)
        if (after.st_size, after.st_mtime_ns, after.st_ctime_ns) != (st.st_size, st.st_mtime_ns, st.st_ctime_ns) or n != st.st_size:
            fail('OBJECT_STORE_CHANGED_DURING_COPY')
        return n
    finally:
        os.close(fd)

class ObjectSnapshot:
    """Local immutable inspection copy. Ordinary .git directories and bare repos only."""
    def __init__(self, repo):
        self.repo = Path(repo).absolute()
        self.tmp = None
        self.cache = {}
        self.seen_nodes = 0
        self.expanded_bytes = 0

    def __enter__(self):
        try:
            _directory(self.repo)
            dotgit = self.repo / '.git'
            if dotgit.exists() or dotgit.is_symlink():
                _directory(dotgit)  # .git files / linked worktrees intentionally unsupported
                source = dotgit / 'objects'
            else:
                if not (self.repo / 'HEAD').is_file():
                    fail('NOT_SUPPORTED_LOCAL_REPOSITORY')
                source = self.repo / 'objects'
            _directory(source)
            self.tmp = tempfile.TemporaryDirectory(prefix='extremelab-object-snapshot-')
            self.root = Path(self.tmp.name)
            self.gitdir = self.root / 'repo.git'
            (self.gitdir / 'objects').mkdir(parents=True)
            (self.gitdir / 'refs').mkdir()
            (self.gitdir / 'HEAD').write_text('ref: refs/heads/unborn\n')
            (self.gitdir / 'config').write_text('[core]\nrepositoryformatversion = 0\nbare = true\n')
            self.exe = shutil.which('git', path=os.defpath)
            if not self.exe:
                fail('TRUSTED_GIT_EXECUTABLE_MISSING')
            self.env = {
                'PATH': os.defpath, 'HOME': str(self.root), 'XDG_CONFIG_HOME': str(self.root),
                'LC_ALL': 'C', 'LANG': 'C', 'GIT_CONFIG_NOSYSTEM': '1',
                'GIT_CONFIG_SYSTEM': os.devnull, 'GIT_CONFIG_GLOBAL': os.devnull,
                'GIT_CONFIG_COUNT': '0', 'GIT_ATTR_NOSYSTEM': '1',
                'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_NO_LAZY_FETCH': '1',
                'GIT_TERMINAL_PROMPT': '0', 'GIT_OPTIONAL_LOCKS': '0',
                'GIT_ALLOW_PROTOCOL': '',
            }
            count = size = 0
            for directory, dirs, files in os.walk(source, followlinks=False):
                for name in dirs:
                    _directory(Path(directory)/name)
                for name in sorted(files):
                    src = Path(directory)/name
                    rel = src.relative_to(source)
                    _regular(src)
                    if rel.as_posix() in ('info/alternates', 'info/http-alternates'):
                        fail('ALTERNATE_OBJECT_STORE_UNSUPPORTED')
                    # Ignore object-db acceleration hints; they cannot define objects.
                    keep = (len(rel.parts)==2 and bool(re.fullmatch(r'[0-9a-f]{2}', rel.parts[0]))
                            and bool(re.fullmatch(r'[0-9a-f]{38}', rel.parts[1])))
                    keep |= (len(rel.parts)==2 and rel.parts[0]=='pack' and
                             bool(re.fullmatch(r'pack-[0-9a-f]{40}\.(pack|idx)', rel.parts[1])))
                    if not keep:
                        continue
                    count += 1
                    if count > MAX_STORE_FILES:
                        fail('OBJECT_STORE_FILE_LIMIT')
                    size += _copy_regular(src, self.gitdir/'objects'/rel, MAX_STORE_BYTES-size)
            self.copied_files, self.copied_bytes = count, size
            return self
        except (OSError, ValueError):
            if self.tmp:
                self.tmp.cleanup()
            raise

    def __exit__(self, *args):
        if self.tmp:
            self.tmp.cleanup()

    def _git(self, *args, data=None):
        argv = [self.exe, '--no-replace-objects', '--no-lazy-fetch',
                '--git-dir='+str(self.gitdir), '-c', 'core.hooksPath='+os.devnull,
                '-c', 'protocol.allow=never', *args]
        try:
            p = subprocess.run(argv, input=data, capture_output=True, env=self.env,
                               cwd=self.root, timeout=10, check=True)
        except (OSError, subprocess.SubprocessError):
            fail('LOCAL_OBJECT_READ_FAILED')
        return p.stdout

    def read(self, name, expected=None):
        oid(name)
        if name not in self.cache:
            size_text = self._git('cat-file', '-s', name).strip()
            if not size_text.isdigit() or int(size_text) > MAX_OBJECT_BYTES:
                fail('OBJECT_SIZE_LIMIT')
            if self.expanded_bytes + int(size_text) > MAX_EXPANDED_BYTES:
                fail('EXPANDED_OBJECT_BUDGET')
            raw = self._git('cat-file', '--batch', data=(name+'\n').encode('ascii'))
            header, sep, body = raw.partition(b'\n')
            fields = header.split()
            if len(fields)!=3 or not fields[2].isdigit() or fields[0].decode()!=name:
                fail('MALFORMED_OBJECT_REPLY')
            kind = fields[1].decode('ascii', 'strict')
            if kind not in ('blob', 'tree', 'commit', 'tag'):
                fail('OBJECT_TYPE_UNSUPPORTED')
            n = int(fields[2])
            if n!=int(size_text) or len(body)!=n+1 or not body.endswith(b'\n'):
                fail('OBJECT_READ_SIZE_MISMATCH')
            payload = body[:-1]
            digest = hashlib.sha1(kind.encode()+b' '+str(n).encode()+b'\0'+payload).hexdigest()
            if digest!=name:
                fail('OBJECT_HASH_MISMATCH')
            self.expanded_bytes += n
            self.cache[name]=(kind,payload)
        kind, payload = self.cache[name]
        if expected and kind!=expected:
            fail('OBJECT_TYPE_MISMATCH')
        return payload

    def commit_tree(self, name):
        data = self.read(name, 'commit')
        header, sep, _ = data.partition(b'\n\n')
        tree_lines = [l for l in header.split(b'\n') if l.startswith(b'tree ')]
        if not sep or not header.startswith(b'tree ') or len(tree_lines)!=1:
            fail('MALFORMED_COMMIT_TREE')
        try:
            return oid(tree_lines[0][5:].decode('ascii'))
        except UnicodeError:
            fail('MALFORMED_COMMIT_TREE')

    def tree(self, commit):
        result = {}
        directories = set()
        def walk(treeid, prefix, depth):
            if depth > MAX_TREE_DEPTH:
                fail('TREE_DEPTH_LIMIT')
            raw = self.read(treeid,'tree')
            offset=0; names=set()
            if not raw and prefix:
                result[prefix]={'mode':'040000','type':'tree','object_sha':treeid}
            while offset<len(raw):
                sp=raw.find(b' ',offset);nul=raw.find(b'\0',sp+1)
                if sp<0 or nul<0 or nul+21>len(raw):
                    fail('MALFORMED_TREE')
                mode=raw[offset:sp]; name=raw[sp+1:nul]; child=raw[nul+1:nul+21].hex(); offset=nul+21
                if not name or b'/' in name or name in names:
                    fail('DUPLICATE_OR_INVALID_TREE_ENTRY')
                names.add(name)
                try: text=name.decode('utf-8','strict')
                except UnicodeError: fail('NON_UTF8_TREE_PATH')
                path=(prefix+'/' if prefix else '')+text
                self.seen_nodes += 1
                if self.seen_nodes>MAX_TREE_ENTRIES:
                    fail('TREE_ENTRY_LIMIT')
                if mode==b'40000':
                    directories.add(path);walk(child,path,depth+1)
                elif mode in (b'100644',b'100755',b'120000'):
                    self.read(child,'blob')
                    result[path]={'mode':mode.decode(),'type':'blob','object_sha':child}
                elif mode==b'160000':
                    # A gitlink refers to another repository; never fetch or traverse.
                    result[path]={'mode':'160000','type':'commit','object_sha':child}
                else:
                    fail('UNSUPPORTED_TREE_MODE')
        treeid=self.commit_tree(commit);walk(treeid,'',0)
        return treeid,result,directories

def scope_reason(path):
    if not isinstance(path,str) or not path or path.startswith('/') or '\\' in path:
        return 'PATH_FORMAT'
    try:
        path.encode('utf-8','strict')
    except UnicodeError:
        return 'PATH_FORMAT'
    parts=path.split('/')
    if any(p in ('','.','..') for p in parts):
        return 'PATH_FORMAT'
    if len(path.encode('utf-8'))>4096 or any(len(p.encode('utf-8'))>255 for p in parts):
        return 'PATH_LENGTH_POLICY'
    if any(unicodedata.category(c).startswith('C') for c in path):
        return 'CONTROL_CHARACTER'
    components=[unicodedata.normalize('NFKC',s).casefold() for s in parts]
    if any(s in ('.git','git~1') for s in components):
        return 'GIT_ADMIN_PATH'
    if any(s.startswith('.env') or 'credential' in s or 'secret' in s for s in components):
        return 'SENSITIVE_PATH'
    if any(any(c in '<>:"|?*' for c in s) for s in components):
        return 'AMBIGUOUS_PLATFORM_PATH'
    devices={'con','prn','aux','nul','conin$','conout$'}|{f'{p}{i}' for p in ('com','lpt') for i in range(1,10)}
    if any(s.endswith((' ','.')) or s.split('.')[0].rstrip(' ') in devices for s in components):
        return 'AMBIGUOUS_PLATFORM_PATH'
    # Case/normalization variants cannot escape canonical-pin detection.
    if '/'.join(components) in {p.casefold() for p in FORBIDDEN_PATHS}:
        return 'CANONICAL_PIN_IMMUTABLE'
    if path in ALLOWED_EXACT or any(path.startswith(p) for p in ALLOWED_PREFIX):
        return None
    return 'OUTSIDE_S00_SCOPE'

def _delta(old, new):
    removed=set(old)-set(new);added=set(new)-set(old);out=[]
    # Only unambiguous identical-object renames; others remain explicit D+A.
    def sig(v):return v['mode'],v['type'],v['object_sha']
    for a in sorted(list(removed)):
        matches=[b for b in added if sig(old[a])==sig(new[b])]
        if len(matches)==1 and sum(sig(old[x])==sig(old[a]) for x in removed)==1:
            b=matches[0];out.append({'status':'R100','paths':[a,b]});removed.remove(a);added.remove(b)
    out += [{'status':'D','paths':[a]} for a in sorted(removed)]
    out += [{'status':'A','paths':[a]} for a in sorted(added)]
    out += [{'status':'M','paths':[a]} for a in sorted(set(old)&set(new)) if old[a]!=new[a]]
    return sorted(out,key=lambda c:tuple(c['paths']))

def audit(repo,base_sha,result_sha,*,current_main_sha=None,expected_tree_sha=None):
    oid(base_sha);oid(result_sha)
    with ObjectSnapshot(repo) as snapshot:
        _,old,old_dirs=snapshot.tree(base_sha)
        tree,new,new_dirs=snapshot.tree(result_sha)
        delta=_delta(old,new);problems=[]
        def problem(code,path=None):
            entry={'code':code,'path':path}
            if entry not in problems:problems.append(entry)
        if current_main_sha is not None and current_main_sha!=base_sha:problem('BASE_DRIFT')
        if expected_tree_sha is not None and (not isinstance(expected_tree_sha,str) or not HEX40.fullmatch(expected_tree_sha) or expected_tree_sha!=tree):
            problem('TREE_READBACK_MISMATCH')
        for paths in (set(old)|old_dirs, set(new)|new_dirs):
            folded={}
            for p in sorted(paths):
                hygiene=scope_reason(p)
                if hygiene in ('PATH_FORMAT','PATH_LENGTH_POLICY','CONTROL_CHARACTER','GIT_ADMIN_PATH','AMBIGUOUS_PLATFORM_PATH'):
                    problem(hygiene,p)
                k=unicodedata.normalize('NFKC',p).casefold()
                if k in folded and folded[k]!=p:problem('CASE_UNICODE_ALIAS',p)
                folded[k]=p
        for c in delta:
            c['entries']=[{'path':p,'old_mode':old.get(p,{}).get('mode'),'new_mode':new.get(p,{}).get('mode'),
                           'old_type':old.get(p,{}).get('type'),'new_type':new.get(p,{}).get('type')} for p in c['paths']]
            for p in c['paths']:
                bad=scope_reason(p)
                if bad:problem(bad,p)
                for entry in (old.get(p),new.get(p)):
                    if entry and entry['mode'] in ('120000','160000'):problem('LINK_OR_SUBMODULE_CHANGED',p)
                    if entry and entry['type']=='tree':problem('EMPTY_TREE_CHANGED',p)
        return {'schema_version':2,'scope':'OFFLINE_GIT_TREE_DIAGNOSTIC_ONLY',
                'base_commit':base_sha,'result_commit':result_sha,'result_tree_sha':tree,
                'changes':delta,'diagnostic':'SCOPE_PROBLEM' if problems else 'NO_SCOPE_FINDING',
                'issues':problems,'object_snapshot':{'files_copied':snapshot.copied_files,
                    'bytes_copied':snapshot.copied_bytes,'objects_rehashed':len(snapshot.cache),
                    'expanded_bytes':snapshot.expanded_bytes,'source_config_used':False,'replace_refs_used':False},
                'authorizations':{'github_write':False,'plan_finish':False,'trade':False}}

# Compatibility for callers which used the read helpers. No arbitrary Git command runner.
def command(repo,*args):
    fail('ARBITRARY_GIT_COMMAND_API_REMOVED')
def changes(repo,before,after):
    return audit(repo,before,after)['changes']
def full_sha(repo,revision):
    with ObjectSnapshot(repo) as s:s.read(oid(revision),'commit')
    return revision
def tree_items(repo,commit):
    with ObjectSnapshot(repo) as s:return s.tree(oid(commit))[1]

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',required=True);p.add_argument('--base',required=True);p.add_argument('--result',required=True)
    p.add_argument('--current-main');p.add_argument('--expected-tree');a=p.parse_args()
    try:
        result=audit(a.repo,a.base,a.result,current_main_sha=a.current_main,expected_tree_sha=a.expected_tree)
    except (ValueError,OSError) as e:
        print(json.dumps({'diagnostic':'INSPECTION_FAILED','error':str(e),
                          'authorizations':{'github_write':False,'plan_finish':False,'trade':False}}))
        raise SystemExit(2)
    print(json.dumps(result,indent=2,ensure_ascii=True))
    raise SystemExit(1 if result['issues'] else 0)
