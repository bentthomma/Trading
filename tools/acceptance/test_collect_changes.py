"""Behavioural tests against real, isolated Git repositories (stdlib only)."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("collector", Path(__file__).with_name("collect_changes.py"))
C = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(C)


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="git-change-fixture-")
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        self.env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
                        GIT_TERMINAL_PROMPT="0", LC_ALL="C")
        self.git("init", "--initial-branch=main")
        self.write("keep.txt", "unchanged\n")
        self.write("modify.txt", "old\n")
        self.write("delete.txt", "remove\n")
        self.write("rename.txt", "recognizable unique rename contents\n")
        self.base = self.commit("base")

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args, repo=None):
        command = [shutil.which("git", path=os.defpath), "-c", "user.name=Fixture",
                   "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgSign=false",
                   "-c", "core.hooksPath=" + os.devnull, "-C", str(repo or self.repo), *args]
        return subprocess.run(command, env=self.env, stdin=subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout

    def write(self, name, value, repo=None):
        file = (repo or self.repo) / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(value)

    def commit(self, message, repo=None):
        self.git("add", "-A", repo=repo)
        self.git("commit", "-m", message, repo=repo)
        return self.git("rev-parse", "HEAD", repo=repo).strip().decode()

    def collect(self, head=None, **kwargs):
        return C.collect(self.repo, self.base, head or self.base, **kwargs)

    def cli(self, *extra, base=None, head=None, output=None):
        return subprocess.run([sys.executable, str(Path(C.__file__)), "--repo", str(self.repo),
                               "--base", base or self.base, "--head", head or self.base,
                               "--output", str(output or self.root / "report.json"), *extra],
                              env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def test_clean_exact_revisions(self):
        r = self.collect()
        self.assertTrue(r["clean_worktree"])
        self.assertEqual(r["changed_files"], [])
        self.assertEqual(r["base_revision"], self.base)
        self.assertEqual(r["worktree_revision"], self.base)

    def test_add_modify_delete_rename_both_paths(self):
        self.write("new.txt", "new\n")
        self.write("modify.txt", "modified\n")
        (self.repo / "delete.txt").unlink()
        (self.repo / "rename.txt").rename(self.repo / "renamed.txt")
        head = self.commit("changes")
        r = self.collect(head)
        self.assertTrue(r["clean_worktree"])
        self.assertEqual(set(r["changed_files"]), {"new.txt", "modify.txt", "delete.txt", "rename.txt", "renamed.txt"})
        rename = next(x for x in r["commit_changes"] if x["status"].startswith("R"))
        self.assertEqual(rename["paths"], ["rename.txt", "renamed.txt"])
        self.assertEqual(next(x for x in r["commit_changes"] if x["status"] == "D")["new_mode"], "000000")

    def test_copy_includes_source_and_destination(self):
        shutil.copyfile(self.repo / "rename.txt", self.repo / "copied.txt")
        head = self.commit("copy")
        r = self.collect(head)
        copied = next(x for x in r["commit_changes"] if x["status"].startswith("C"))
        self.assertEqual(copied["paths"], ["rename.txt", "copied.txt"])
        self.assertEqual(set(r["changed_files"]), {"rename.txt", "copied.txt"})

    def test_mode_and_symlink_type_change_without_following_target(self):
        (self.repo / "modify.txt").chmod(0o755)
        (self.repo / "delete.txt").unlink()
        (self.repo / "delete.txt").symlink_to(self.root / "nonexistent-secret-target")
        head = self.commit("modes")
        r = self.collect(head)
        entries = {x["paths"][0]: x for x in r["commit_changes"]}
        self.assertEqual(entries["modify.txt"]["new_mode"], "100755")
        self.assertEqual(entries["delete.txt"]["status"], "T")
        self.assertEqual(entries["delete.txt"]["new_mode"], "120000")

    def test_worktree_mode_change_not_hidden_by_repository_configuration(self):
        self.git("config", "core.fileMode", "false")
        (self.repo / "modify.txt").chmod(0o755)
        r = self.collect()
        self.assertFalse(r["clean_worktree"])
        change = next(x for x in r["worktree_changes"] if x["paths"] == ["modify.txt"])
        self.assertEqual(change["old_mode"], "100644")
        self.assertEqual(change["new_mode"], "100755")

    def test_sha256_object_format_full_commits(self):
        other = self.root / "sha256-repo"
        other.mkdir()
        self.git("init", "--initial-branch=main", "--object-format=sha256", repo=other)
        self.write("file.txt", "initial\n", repo=other)
        base = self.commit("sha256 base", repo=other)
        self.write("file.txt", "changed\n", repo=other)
        head = self.commit("sha256 head", repo=other)
        self.assertEqual(len(base), 64)
        r = C.collect(other, base, head)
        self.assertEqual(r["changed_files"], ["file.txt"])
        self.assertTrue(r["clean_worktree"])

    def test_staged_unstaged_untracked_ignored_are_all_included(self):
        self.write("modify.txt", "staged\n")
        self.git("add", "modify.txt")
        self.write("modify.txt", "unstaged afterwards\n")
        (self.repo / "delete.txt").unlink()
        self.write("untracked.txt", "visible\n")
        self.write(".gitignore", "ignored.bin\n")
        self.write("ignored.bin", "also visible to collector\n")
        r = self.collect()
        self.assertFalse(r["clean_worktree"])
        self.assertEqual({x["stage"] for x in r["worktree_changes"]}, {"staged", "unstaged"})
        self.assertIn("ignored.bin", r["ignored_untracked_files"])
        self.assertIn("ignored.bin", r["changed_files"])
        self.assertIn("untracked.txt", r["untracked_files"])
        self.assertIn("delete.txt", r["changed_files"])

    def test_nul_parsing_preserves_lf_tab_unicode_and_leading_dash(self):
        names = ["line\nbreak.txt", "tab\tname.txt", "Grüezi-日本語.txt", "--option.txt"]
        for name in names:
            self.write(name, "content for " + name)
        head = self.commit("odd names")
        r = self.collect(head)
        self.assertEqual(set(r["changed_files"]), set(names))
        self.assertEqual(json.loads(json.dumps(r))["changed_files"], r["changed_files"])

    def test_untracked_symlink_is_not_followed(self):
        (self.repo / "outside").symlink_to(self.root, target_is_directory=True)
        r = self.collect()
        self.assertEqual(r["untracked_kinds"]["outside"], "symlink")
        self.assertEqual(r["untracked_files"], ["outside"])

    def test_path_validation_rejects_traversal_and_invalid_encoding(self):
        for value in [b"../x", b"a/../x", b"/absolute", b"a//b", b"a/./b", b"C:/outside", b"a\\..\\x", b"bad\xff"]:
            with self.subTest(value=value), self.assertRaises(C.CollectionError):
                C.path_text(value)

    def test_symbolic_abbreviated_and_noncommit_revisions_rejected(self):
        blob = self.git("hash-object", "keep.txt").strip().decode()
        for revision in ["HEAD", self.base[:12], "--all", blob, self.base.upper()]:
            with self.subTest(revision=revision), self.assertRaises(C.CollectionError):
                C.collect(self.repo, revision, self.base)

    def test_actual_head_must_match_explicit_worktree_revision(self):
        self.write("new.txt", "new\n")
        head = self.commit("next")
        with self.assertRaises(C.CollectionError):
            self.collect()
        r = C.collect(self.repo, self.base, head, head)
        self.assertEqual(r["mode"], "head_checkout")

    def test_ci_compares_candidate_without_checkout(self):
        self.write("candidate-only.txt", "candidate\n")
        head = self.commit("candidate")
        self.git("checkout", "--detach", self.base)
        r = C.collect(self.repo, self.base, head, self.base)
        self.assertEqual(r["changed_files"], ["candidate-only.txt"])
        self.assertTrue(r["clean_worktree"])
        self.assertFalse(r["candidate_head_checked_out"])
        self.assertEqual(r["mode"], "committed_diff_with_trusted_base_worktree")
        self.assertFalse((self.repo / "candidate-only.txt").exists())

    def test_nonancestor_base_is_rejected(self):
        tree = self.git("rev-parse", "HEAD^{tree}").strip().decode()
        unrelated = self.git("commit-tree", tree, "-m", "unrelated root").strip().decode()
        with self.assertRaises(C.CollectionError):
            C.collect(self.repo, self.base, unrelated, self.base)

    def test_ignored_file_alone_fails_require_clean_and_writes_truthful_report(self):
        self.write(".gitignore", "ignored.bin\n")
        self.base = self.commit("ignore rule")
        self.write("ignored.bin", "not silently omitted\n")
        result = self.cli("--require-clean")
        self.assertEqual(result.returncode, 1)
        report = json.loads((self.root / "report.json").read_text())
        self.assertFalse(report["accepted"])
        self.assertFalse(report["clean_worktree"])
        self.assertEqual(report["ignored_untracked_files"], ["ignored.bin"])

    def test_output_inside_repository_or_symlink_is_rejected(self):
        result = self.cli(output=self.repo / "report.json")
        self.assertEqual(result.returncode, 2)
        self.assertFalse((self.repo / "report.json").exists())
        victim = self.root / "victim"
        victim.write_text("preserve")
        link = self.root / "report-link.json"
        link.symlink_to(victim)
        self.assertEqual(self.cli(output=link).returncode, 2)
        self.assertEqual(victim.read_text(), "preserve")

    def test_assume_unchanged_and_skip_worktree_fail_closed(self):
        for flag, undo in [("--assume-unchanged", "--no-assume-unchanged"), ("--skip-worktree", "--no-skip-worktree")]:
            self.git("update-index", flag, "modify.txt")
            with self.subTest(flag=flag), self.assertRaises(C.CollectionError):
                self.collect()
            self.git("update-index", undo, "modify.txt")

    def test_configured_content_filter_not_executed(self):
        marker = self.root / "FILTER_RAN"
        self.git("config", "filter.danger.clean", "touch " + str(marker))
        self.write(".gitattributes", "*.txt filter=danger\n")
        self.write("modify.txt", "change\n")
        with self.assertRaises(C.CollectionError):
            self.collect()
        self.assertFalse(marker.exists())

    def test_partial_clone_is_rejected_before_any_lazy_fetch(self):
        self.git("config", "remote.origin.promisor", "true")
        self.git("config", "remote.origin.url", "https://example.invalid/must-not-be-contacted.git")
        with self.assertRaisesRegex(C.CollectionError, "implicit fetching is refused"):
            self.collect()

    def test_legacy_graft_history_is_rejected(self):
        graft = self.repo / ".git/info/grafts"
        graft.parent.mkdir(exist_ok=True)
        graft.write_text(self.base + "\n")
        with self.assertRaisesRegex(C.CollectionError, "real commit ancestry"):
            self.collect()

    def test_fsmonitor_external_diff_and_textconv_are_not_executed(self):
        marker = self.root / "PROGRAM_RAN"
        program = self.root / "trap.sh"
        program.write_text("#!/bin/sh\ntouch '" + str(marker) + "'\nexit 1\n")
        program.chmod(0o755)
        self.git("config", "core.fsmonitor", str(program))
        self.git("config", "diff.external", str(program))
        self.git("config", "diff.danger.textconv", str(program))
        self.write(".gitattributes", "*.txt diff=danger\n")
        self.write("modify.txt", "modified\n")
        r = self.collect()
        self.assertIn("modify.txt", r["changed_files"])
        self.assertFalse(marker.exists())

    def test_gitlink_commit_and_initialized_dirty_submodule_metadata(self):
        child = self.repo / "module"
        child.mkdir()
        self.git("init", "--initial-branch=main", repo=child)
        self.write("nested.txt", "first\n", repo=child)
        first = self.commit("child initial", repo=child)
        self.git("update-index", "--add", "--cacheinfo", f"160000,{first},module")
        head = self.commit("gitlink")
        r = self.collect(head)
        entry = next(x for x in r["commit_changes"] if x["is_gitlink"])
        self.assertEqual(entry["submodule"]["new_commit"], first)
        self.assertTrue(r["clean_worktree"])
        self.write("nested.txt", "dirty child\n", repo=child)
        self.write("new-child.txt", "untracked child\n", repo=child)
        r = self.collect(head)
        self.assertFalse(r["clean_worktree"])
        self.assertTrue(r["submodules"][0]["dirty"])
        self.assertIn("module/nested.txt", r["changed_files"])
        self.assertIn("module/new-child.txt", r["changed_files"])

    def test_uninitialized_gitlink_is_reported_without_fetch(self):
        self.git("update-index", "--add", "--cacheinfo", f"160000,{self.base},uninitialized")
        self.git("commit", "-m", "gitlink without checkout")
        head = self.git("rev-parse", "HEAD").strip().decode()
        (self.repo / "uninitialized").mkdir()
        r = self.collect(head)
        self.assertEqual(r["submodules"][0]["state"], "uninitialized")
        self.assertTrue(r["clean_worktree"])
        self.assertIn("uninitialized", r["changed_files"])

    def test_gitlink_tip_update_deletion_and_missing_worktree(self):
        module = self.repo / "module"
        module.mkdir()
        self.git("update-index", "--add", "--cacheinfo", f"160000,{self.base},module")
        self.git("commit", "-m", "initial gitlink")
        initial = self.git("rev-parse", "HEAD").strip().decode()
        self.git("update-index", "--cacheinfo", f"160000,{initial},module")
        self.git("commit", "-m", "updated gitlink")
        updated = self.git("rev-parse", "HEAD").strip().decode()
        r = C.collect(self.repo, initial, updated)
        change = next(x for x in r["commit_changes"] if x["is_gitlink"])
        self.assertEqual(change["status"], "M")
        self.assertEqual(change["submodule"]["new_commit"], initial)
        module.rmdir()
        r = C.collect(self.repo, initial, updated)
        self.assertFalse(r["clean_worktree"])
        self.assertEqual(r["submodules"][0]["state"], "absent")
        self.git("update-index", "--force-remove", "module")
        self.git("commit", "-m", "removed gitlink")
        deleted = self.git("rev-parse", "HEAD").strip().decode()
        r = C.collect(self.repo, updated, deleted)
        change = next(x for x in r["commit_changes"] if x["is_gitlink"])
        self.assertEqual(change["status"], "D")
        self.assertEqual(change["submodule"]["old_commit"], initial)
        self.assertIsNone(change["submodule"]["new_commit"])

    def test_submodule_filter_trap_is_not_executed(self):
        child = self.repo / "module"
        child.mkdir()
        self.git("init", "--initial-branch=main", repo=child)
        self.write("nested.txt", "first\n", repo=child)
        first = self.commit("child initial", repo=child)
        self.git("update-index", "--add", "--cacheinfo", f"160000,{first},module")
        head = self.commit("gitlink")
        marker = self.root / "CHILD_FILTER_RAN"
        self.git("config", "filter.danger.clean", "touch " + str(marker), repo=child)
        self.write(".gitattributes", "*.txt filter=danger\n", repo=child)
        self.write("nested.txt", "changed\n", repo=child)
        with self.assertRaises(C.CollectionError):
            self.collect(head)
        self.assertFalse(marker.exists())

    def test_directory_symlink_ancestor_is_not_followed(self):
        self.write("directory/file.txt", "tracked\n")
        head = self.commit("directory")
        shutil.rmtree(self.repo / "directory")
        (self.repo / "directory").symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(C.CollectionError):
            self.collect(head)

    def test_untracked_embedded_repository_fails_instead_of_hiding_files(self):
        nested = self.repo / "nested"
        nested.mkdir()
        self.git("init", "--initial-branch=main", repo=nested)
        self.write("inside.txt", "untracked embedded content\n", repo=nested)
        self.commit("nested initial", repo=nested)
        with self.assertRaises(C.CollectionError):
            self.collect()

    def test_successful_cli_writes_external_report_without_dirtying_repository(self):
        result = self.cli("--require-clean")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads((self.root / "report.json").read_text())
        self.assertTrue(report["accepted"])
        self.assertTrue(report["clean_worktree"])
        self.assertEqual(self.git("status", "--porcelain"), b"")


if __name__ == "__main__":
    unittest.main()
