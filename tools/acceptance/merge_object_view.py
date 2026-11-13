"""Private Run026 integration boundary. Never a provider/plan authorization.

Reuses byte-identical Run025-G ObjectSnapshot. All Git execution occurs only in
its disposable object store. Source refs are read as bounded regular files;
source config, merge drivers, replacement refs, hooks and index are not loaded.
Only complete SHA-1 ordinary/bare repositories and attribute-free commit graphs
are currently supported. Concurrent/hostile OS changes remain outside the trust
boundary; two matching local ref reads are not an atomic provider snapshot.
"""
from __future__ import annotations
import os
from pathlib import Path
import re
import stat
from git_object_boundary import ObjectSnapshot, InspectionError, oid

MAX_REF_BYTES = 4 * 1024 * 1024
MAX_COMMITS = 2048

class BoundaryError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)

def require(ok: bool, code: str) -> None:
    if not ok:
        raise BoundaryError(code)

def direct_ref_name(branch: str) -> str:
    require(type(branch) is str and 0 < len(branch) <= 240, 'LOCAL_REF_NAME_INVALID')
    parts = branch.split('/')
    require(all(re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9._-]*', p) and
                not p.endswith(('.', '.lock')) and '..' not in p for p in parts),
            'LOCAL_REF_NAME_INVALID')
    return 'refs/heads/' + branch

def regular_bytes(path: Path, root: Path) -> bytes | None:
    """A missing file stays missing; symlink/FIFO/directory is never evidence."""
    for parent in path.parents:
        if parent == root.parent:
            break
        if parent.exists() or parent.is_symlink():
            require(stat.S_ISDIR(parent.lstat().st_mode), 'LOCAL_REF_PARENT_UNSAFE')
    if not path.exists() and not path.is_symlink():
        return None
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode), 'LOCAL_REF_NONREGULAR')
    require(before.st_size <= MAX_REF_BYTES, 'LOCAL_REF_SIZE_LIMIT')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        start = os.fstat(fd)
        require(stat.S_ISREG(start.st_mode) and
                (before.st_dev, before.st_ino) == (start.st_dev, start.st_ino),
                'LOCAL_REF_CHANGED_DURING_READ')
        chunks = []
        size = 0
        while True:
            part = os.read(fd, 65536)
            if not part:
                break
            chunks.append(part); size += len(part)
            require(size <= MAX_REF_BYTES, 'LOCAL_REF_SIZE_LIMIT')
        end = os.fstat(fd)
        again = path.lstat()
        signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        require(signature(start) == signature(end) == signature(again) and size == start.st_size,
                'LOCAL_REF_CHANGED_DURING_READ')
        return b''.join(chunks)
    finally:
        os.close(fd)

def branch_oid(gitdir: Path, branch: str) -> str:
    name = direct_ref_name(branch)
    loose = regular_bytes(gitdir / name, gitdir)
    if loose is not None:
        require(re.fullmatch(rb'[0-9a-f]{40}\n?', loose) is not None, 'LOCAL_REF_INVALID')
        return loose.strip().decode('ascii')
    packed = regular_bytes(gitdir / 'packed-refs', gitdir)
    require(packed is not None, 'LOCAL_BRANCH_NOT_AT_OBSERVED_MERGE')
    seen = set(); found = None
    for line in packed.splitlines():
        if line.startswith(b'#'):
            continue
        if line.startswith(b'^'):
            require(re.fullmatch(rb'\^[0-9a-f]{40}', line) is not None, 'PACKED_REF_INVALID')
            continue
        match = re.fullmatch(rb'([0-9a-f]{40}) (refs/[^\s\x00-\x20]+)', line)
        require(match is not None, 'PACKED_REF_INVALID')
        rawname = match[2]
        require(rawname not in seen, 'PACKED_REF_DUPLICATE')
        seen.add(rawname)
        if rawname == name.encode('ascii'):
            found = match[1].decode('ascii')
    require(found is not None, 'LOCAL_BRANCH_NOT_AT_OBSERVED_MERGE')
    return found

class MergeObjectView:
    """Per-verification snapshot; no mutable global/current-view singleton."""
    def __init__(self, repo: Path, branch: str, expected: str):
        self.repo = Path(repo).absolute()
        self.branch = branch
        self.expected = oid(expected)
        self.objects = ObjectSnapshot(self.repo)
        self.graph: dict[str, tuple[str, list[str]]] = {}
        self.entered = False

    def __enter__(self):
        require(self.repo.is_dir(), 'LOCAL_GIT_REPO_MISSING')
        require(self.repo.resolve() == self.repo, 'REPOSITORY_SYMLINK_UNSUPPORTED')
        dotgit = self.repo / '.git'
        self.gitdir = dotgit if dotgit.exists() or dotgit.is_symlink() else self.repo
        require(self.gitdir.is_dir() and not self.gitdir.is_symlink(), 'LOCAL_REPOSITORY_LAYOUT_UNSUPPORTED')
        for marker in ('shallow', 'commondir', 'info/grafts', 'reftable'):
            p = self.gitdir / marker
            require(not p.exists() and not p.is_symlink(), 'LOCAL_HISTORY_OVERRIDE_UNSUPPORTED')
        self.check_ref()
        try:
            self.objects.__enter__(); self.entered = True
            self.check_ref()
            return self
        except Exception:
            self.objects.__exit__(None, None, None)
            raise

    def __exit__(self, *args):
        return self.objects.__exit__(*args)

    def check_ref(self):
        require(branch_oid(self.gitdir, self.branch) == self.expected,
                'LOCAL_BRANCH_NOT_AT_OBSERVED_MERGE')

    def info(self, commit: str) -> tuple[str, list[str]]:
        if commit not in self.graph:
            require(len(self.graph) < MAX_COMMITS, 'ANCESTRY_BUDGET_EXCEEDED')
            tree = self.objects.commit_tree(commit)
            data = self.objects.read(commit, 'commit').split(b'\n\n', 1)[0]
            parents = []
            for line in data.split(b'\n'):
                if line.startswith(b'parent '):
                    try:
                        parents.append(oid(line[7:].decode('ascii')))
                    except (UnicodeError, InspectionError):
                        raise BoundaryError('COMMIT_PARENT_INVALID') from None
            require(len(parents) == len(set(parents)) and len(parents) <= 16,
                    'COMMIT_PARENTS_INVALID')
            self.graph[commit] = tree, parents
        return self.graph[commit]

    def validate_graph(self, *tips: str):
        """Hash-check every reachable commit and tree/blob used by merge analysis."""
        pending = list(tips); done = set()
        while pending:
            commit = pending.pop()
            if commit in done:
                continue
            _, parents = self.info(commit)
            _, entries, dirs = self.objects.tree(commit)
            for path in set(entries) | dirs:
                parts = path.split('/')
                require(not any(p in ('', '.', '..') or p.casefold() == '.git' for p in parts),
                        'GIT_TREE_PATH_UNSUPPORTED')
                require(not any(p.casefold() == '.gitattributes' for p in parts),
                        'TRACKED_MERGE_ATTRIBUTES_UNSUPPORTED')
            require(not any(e['mode'] == '160000' for e in entries.values()),
                    'SUBMODULE_MERGE_UNSUPPORTED')
            done.add(commit); pending.extend(parents)

    def ancestor(self, old: str, new: str):
        pending = [new]; seen = set()
        while pending:
            node = pending.pop()
            if node == old:
                return
            if node in seen:
                continue
            seen.add(node); pending.extend(self.info(node)[1])
        raise BoundaryError('UNRELATED_TO_TRUSTED_ROOT')

    def merge_tree(self, base: str, head: str) -> str:
        try:
            result = self.objects._git('merge-tree', '--write-tree', base, head).strip()
        except InspectionError:
            raise BoundaryError('THREE_WAY_MERGE_UNCLEAN_OR_UNAVAILABLE') from None
        require(re.fullmatch(rb'[0-9a-f]{40}', result) is not None, 'EXPECTED_TREE_SHA_INVALID')
        tree = result.decode('ascii')
        self.objects.read(tree, 'tree')
        self.check_ref()
        return tree
