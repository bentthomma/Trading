"""Verhaltensprüfungen mit vollständig isolierten Testplänen/Dateien.

Der ausgelieferte Masterplan und sein Fortschritt werden nicht verändert.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import planctl


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.plan_path = self.root / "plan.json"
        self.plan = {
            "schema_version": 1, "plan_id": "isolated-fixture", "version": "1.0.0",
            "global_rules": {"max_in_progress": 2},
            "steps": [self.step("S00"), self.step("S01", ["S00"]), self.step("S02", ["S00"])],
        }
        self.write_plan()
        self.ctl = planctl.Controller(self.plan_path)
        self.ctl.lock()

    @staticmethod
    def step(sid, dependencies=None):
        return {"id": sid, "title": "Testschritt " + sid, "dependencies": dependencies or [],
                "enabled": True, "allowed_paths": ["src/**", f"evidence/{sid}/**"],
                "forbidden_paths": ["src/secrets/**"],
                "required_artifacts": [f"evidence/{sid}/report.json"],
                "checks": [{"id": sid + "-C01", "description": "Unabhängiger Nachweis"}],
                "owner": "developer", "extra_field": {"allowed": True}}

    def write_plan(self):
        self.plan_path.write_text(json.dumps(self.plan, indent=2), encoding="utf-8")

    def evidence(self, sid="S00", actor="Ada"):
        directory = self.root / "evidence" / sid
        directory.mkdir(parents=True, exist_ok=True)
        report = directory / "report.json"
        report.write_text('{"observed":true,"test":"controlled-fixture"}', encoding="utf-8")
        relative = report.relative_to(self.root).as_posix()
        data = {"schema_version": 1, "step_id": sid, "plan_sha256": self.ctl.plan_hash,
                "base_revision": "a" * 40, "head_revision": "b" * 40,
                "actor": actor, "changed_files": [relative, "src/example.py"],
                "artifacts": {relative: hashlib.sha256(report.read_bytes()).hexdigest()},
                "checks": [{"id": sid + "-C01", "status": "pass", "proof_artifacts": [relative],
                            "summary": "Fixture mit unabhängiger Erwartung geprüft."}]}
        path = directory / "evidence.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path, data

    def mutate_evidence(self, path, data):
        path.write_text(json.dumps(data), encoding="utf-8")

    def start_and_evidence(self, sid="S00"):
        self.ctl.start(sid, "Ada")
        return self.evidence(sid)

    def finish_first(self):
        path, _ = self.start_and_evidence()
        self.ctl.finish("S00", str(path))

    def assert_unchanged_on_failure(self, callback):
        path = self.root / "control" / "state.json"
        before = path.read_bytes() if path.exists() else None
        with self.assertRaises(planctl.PlanError):
            callback()
        after = path.read_bytes() if path.exists() else None
        self.assertEqual(before, after)

    def test_initial_only_first_step_ready(self):
        self.assertEqual(self.ctl.next()["ready_steps"], ["S00"])
        self.assertEqual(self.ctl.next()["free_slots"], 2)

    def test_unknown_dependency_is_rejected(self):
        self.plan["steps"][1]["dependencies"] = ["S99"]
        with self.assertRaisesRegex(planctl.PlanError, "unbekannte Abhängigkeiten"):
            planctl.validate_plan(self.plan)

    def test_cycle_is_rejected(self):
        self.plan["steps"][0]["dependencies"] = ["S01"]
        with self.assertRaisesRegex(planctl.PlanError, "Zyklus"):
            planctl.validate_plan(self.plan)

    def test_duplicate_step_and_check_are_rejected(self):
        altered = deepcopy(self.plan)
        altered["steps"].append(deepcopy(altered["steps"][0]))
        with self.assertRaises(planctl.PlanError):
            planctl.validate_plan(altered)
        altered = deepcopy(self.plan)
        altered["steps"][1]["checks"][0]["id"] = "S00-C01"
        with self.assertRaises(planctl.PlanError):
            planctl.validate_plan(altered)

    def test_start_requires_dependencies_and_does_not_write_on_error(self):
        self.assert_unchanged_on_failure(lambda: self.ctl.start("S01", "Ada"))

    def test_scope_respects_forbidden_even_when_allowed(self):
        self.assert_unchanged_on_failure(lambda: self.ctl.scope("S00", ["src/secrets/key.txt"]))

    def test_scope_rejects_unlisted_paths(self):
        with self.assertRaises(planctl.PlanError):
            self.ctl.scope("S00", ["website/new-product.tsx"])

    def test_scope_rejects_planfiles_even_with_broad_allow(self):
        self.ctl.steps["S00"]["allowed_paths"] = ["**"]
        for name in ["plan.json", "control/state.json", "control/planctl.py"]:
            with self.subTest(name=name), self.assertRaises(planctl.PlanError):
                self.ctl.scope("S00", [name])

    def test_globs_have_directory_semantics(self):
        self.assertTrue(planctl.matches_glob("src/a.py", "src/**/*.py"))
        self.assertTrue(planctl.matches_glob("src/deep/a.py", "src/**/*.py"))
        self.assertFalse(planctl.matches_glob("src/deep/a.py", "src/*.py"))
        self.assertFalse(planctl.matches_glob("src2/a.py", "src/**"))

    def test_path_traversal_and_absolute_paths_fail(self):
        for name in ["../elsewhere", "/tmp/a", "src/../../x", "C:\\Users\\file", "src//x"]:
            with self.subTest(name=name), self.assertRaises(planctl.PlanError):
                self.ctl.scope("S00", [name])

    def test_external_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as external:
            outside = Path(external) / "data.txt"
            outside.write_text("external", encoding="utf-8")
            (self.root / "src").mkdir()
            link = self.root / "src" / "escape.txt"
            try:
                link.symlink_to(outside)
            except (OSError, NotImplementedError):
                self.skipTest("Symlinks werden auf diesem System nicht unterstützt")
            with self.assertRaisesRegex(planctl.PlanError, "Symlink"):
                self.ctl.scope("S00", ["src/escape.txt"])

    def test_failed_check_does_not_finish(self):
        path, data = self.start_and_evidence()
        data["checks"][0]["status"] = "fail"
        self.mutate_evidence(path, data)
        self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_missing_check_is_rejected(self):
        path, data = self.start_and_evidence()
        data["checks"] = []
        self.mutate_evidence(path, data)
        self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_missing_required_artifact_is_rejected(self):
        path, data = self.start_and_evidence()
        actual = self.root / "evidence/S00/report.json"
        actual.unlink()
        self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_missing_and_incorrect_hash_are_rejected(self):
        path, data = self.start_and_evidence()
        name = "evidence/S00/report.json"
        for value in [None, "", "abc", "0" * 64]:
            with self.subTest(value=value):
                data["artifacts"][name] = value
                self.mutate_evidence(path, data)
                self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_unhashed_proof_reference_is_rejected(self):
        path, data = self.start_and_evidence()
        data["checks"][0]["proof_artifacts"] = ["evidence/S00/unknown.json"]
        self.mutate_evidence(path, data)
        self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_single_actor_evidence_without_reviewer_is_accepted(self):
        path, data = self.start_and_evidence()
        data.pop("reviewer", None)
        self.mutate_evidence(path, data)
        self.ctl.finish("S00", str(path))
        self.assertEqual(self.ctl.state()["steps"]["S00"]["status"], "passed")
        self.assertNotIn("reviewer", self.ctl.state()["steps"]["S00"])

    def test_different_actor_cannot_finish(self):
        self.ctl.start("S00", "Ada")
        path, _ = self.evidence(actor="Charles")
        self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_finish_requires_start(self):
        path, _ = self.evidence()
        self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_verify_is_read_only_and_success_advances_next(self):
        path, _ = self.start_and_evidence()
        state_path = self.root / "control/state.json"
        before = state_path.read_bytes()
        verified = self.ctl.verify("S00", str(path))
        self.assertTrue(verified["verified"])
        self.assertEqual(before, state_path.read_bytes())
        self.ctl.finish("S00", str(path))
        self.assertEqual(self.ctl.next()["ready_steps"], ["S01", "S02"])

    def test_in_progress_limit_is_enforced(self):
        self.finish_first()
        self.ctl.start("S01", "Ada")
        self.ctl.start("S02", "Ben")
        self.assertEqual(self.ctl.next()["free_slots"], 0)
        # Einen unabhängigen vierten Testschritt vor dem Lock anlegen.
        with tempfile.TemporaryDirectory() as separate:
            root = Path(separate)
            plan = deepcopy(self.plan)
            plan["steps"] = [self.step("S00"), self.step("S01"), self.step("S02")]
            path = root / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            controller = planctl.Controller(path)
            controller.lock()
            controller.start("S00", "A")
            controller.start("S01", "B")
            before = controller.state_path.read_bytes()
            with self.assertRaisesRegex(planctl.PlanError, "gleichzeitig"):
                controller.start("S02", "C")
            self.assertEqual(before, controller.state_path.read_bytes())

    def test_any_plan_byte_change_blocks_existing_lock(self):
        self.plan_path.write_bytes(self.plan_path.read_bytes() + b"\n")
        changed = planctl.Controller(self.plan_path)
        for action in [changed.validate, changed.next, changed.status, lambda: changed.start("S00", "Ada")]:
            with self.subTest(action=action), self.assertRaisesRegex(planctl.PlanError, "Planhash"):
                action()

    def test_wrong_evidence_planhash_and_step_are_rejected(self):
        path, data = self.start_and_evidence()
        for key, value in [("plan_sha256", "0" * 64), ("step_id", "S01")]:
            changed = deepcopy(data)
            changed[key] = value
            self.mutate_evidence(path, changed)
            self.assert_unchanged_on_failure(lambda: self.ctl.finish("S00", str(path)))

    def test_duplicate_json_keys_are_rejected(self):
        with self.assertRaisesRegex(planctl.PlanError, "Doppelter"):
            planctl.decode_json('{"status":"fail","status":"pass"}', "fixture")

    def test_disabled_step_cannot_start(self):
        with tempfile.TemporaryDirectory() as separate:
            root = Path(separate)
            plan = deepcopy(self.plan)
            plan["steps"][0]["enabled"] = False
            path = root / "plan.json"
            path.write_text(json.dumps(plan), encoding="utf-8")
            ctl = planctl.Controller(path)
            ctl.lock()
            self.assertEqual(ctl.next()["ready_steps"], [])
            with self.assertRaisesRegex(planctl.PlanError, "aktiviert"):
                ctl.start("S00", "Ada")

    def test_relock_requires_exact_amendment_and_resets_dependants(self):
        self.finish_first()
        previous_hash = self.ctl.plan_hash
        self.plan["version"] = "1.1.0"
        self.plan["steps"][0]["title"] = "Überarbeitete Grundlage"
        self.write_plan()
        new = planctl.Controller(self.plan_path)
        data = {"schema_version": 1, "plan_id": self.plan["plan_id"],
                "previous_plan_sha256": previous_hash, "new_plan_sha256": new.plan_hash,
                "previous_version": "1.0.0", "new_version": "1.1.0", "author": "Ada",
                "reason": "Grundlage wurde geändert, alle Folgeschritte benötigen neue Prüfung.",
                "affected_steps": ["S00"]}
        path = self.root / "amendment.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        self.assert_unchanged_on_failure(lambda: new.relock(str(path)))
        data["affected_steps"] = ["S00", "S01", "S02"]
        path.write_text(json.dumps(data), encoding="utf-8")
        result = new.relock(str(path))
        self.assertEqual(result["reset_steps"], ["S00", "S01", "S02"])
        self.assertEqual(new.next()["ready_steps"], ["S00"])
        self.assertEqual(new.state()["steps"]["S00"]["status"], "pending")

    def test_cli_failure_returns_nonzero_without_state_write(self):
        result = subprocess.run([sys.executable, str(Path(planctl.__file__)), "--plan", str(self.plan_path),
                                 "start", "S01", "--actor", "Ada"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Abhängigkeit", result.stderr)
        self.assertFalse((self.root / "control/state.json").exists())

    def test_workorder_contains_scope_and_checks(self):
        result = self.ctl.workorder("S00")
        self.assertIn("S00-C01", result)
        self.assertIn("src/secrets/**", result)
        self.assertIn(self.ctl.plan_hash, result)

    def test_block_resume_never_marks_step_passed(self):
        self.ctl.start("S00", "Ada")
        self.ctl.block("S00", "Ada", "Referenzquelle fehlt")
        self.assertEqual(self.ctl.next()["ready_steps"], [])
        self.assert_unchanged_on_failure(lambda: self.ctl.resume("S00", "Ada", ""))
        self.ctl.resume("S00", "Ada", "Referenzquelle technisch geprüft")
        self.assertEqual(self.ctl.state()["steps"]["S00"]["status"], "pending")
        self.assertEqual(self.ctl.next()["ready_steps"], ["S00"])

    def scoped_fixture(self):
        root = self.root / "scope-fixture"
        root.mkdir()
        plan = deepcopy(self.plan)
        plan["steps"][0].update({"requires_resolved_scope": True, "scope_status": "proposed"})
        path = root / "plan.json"
        path.write_text(json.dumps(plan), encoding="utf-8")
        ctl = planctl.Controller(path)
        ctl.lock()
        return root, plan, path, ctl

    def test_proposed_scope_validates_but_blocks_start_and_next(self):
        root, _, _, ctl = self.scoped_fixture()
        self.assertTrue(ctl.validate()["valid"])
        self.assertEqual(ctl.next()["ready_steps"], [])
        self.assertEqual(ctl.next()["blocked_scope"], ["S00"])
        self.assertTrue(ctl.status()["steps"][0]["blocked_scope"])
        with self.assertRaisesRegex(planctl.PlanError, "blocked_scope"):
            ctl.start("S00", "Ada")
        self.assertFalse((root / "control/state.json").exists())

    def test_proposed_scope_also_blocks_finish(self):
        _, _, _, ctl = self.scoped_fixture()
        # Ein inkonsistenter Alt-/Migrationsstatus darf die Abschlussprüfung nicht umgehen.
        state = ctl.state()
        state["steps"]["S00"] = {"status": "in_progress", "actor": "Ada"}
        ctl.state_path.write_text(json.dumps(state), encoding="utf-8")
        before = ctl.state_path.read_bytes()
        with self.assertRaisesRegex(planctl.PlanError, "blocked_scope"):
            ctl.finish("S00", "nicht-vorhanden.json")
        self.assertEqual(before, ctl.state_path.read_bytes())

    def test_scope_resolution_requires_amendment_then_allows_start(self):
        root, plan, path, ctl = self.scoped_fixture()
        previous_hash = ctl.plan_hash
        plan["version"] = "1.1.0"
        plan["steps"][0]["scope_status"] = "resolved"
        plan["steps"][0]["allowed_paths"] = ["core/**", "evidence/S00/**"]
        path.write_text(json.dumps(plan), encoding="utf-8")
        new = planctl.Controller(path)
        with self.assertRaisesRegex(planctl.PlanError, "Planhash"):
            new.start("S00", "Ada")
        amendment = {"schema_version": 1, "plan_id": plan["plan_id"],
                     "previous_plan_sha256": previous_hash, "new_plan_sha256": new.plan_hash,
                     "previous_version": "1.0.0", "new_version": "1.1.0", "author": "Ada",
                     "reason": "S01-Pfadkarte und S02-ADR ordnen den Scope realen Modulen zu.",
                     "affected_steps": ["S00", "S01", "S02"]}
        amendment_path = root / "amendment.json"
        amendment_path.write_text(json.dumps(amendment), encoding="utf-8")
        new.relock(str(amendment_path))
        self.assertEqual(new.next()["blocked_scope"], [])
        self.assertEqual(new.next()["ready_steps"], ["S00"])
        new.start("S00", "Ada")
        self.assertEqual(new.state()["steps"]["S00"]["status"], "in_progress")


class DesignApprovalTests(unittest.TestCase):
    """Designgates mit fünf echten Fixture-Dateien und regulären Technikabschlüssen."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.case_number = 0

    evidence = PlanTests.evidence
    assert_unchanged_on_failure = PlanTests.assert_unchanged_on_failure

    def fixture(self, change_approval=None, change_gate=None):
        self.case_number += 1
        self.root = Path(self.temp.name) / str(self.case_number)
        self.root.mkdir()
        references = []
        for number in range(1, 6):
            name = f"assets/design/approved/A0{number}.png"
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            # Der Wächter prüft Referenzbytes, keine Bilddekodierung oder visuelle Güte.
            path.write_bytes(b"controlled-design-reference-" + bytes([number]))
            references.append({"id": f"A0{number}", "path": name,
                               "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        self.approval = {"schema_version": 1, "status": "approved",
                         "approved_scope": ["desktop_baseline"],
                         "user_evidence": "Fixture: Desktopentwurf freigegeben; Design kommt nach Technik.",
                         "references": references}
        if change_approval:
            change_approval(self.approval)
        self.approval_path = self.root / "design/approval.json"
        self.approval_path.parent.mkdir()
        self.approval_path.write_text(json.dumps(self.approval), encoding="utf-8")
        gate = {"type": "design_approval", "path": "design/approval.json",
                "sha256": hashlib.sha256(self.approval_path.read_bytes()).hexdigest(),
                "scope": "desktop_baseline"}
        if change_gate:
            change_gate(gate)
        steps = [PlanTests.step(sid) for sid in ("S21", "S22", "S25")]
        for sid, dependencies in (("S30", ["S21", "S22", "S25"]), ("S31", ["S30"])):
            step = PlanTests.step(sid, dependencies)
            step["entry_checks"] = [deepcopy(gate)]
            steps.append(step)
        self.plan = {"schema_version": 1, "plan_id": "design-isolated-fixture", "version": "1.1.0",
                     "global_rules": {"max_in_progress": 2}, "steps": steps}
        self.plan_path = self.root / "plan.json"
        self.plan_path.write_text(json.dumps(self.plan), encoding="utf-8")
        self.ctl = planctl.Controller(self.plan_path)
        self.ctl.lock()
        return self.ctl

    def complete(self, sid):
        self.ctl.start(sid, "Ada")
        path, _ = self.evidence(sid)
        self.ctl.finish(sid, str(path))

    def complete_technology(self):
        for sid in ("S21", "S22", "S25"):
            self.complete(sid)

    def assert_design_blocked(self):
        before = self.ctl.state_path.read_bytes() if self.ctl.state_path.exists() else None
        current = next(s for s in self.ctl.status()["steps"] if s["id"] == "S30")
        self.assertFalse(current["ready"])
        self.assertTrue(any("blocked_design_approval" in item for item in current["blockers"]))
        self.assertNotIn("S30", self.ctl.next()["ready_steps"])
        self.assert_unchanged_on_failure(lambda: self.ctl.start("S30", "Ada"))
        after = self.ctl.state_path.read_bytes() if self.ctl.state_path.exists() else None
        self.assertEqual(before, after)

    def test_approved_design_still_waits_for_every_technical_dependency(self):
        self.fixture()
        self.complete("S21")
        self.complete("S22")
        with self.assertRaisesRegex(planctl.PlanError, "Abhängigkeit S25"):
            self.ctl.start("S30", "Ada")
        self.assertNotIn("S30", self.ctl.next()["ready_steps"])
        self.assertEqual(self.ctl.state()["steps"]["S30"]["status"], "pending")
        self.complete("S25")
        self.assertIn("S30", self.ctl.next()["ready_steps"])

    def test_valid_approval_runs_verify_and_finish_without_extra_permission(self):
        self.fixture()
        self.complete_technology()
        self.ctl.start("S30", "Ada")
        path, _ = self.evidence("S30")
        before = self.ctl.state_path.read_bytes()
        result = self.ctl.verify("S30", str(path))
        self.assertEqual(result["entry_checks_verified"][0]["references_verified"], 5)
        self.assertEqual(result["entry_checks_verified"][0]["scope"], "desktop_baseline")
        self.assertFalse(result["identity_verified_externally"])
        self.assertEqual(before, self.ctl.state_path.read_bytes())
        self.ctl.finish("S30", str(path))
        self.assertEqual(self.ctl.state()["steps"]["S30"]["status"], "passed")
        self.assertIn("S31", self.ctl.next()["ready_steps"])

    def test_missing_approval_blocks_start_and_readiness(self):
        self.fixture()
        self.complete_technology()
        self.approval_path.unlink()
        self.assert_design_blocked()

    def test_changed_approval_bytes_block_start_even_with_same_json_meaning(self):
        self.fixture()
        self.complete_technology()
        self.approval_path.write_bytes(self.approval_path.read_bytes() + b"\n")
        self.assert_design_blocked()

    def test_wrong_plan_bound_approval_hash_blocks_start(self):
        self.fixture(change_gate=lambda gate: gate.update(sha256="0" * 64))
        self.complete_technology()
        self.assert_design_blocked()

    def test_changed_approval_after_start_blocks_verify_and_finish(self):
        self.fixture()
        self.complete_technology()
        self.ctl.start("S30", "Ada")
        path, _ = self.evidence("S30")
        self.approval_path.write_bytes(self.approval_path.read_bytes() + b"\n")
        for operation in (self.ctl.verify, self.ctl.finish):
            self.assert_unchanged_on_failure(lambda: operation("S30", str(path)))
        self.assertEqual(self.ctl.state()["steps"]["S30"]["status"], "in_progress")

    def test_wrong_scope_or_incomplete_approval_is_not_accepted(self):
        cases = [("approved_scope", None), ("approved_scope", []),
                 ("approved_scope", ["mobile"]), ("approved_scope", ["desktop_baseline"] * 2),
                 ("status", None), ("status", "pending"), ("schema_version", None),
                 ("schema_version", True),
                 ("user_evidence", None), ("user_evidence", "")]
        for key, value in cases:
            with self.subTest(key=key, value=value):
                self.fixture(change_approval=lambda data: data.update({key: value}))
                self.complete_technology()
                self.assert_design_blocked()

    def test_corrupt_or_missing_reference_blocks_start(self):
        for missing in (False, True):
            with self.subTest(missing=missing):
                self.fixture()
                self.complete_technology()
                path = self.root / self.approval["references"][2]["path"]
                if missing:
                    path.unlink()
                else:
                    path.write_bytes(b"changed reference image")
                self.assert_design_blocked()

    def test_corrupt_reference_after_start_blocks_verify_finish_and_validate(self):
        self.fixture()
        self.complete_technology()
        self.ctl.start("S30", "Ada")
        path, _ = self.evidence("S30")
        reference = self.root / self.approval["references"][4]["path"]
        reference.write_bytes(b"corrupt after entry check")
        for operation in (self.ctl.verify, self.ctl.finish):
            self.assert_unchanged_on_failure(lambda: operation("S30", str(path)))
        self.assert_unchanged_on_failure(self.ctl.validate)

    def test_reference_paths_cannot_escape_root(self):
        for name in ("../outside.png", "/tmp/outside.png", "assets/../../outside.png"):
            with self.subTest(name=name):
                self.fixture(change_approval=lambda data: data["references"][0].update(path=name))
                self.complete_technology()
                self.assert_design_blocked()

    def test_symlink_escape_is_rejected_for_approval_and_reference(self):
        for kind in ("approval", "reference"):
            with self.subTest(kind=kind):
                self.fixture()
                self.complete_technology()
                path = (self.approval_path if kind == "approval"
                        else self.root / self.approval["references"][0]["path"])
                outside = Path(self.temp.name) / (kind + "-outside")
                outside.write_bytes(path.read_bytes())
                path.unlink()
                try:
                    path.symlink_to(outside)
                except (OSError, NotImplementedError):
                    self.skipTest("Symlinks werden auf diesem System nicht unterstützt")
                self.assert_design_blocked()

    def test_reference_manifest_requires_unique_nonempty_hashed_files(self):
        changes = [lambda data: data.update(references=[]),
                   lambda data: data.update(references=None),
                   lambda data: data["references"].append(deepcopy(data["references"][0])),
                   lambda data: data["references"][1].update(id=data["references"][0]["id"]),
                   lambda data: data["references"][0].update(sha256=None)]
        for number, change in enumerate(changes):
            with self.subTest(number=number):
                self.fixture(change_approval=change)
                self.complete_technology()
                self.assert_design_blocked()

    def test_entry_gate_schema_rejects_unknown_incomplete_or_unsafe_fields(self):
        changes = [lambda gate: gate.update(type="skip_approval"),
                   lambda gate: gate.pop("sha256"),
                   lambda gate: gate.update(sha256=None),
                   lambda gate: gate.update(sha256="HASH_NOT_YET_BOUND"),
                   lambda gate: gate.update(scope=None),
                   lambda gate: gate.update(path="../approval.json"),
                   lambda gate: gate.update(optional=True)]
        for number, change in enumerate(changes):
            with self.subTest(number=number), self.assertRaises(planctl.PlanError):
                self.fixture(change_gate=change)
        self.fixture()
        for value in (None, {}, [deepcopy(self.plan["steps"][-1]["entry_checks"][0])] * 2):
            altered = deepcopy(self.plan)
            altered["steps"][-1]["entry_checks"] = value
            with self.subTest(value=value), self.assertRaises(planctl.PlanError):
                planctl.validate_plan(altered)

    def test_changing_approved_scope_or_reference_set_needs_plan_amendment(self):
        self.fixture()
        self.complete_technology()
        self.approval["references"].pop()
        self.approval_path.write_text(json.dumps(self.approval), encoding="utf-8")
        self.assert_design_blocked()
        self.plan["steps"][-2]["entry_checks"][0]["sha256"] = hashlib.sha256(
            self.approval_path.read_bytes()).hexdigest()
        self.plan_path.write_text(json.dumps(self.plan), encoding="utf-8")
        altered = planctl.Controller(self.plan_path)
        with self.assertRaisesRegex(planctl.PlanError, "Planhash"):
            altered.start("S30", "Ada")

    def test_cli_works_from_other_directory_and_blocks_missing_design_reference(self):
        self.fixture()
        self.complete_technology()
        (self.root / self.approval["references"][0]["path"]).unlink()
        before = self.ctl.state_path.read_bytes()
        result = subprocess.run([sys.executable, str(Path(planctl.__file__).resolve()),
                                 "--plan", str(self.plan_path), "--project-root", str(self.root),
                                 "start", "S30", "--actor", "Ada"],
                                cwd=self.temp.name, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("blocked_design_approval", result.stderr)
        self.assertEqual(before, self.ctl.state_path.read_bytes())


if __name__ == "__main__":
    unittest.main(verbosity=2)
