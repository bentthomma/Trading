#!/usr/bin/env python3
"""Lokaler Plan-/Nachweiswächter. Python >= 3.10, ausschließlich Standardbibliothek.

Führt keine Produkttests, Netzwerkaktionen oder Trades aus. CI muss den
Änderungsumfang technisch bestätigen. Kein verpflichtender unabhängiger Reviewer.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fnmatch
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import uuid


class PlanError(Exception):
    """Erwarteter, fail-closed behandelter Prüfungsfehler."""


def fail(message):
    raise PlanError(message)


def utcnow():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha_bytes(raw):
    return hashlib.sha256(raw).hexdigest()


def sha_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def no_duplicate_keys(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            fail(f"Doppelter JSON-Schlüssel: {key}")
        value[key] = item
    return value


def decode_json(raw, label):
    try:
        return json.loads(raw, object_pairs_hook=no_duplicate_keys,
                          parse_constant=lambda x: fail(f"Nicht endlicher JSON-Wert: {x}"))
    except (ValueError, UnicodeError) as exc:
        fail(f"Ungültiges JSON in {label}: {exc}")


def read_json(path, maximum=8 * 1024 * 1024):
    if not path.is_file():
        fail(f"Datei fehlt: {path}")
    if path.stat().st_size > maximum:
        fail(f"JSON-Datei ist größer als {maximum} Bytes: {path}")
    raw = path.read_bytes()
    return decode_json(raw, str(path)), raw


def text_field(obj, key):
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        fail(f"{key} muss eine nicht leere Zeichenfolge ohne Rand-Leerzeichen sein.")
    if len(value) > 2000 or any(ord(c) < 32 for c in value):
        fail(f"{key} enthält unzulässige Zeichen oder ist zu lang.")
    return value



def relative_path(value, pattern=False):
    if not isinstance(value, str) or not value or value != value.strip():
        fail("Pfad muss eine nicht leere relative Zeichenfolge sein.")
    if len(value) > 4096 or "\\" in value or ":" in value or any(ord(c) < 32 for c in value):
        fail(f"Unzulässiger relativer Pfad: {value!r}")
    if value.startswith("/") or any(p in ("", ".", "..") for p in value.split("/")):
        fail(f"Pfadtraversal oder nicht kanonischer Pfad: {value!r}")
    if not pattern and any(c in value for c in "*?["):
        fail(f"Dateipfad darf kein Glob sein: {value!r}")
    return value


def unique_strings(value, label, normalize=None):
    if not isinstance(value, list) or len(value) > 10000:
        fail(f"{label} muss eine Liste mit höchstens 10000 Einträgen sein.")
    result = []
    for item in value:
        if not isinstance(item, str) or not item:
            fail(f"{label}: leere oder ungültige Zeichenfolge.")
        result.append(normalize(item) if normalize else item)
    if len(result) != len(set(result)):
        fail(f"{label} enthält doppelte Einträge.")
    return result


def matches_glob(path, pattern):
    """Glob mit echten Verzeichnisebenen: * bleibt lokal, ** überquert Ebenen."""
    parts, patterns = path.split("/"), pattern.split("/")

    def match(i, j):
        if j == len(patterns):
            return i == len(parts)
        if patterns[j] == "**":
            return match(i, j + 1) or (i < len(parts) and match(i + 1, j))
        return (i < len(parts) and fnmatch.fnmatchcase(parts[i], patterns[j])
                and match(i + 1, j + 1))

    return match(0, 0)


def file_inside(root, name, must_exist=True):
    name = relative_path(name)
    candidate = root / name
    try:
        resolved = candidate.resolve(strict=must_exist)
    except (OSError, RuntimeError) as exc:
        fail(f"Datei nicht auflösbar: {name}: {exc}")
    if not resolved.is_relative_to(root):
        fail(f"Pfad oder Symlink verlässt project_root: {name}")
    if must_exist and not resolved.is_file():
        fail(f"Nachweis ist keine reguläre Datei: {name}")
    return resolved


def validate_plan(plan):
    if not isinstance(plan, dict) or plan.get("schema_version") != 1:
        fail("Plan benötigt schema_version=1.")
    text_field(plan, "plan_id")
    text_field(plan, "version")
    steps = plan.get("steps")
    if not isinstance(steps, list) or not steps:
        fail("Plan benötigt mindestens einen Schritt.")
    by_id = {}
    checks_seen = set()
    for step in steps:
        if not isinstance(step, dict):
            fail("Jeder Schritt muss ein Objekt sein.")
        sid = text_field(step, "id")
        if not re.fullmatch(r"S\d{2}", sid) or sid in by_id:
            fail(f"Ungültige oder doppelte Schritt-ID: {sid}")
        text_field(step, "title")
        if not isinstance(step.get("enabled"), bool):
            fail(f"{sid}: enabled muss true oder false sein.")
        if "requires_resolved_scope" in step and not isinstance(step["requires_resolved_scope"], bool):
            fail(f"{sid}: requires_resolved_scope muss true oder false sein.")
        if "scope_status" in step and step["scope_status"] not in ("proposed", "resolved"):
            fail(f"{sid}: scope_status muss proposed oder resolved sein.")
        unique_strings(step.get("dependencies"), f"{sid}.dependencies")
        for key in ("allowed_paths", "forbidden_paths"):
            unique_strings(step.get(key), f"{sid}.{key}", lambda p: relative_path(p, True))
        unique_strings(step.get("required_artifacts"), f"{sid}.required_artifacts", relative_path)
        entry_checks = step.get("entry_checks", [])
        if not isinstance(entry_checks, list) or len(entry_checks) > 100:
            fail(f"{sid}.entry_checks muss eine Liste mit höchstens 100 Einträgen sein.")
        gates = set()
        for check in entry_checks:
            if (not isinstance(check, dict)
                    or set(check) != {"type", "path", "sha256", "scope"}
                    or check.get("type") != "design_approval"):
                fail(f"{sid}: unbekannte oder unvollständige Eintrittsprüfung.")
            path = relative_path(check["path"])
            scope = text_field(check, "scope")
            if not isinstance(check["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", check["sha256"]):
                fail(f"{sid}: Designfreigabe benötigt einen im Plan fixierten SHA-256.")
            key = (check["type"], path, scope)
            if key in gates:
                fail(f"{sid}: doppelte Eintrittsprüfung für {path}/{scope}.")
            gates.add(key)
        checks = step.get("checks")
        if not isinstance(checks, list) or not checks:
            fail(f"{sid}: mindestens eine explizite Abschlussprüfung ist erforderlich.")
        for check in checks:
            if not isinstance(check, dict):
                fail(f"{sid}: Prüfung ist kein Objekt.")
            cid = text_field(check, "id")
            text_field(check, "description")
            if cid in checks_seen:
                fail(f"Doppelte Prüfungs-ID: {cid}")
            checks_seen.add(cid)
        by_id[sid] = step
    for sid, step in by_id.items():
        missing = set(step["dependencies"]) - by_id.keys()
        if missing:
            fail(f"{sid}: unbekannte Abhängigkeiten: {', '.join(sorted(missing))}")
    visited, active = set(), set()

    def walk(sid):
        if sid in active:
            fail(f"Zyklus in den Abhängigkeiten bei {sid}.")
        if sid in visited:
            return
        active.add(sid)
        for dep in by_id[sid]["dependencies"]:
            walk(dep)
        active.remove(sid)
        visited.add(sid)

    for sid in by_id:
        walk(sid)
    rules = plan.get("global_rules", {})
    if not isinstance(rules, dict):
        fail("global_rules muss ein Objekt sein.")
    if rules.get("required_independent_review", False) is not False:
        fail("Dieser Controller verwendet die explizit reviewerfreie Planregel; alte Pläne mit Reviewerpflicht sind archiviert.")
    limit = rules.get("max_in_progress", 2)
    if isinstance(limit, bool) or not isinstance(limit, int) or limit < 1:
        fail("max_in_progress muss eine positive ganze Zahl sein.")
    unique_strings(rules.get("immutable_paths", []), "global_rules.immutable_paths",
                   lambda p: relative_path(p, True))
    return by_id


class Controller:
    def __init__(self, plan_path, project_root=None):
        self.plan_path = Path(plan_path).resolve()
        self.plan, raw = read_json(self.plan_path)
        self.steps = validate_plan(self.plan)
        self.plan_hash = sha_bytes(raw)
        self.root = Path(project_root or self.plan_path.parent).resolve()
        if not self.root.is_dir():
            fail(f"project_root existiert nicht: {self.root}")
        self.control = self.plan_path.parent / "control"
        if self.control.is_symlink():
            fail("Das control-Verzeichnis darf kein Symlink sein.")
        self.lock_path = self.control / "plan.lock.json"
        self.state_path = self.control / "state.json"

    def _control_json(self, path):
        if path.is_symlink():
            fail(f"Steuerdatei darf kein Symlink sein: {path.name}")
        return read_json(path)[0]

    def _unchanged(self):
        if sha_file(self.plan_path) != self.plan_hash:
            fail("Plan wurde während der Prüfung geändert. Keine Statusänderung vorgenommen.")

    @contextmanager
    def transaction(self):
        self.control.mkdir(parents=True, exist_ok=True)
        mutex = self.control / ".planctl.transaction.lock"
        try:
            mutex.mkdir()
        except FileExistsError:
            fail("Ein Planvorgang läuft bereits. Verwaiste Transaktionssperre erst nach Prozessprüfung entfernen.")
        try:
            yield
        finally:
            mutex.rmdir()

    def _write(self, path, value):
        if path.is_symlink():
            fail(f"Steuerdatei darf kein Symlink sein: {path.name}")
        self._unchanged()
        temp = path.with_name(path.name + ".tmp-" + uuid.uuid4().hex)
        try:
            with temp.open("x", encoding="utf-8") as stream:
                json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, path)
        finally:
            if temp.exists():
                temp.unlink()

    def _lock_record(self, amendment=None):
        result = {"schema_version": 1, "plan_id": self.plan["plan_id"],
                  "plan_version": self.plan["version"], "plan_sha256": self.plan_hash,
                  "locked_at": utcnow(), "step_fingerprints": {}, "dependencies": {},
                  "global_rules_snapshot": self.plan.get("global_rules", {})}
        for sid, step in self.steps.items():
            raw = json.dumps(step, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
            result["step_fingerprints"][sid] = sha_bytes(raw)
            result["dependencies"][sid] = step["dependencies"]
        if amendment:
            result["amendment"] = amendment
        return result

    def locked(self):
        if not self.lock_path.exists():
            fail("Plan ist noch nicht gesperrt. Zuerst: planctl.py lock")
        lock = self._control_json(self.lock_path)
        if not isinstance(lock, dict) or lock.get("schema_version") != 1:
            fail("Ungültige Plansperre.")
        if (lock.get("plan_sha256") != self.plan_hash or lock.get("plan_id") != self.plan["plan_id"]
                or lock.get("plan_version") != self.plan["version"]):
            fail("Planhash/Version stimmt nicht mit plan.lock.json überein. Nur ein versioniertes Amendment erlaubt relock.")
        return lock

    def state(self, require_current=True):
        if not self.state_path.exists():
            return {"schema_version": 1, "plan_sha256": self.plan_hash,
                    "steps": {sid: {"status": "pending"} for sid in self.steps}, "history": []}
        state = self._control_json(self.state_path)
        if not isinstance(state, dict) or state.get("schema_version") != 1 or not isinstance(state.get("steps"), dict):
            fail("Ungültige Statusdatei.")
        if not isinstance(state.get("history"), list):
            fail("Statusdatei benötigt eine history-Liste.")
        if require_current and (state.get("plan_sha256") != self.plan_hash or set(state["steps"]) != set(self.steps)):
            fail("Statusdatei gehört nicht zur gesperrten Planversion.")
        for sid, item in state["steps"].items():
            if not isinstance(item, dict) or item.get("status") not in ("pending", "in_progress", "passed", "blocked"):
                fail(f"Ungültiger Schrittstatus: {sid}")
            if item["status"] == "in_progress":
                text_field(item, "actor")
            if item["status"] == "passed":
                for key in ("actor", "base_revision", "head_revision", "evidence_path"):
                    text_field(item, key)
                if not re.fullmatch(r"[a-f0-9]{64}", str(item.get("evidence_sha256", ""))):
                    fail(f"{sid}: passed benötigt einen gültigen Evidenzhash.")
        return state

    def step(self, sid):
        if sid not in self.steps:
            fail(f"Unbekannter Schritt: {sid}")
        return self.steps[sid]

    def blockers(self, sid, state):
        step = self.step(sid)
        result = []
        if not step["enabled"]:
            result.append("Schritt ist nicht aktiviert")
        if self.scope_unresolved(sid):
            result.append("blocked_scope: Pfadumfang ist noch nicht auf reale Repositorypfade aufgelöst")
        for dep in step["dependencies"]:
            if state["steps"][dep]["status"] != "passed":
                result.append(f"Abhängigkeit {dep} ist nicht passed")
        try:
            self.check_entry(sid)
        except (PlanError, OSError) as exc:
            result.append(f"blocked_design_approval: {exc}")
        return result

    def check_entry(self, sid):
        """Prüft fixierte Freigabebytes und Referenzen, bestätigt keine Identität."""
        verified = []
        for check in self.step(sid).get("entry_checks", []):
            path = file_inside(self.root, check["path"])
            data, raw = read_json(path)
            if sha_bytes(raw) != check["sha256"]:
                fail(f"Designfreigabe-SHA-256 stimmt nicht mit dem Plan überein: {check['path']}")
            if (not isinstance(data, dict) or type(data.get("schema_version")) is not int
                    or data.get("schema_version") != 1
                    or data.get("status") != "approved"):
                fail("Designfreigabe benötigt schema_version=1 und status=approved.")
            scopes = unique_strings(data.get("approved_scope"), "approved_scope")
            if check["scope"] not in scopes:
                fail(f"Designfreigabe deckt den geforderten Scope nicht ab: {check['scope']}")
            text_field(data, "user_evidence")
            references = data.get("references")
            if not isinstance(references, list) or not 1 <= len(references) <= 100:
                fail("Designfreigabe benötigt 1–100 gehashte Referenzdateien.")
            ids, paths = set(), set()
            for reference in references:
                if not isinstance(reference, dict):
                    fail("Designreferenz ist kein Objekt.")
                rid = text_field(reference, "id")
                name = relative_path(reference.get("path"))
                if rid in ids or name in paths:
                    fail(f"Doppelte Designreferenz: {rid}/{name}")
                ids.add(rid)
                paths.add(name)
                expected = reference.get("sha256")
                if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
                    fail(f"Designreferenz benötigt einen gültigen SHA-256: {name}")
                if sha_file(file_inside(self.root, name)) != expected:
                    fail(f"Designreferenz-SHA-256 stimmt nicht: {name}")
            verified.append({"type": check["type"], "path": check["path"],
                             "sha256": check["sha256"], "scope": check["scope"],
                             "references_verified": len(references)})
        return verified

    def scope_unresolved(self, sid):
        step = self.step(sid)
        return bool(step.get("requires_resolved_scope", False)
                    and step.get("scope_status", "proposed") != "resolved")

    def validate(self):
        lock = self.locked() if self.lock_path.exists() else None
        state = self.state()
        for sid, item in state["steps"].items():
            if item["status"] in ("in_progress", "passed") and self.blockers(sid, state):
                fail(f"Status verletzt Abhängigkeiten/Aktivierung/Eintrittsprüfung: {sid}")
        return {"valid": True, "plan_id": self.plan["plan_id"], "version": self.plan["version"],
                "plan_sha256": self.plan_hash, "steps": len(self.steps), "locked": lock is not None}

    def lock(self):
        with self.transaction():
            if self.lock_path.exists():
                self.locked()
                return {"locked": True, "unchanged": True, "plan_sha256": self.plan_hash}
            state = self.state()
            if any(x["status"] != "pending" for x in state["steps"].values()):
                fail("Erstmaliges lock ist nur ohne bisherigen Fortschritt möglich.")
            self._write(self.lock_path, self._lock_record())
            return {"locked": True, "plan_sha256": self.plan_hash}

    def status(self):
        self.locked()
        state = self.state()
        entries = []
        for sid, step in self.steps.items():
            stored = state["steps"][sid]
            blockers = self.blockers(sid, state)
            entries.append({"id": sid, "title": step["title"], "status": stored["status"],
                            "ready": stored["status"] == "pending" and not blockers,
                            "blocked_scope": self.scope_unresolved(sid),
                            "scope_status": step.get("scope_status", "proposed"),
                            "blockers": blockers, "actor": stored.get("actor")})
        in_progress = sum(e["status"] == "in_progress" for e in entries)
        limit = self.plan.get("global_rules", {}).get("max_in_progress", 2)
        return {"plan_sha256": self.plan_hash, "max_in_progress": limit,
                "in_progress": in_progress, "free_slots": max(0, limit - in_progress), "steps": entries}

    def next(self):
        current = self.status()
        return {"plan_sha256": self.plan_hash, "free_slots": current["free_slots"],
                "ready_steps": [e["id"] for e in current["steps"] if e["ready"]],
                "blocked_scope": [e["id"] for e in current["steps"] if e["blocked_scope"]]}

    def workorder(self, sid):
        current = self.status()
        step = self.step(sid)
        status = next(e for e in current["steps"] if e["id"] == sid)
        lines = [f"# Arbeitsauftrag {sid}: {step['title']}", "", f"Planhash: {self.plan_hash}",
                 f"Status: {status['status']}; bereit: {str(status['ready']).lower()}", "",
                 "## Verbindliche Schrittdefinition", "", "```json",
                 json.dumps(step, ensure_ascii=False, indent=2), "```", "",
                 "## Ausführung", "", "1. Abhängigkeiten und verfügbaren Arbeits-Slot prüfen.",
                 "2. Schritt mit der tatsächlichen ausführenden Identität starten.",
                 "3. Ausschließlich erlaubten Umfang bearbeiten; Scope mit tatsächlichem Diff prüfen.",
                 "4. Alle vorgeschriebenen Prüfungen ausführen und Nachweisdateien ablegen.",
                 "5. Evidence-Manifest mit Planhash, Revisionen, Hashes und tatsächlichen Git-/Testnachweisen erzeugen.",
                 "6. verify ausführen; danach finish. Ein Fehler lässt den Status unverändert.", ""]
        if status["blockers"]:
            lines += ["## Aktuelle Sperren", ""] + ["- " + b for b in status["blockers"]]
        return "\n".join(lines)

    def _protected(self):
        protected = {"plan.json", "control/plan.lock.json", "control/state.json",
                     "control/planctl.py", "control/test_planctl.py", "control/README_DE.md"}
        for path in (self.plan_path, self.lock_path, self.state_path,
                     self.control / "planctl.py", self.control / "test_planctl.py",
                     self.control / "README_DE.md"):
            if path.is_relative_to(self.root):
                protected.add(path.relative_to(self.root).as_posix())
        for path in self.plan.get("global_rules", {}).get("immutable_paths", []):
            protected.add(relative_path(path, True))
        return protected

    def check_scope(self, sid, changed_files):
        step = self.step(sid)
        paths = unique_strings(changed_files, "changed_files", relative_path)
        problems = []
        for name in paths:
            file_inside(self.root, name, must_exist=False)
            if any(matches_glob(name, pat) for pat in self._protected()):
                problems.append(f"{name}: geschützte Plan-/Steuerdatei")
            elif any(matches_glob(name, pat) for pat in step["forbidden_paths"]):
                problems.append(f"{name}: ausdrücklich verboten")
            elif not any(matches_glob(name, pat) for pat in step["allowed_paths"]):
                problems.append(f"{name}: außerhalb allowed_paths")
        if problems:
            fail("Scope-Prüfung fehlgeschlagen: " + "; ".join(problems))
        return {"scope_valid": True, "step_id": sid, "changed_files": paths}

    def scope(self, sid, changed_files):
        self.locked()
        return self.check_scope(sid, changed_files)

    def start(self, sid, actor):
        actor = text_field({"actor": actor}, "actor")
        with self.transaction():
            self.locked()
            state = self.state()
            self.step(sid)
            if state["steps"][sid]["status"] != "pending":
                fail(f"{sid} ist nicht pending.")
            blockers = self.blockers(sid, state)
            if blockers:
                fail(f"{sid} kann nicht starten: " + "; ".join(blockers))
            active = sum(x["status"] == "in_progress" for x in state["steps"].values())
            if active >= self.plan.get("global_rules", {}).get("max_in_progress", 2):
                fail("Maximale Zahl gleichzeitig laufender Schritte erreicht.")
            at = utcnow()
            state["steps"][sid] = {"status": "in_progress", "actor": actor, "started_at": at}
            state["history"].append({"action": "start", "step_id": sid, "actor": actor, "at": at})
            self._write(self.state_path, state)
            return {"started": sid, "actor": actor, "plan_sha256": self.plan_hash}

    def _argument_file(self, value):
        path = Path(value)
        if path.is_absolute():
            try:
                relative = path.relative_to(self.root).as_posix()
            except ValueError:
                fail("Evidenz-/Amendmentdatei muss innerhalb project_root liegen.")
        else:
            relative = value
        return file_inside(self.root, relative), relative

    def _git_evidence(self, sid, data, relative):
        """Bind active-plan evidence to real Git objects and the current worktree.

        The evidence itself is created after the tested commit; only that exact
        file and the existing controller state may be uncommitted. All other
        changed/ignored files are rejected, including proof-file modifications.
        This is local integrity checking, not hostile-host tamper resistance.
        """
        if self.plan.get("global_rules", {}).get("evidence_source") != "local_git_verified":
            return None  # isolated contract fixtures; never used by the active plan
        for key in ("base_revision", "head_revision"):
            if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", data[key]):
                fail("Gitbindung benötigt vollständige Commit-IDs.")
        expected_path = f"evidence/{sid}/completion.json"
        if relative != expected_path:
            fail("Lokale Abschlussbelege müssen den festen Schrittpfad verwenden: " + expected_path)
        for parent in (self.root / relative, *(self.root / relative).parents):
            if parent == self.root:
                break
            if parent.is_symlink():
                fail("Abschlussbeleg darf keine Symlink-Komponente besitzen.")
        collector = self.root / "tools/acceptance/collect_changes.py"
        try:
            spec = importlib.util.spec_from_file_location("planctl_git_collection", collector)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            actual = module.collect(self.root, data["base_revision"], data["head_revision"], data["head_revision"])
        except Exception as exc:
            fail("Tatsächliche Gitbindung nicht prüfbar: " + type(exc).__name__)
        state_relative = self.state_path.relative_to(self.root).as_posix()
        permitted_metadata = {relative, state_relative}
        if set(data.get("artifacts", {})) & permitted_metadata:
            fail("Status und Abschlussbeleg sind keine unveränderlichen Prüfartefakte.")
        dirty = {p for row in actual["worktree_changes"] for p in row["paths"]}
        dirty.update(actual["untracked_files"])
        dirty.update(actual["ignored_untracked_files"])
        if dirty - permitted_metadata or any(m["dirty"] for m in actual["submodules"]):
            fail("Ungeprüfte Arbeitskopieänderungen verhindern Abschluss: " + ", ".join(sorted(dirty - permitted_metadata)))
        observed = sorted({p for row in actual["commit_changes"] for p in row["paths"]})
        supplied = sorted(unique_strings(data.get("changed_files"), "changed_files", relative_path))
        if observed != supplied:
            fail("Deklarierter Änderungsumfang stimmt nicht mit tatsächlichen Gitobjekten überein.")
        self.check_scope(sid, observed)
        return {"source": "existing_git_collector", "base_revision": actual["base_revision"],
                "head_revision": actual["head_revision"], "actual_changed_files": observed,
                "pending_completion_metadata": sorted(dirty),
                "source_worktree_clean_except_completion_metadata": True}

    def _evidence(self, sid, evidence_path):
        step = self.step(sid)
        entry_checks = self.check_entry(sid)
        path, relative = self._argument_file(evidence_path)
        data, raw = read_json(path)
        if not isinstance(data, dict) or data.get("schema_version") != 1:
            fail("Evidenz benötigt schema_version=1.")
        if data.get("step_id") != sid or data.get("plan_sha256") != self.plan_hash:
            fail("Evidenz ist an einen anderen Schritt oder Planhash gebunden.")
        for key in ("base_revision", "head_revision", "actor"):
            text_field(data, key)
        git_binding = self._git_evidence(sid, data, relative)
        self.check_scope(sid, data.get("changed_files"))
        artifacts = data.get("artifacts")
        if not isinstance(artifacts, dict) or not artifacts:
            fail("Evidenz benötigt ein nicht leeres artifacts-Hashmanifest.")
        for name, expected in artifacts.items():
            path = file_inside(self.root, name)
            if not isinstance(expected, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", expected):
                fail(f"Fehlender/ungültiger SHA-256 für {name}.")
            if sha_file(path) != expected.lower():
                fail(f"SHA-256 stimmt nicht: {name}")
        missing = set(step["required_artifacts"]) - artifacts.keys()
        if missing:
            fail("Vorgeschriebene Artefakte fehlen im Hashmanifest: " + ", ".join(sorted(missing)))
        checks = data.get("checks")
        if not isinstance(checks, list):
            fail("Evidenz benötigt eine checks-Liste.")
        observed = set()
        required = {c["id"] for c in step["checks"]}
        for check in checks:
            if not isinstance(check, dict):
                fail("Prüfungsnachweis ist kein Objekt.")
            cid = text_field(check, "id")
            if cid in observed or cid not in required:
                fail(f"Doppelter oder unbekannter Prüfungsnachweis: {cid}")
            observed.add(cid)
            if check.get("status") != "pass":
                fail(f"Prüfung ist nicht bestanden: {cid}")
            text_field(check, "summary")
            proof = unique_strings(check.get("proof_artifacts"), f"{cid}.proof_artifacts", relative_path)
            if not proof or not set(proof).issubset(artifacts):
                fail(f"{cid}: jede Prüfung braucht mindestens einen gehashten Dateinachweis.")
        if observed != required:
            fail("Prüfungsnachweise fehlen: " + ", ".join(sorted(required - observed)))
        return data, {"verified": True, "step_id": sid, "plan_sha256": self.plan_hash,
                      "evidence_path": relative, "evidence_sha256": sha_bytes(raw),
                      "checks_passed": len(checks), "artifacts_verified": len(artifacts),
                      "entry_checks_verified": entry_checks,
                      "git_binding": git_binding, "independent_review_required": False,
                      "identity_verified_externally": False, "product_tests_executed_by_planctl": False}

    def verify(self, sid, evidence_path):
        self.locked()
        return self._evidence(sid, evidence_path)[1]

    def finish(self, sid, evidence_path):
        with self.transaction():
            self.locked()
            state = self.state()
            self.step(sid)
            if state["steps"][sid]["status"] != "in_progress":
                fail(f"{sid} muss vor finish gestartet sein.")
            blockers = self.blockers(sid, state)
            if blockers:
                fail(f"{sid} kann nicht abgeschlossen werden: " + "; ".join(blockers))
            data, result = self._evidence(sid, evidence_path)
            if data["actor"] != state["steps"][sid]["actor"]:
                fail("Evidenzautor stimmt nicht mit der startenden Identität überein.")
            at = utcnow()
            state["steps"][sid].update({"status": "passed", "finished_at": at,
                "completion_mode": "single_actor_test_evidence", "base_revision": data["base_revision"],
                "head_revision": data["head_revision"], "evidence_path": result["evidence_path"],
                "evidence_sha256": result["evidence_sha256"]})
            state["history"].append({"action": "finish", "step_id": sid, "at": at,
                                     "actor": data["actor"], "completion_mode": "single_actor_test_evidence",
                                     "evidence_sha256": result["evidence_sha256"]})
            self._write(self.state_path, state)
            return dict(result, finished=sid)

    def block(self, sid, actor, reason):
        actor = text_field({"actor": actor}, "actor")
        reason = text_field({"reason": reason}, "reason")
        with self.transaction():
            self.locked()
            state = self.state()
            self.step(sid)
            item = state["steps"][sid]
            if item["status"] not in ("pending", "in_progress"):
                fail("Nur pending/in_progress kann mit block angehalten werden.")
            if item["status"] == "in_progress" and item["actor"] != actor:
                fail("Nur die startende Identität kann diesen laufenden Schritt blockieren.")
            at = utcnow()
            item.update({"status": "blocked", "blocked_by": actor, "blocked_at": at, "block_reason": reason})
            state["history"].append({"action": "block", "step_id": sid, "actor": actor, "reason": reason, "at": at})
            self._write(self.state_path, state)
            return {"blocked": sid, "reason": reason}

    def resume(self, sid, actor, reason):
        for key, value in (("actor", actor), ("reason", reason)):
            text_field({key: value}, key)
        with self.transaction():
            self.locked()
            state = self.state()
            self.step(sid)
            if state["steps"][sid]["status"] != "blocked":
                fail("resume benötigt einen blockierten Schritt.")
            if self.blockers(sid, state):
                fail("Abhängigkeiten/Aktivierung erlauben noch keinen Wiederbeginn.")
            previous = state["steps"][sid]
            state["steps"][sid] = {"status": "pending", "previous_block": previous}
            state["history"].append({"action": "resume", "step_id": sid, "actor": actor,
                                     "reason": reason, "at": utcnow()})
            self._write(self.state_path, state)
            return {"resumed_to_pending": sid, "next_action": "start"}

    def relock(self, amendment_path):
        with self.transaction():
            if not self.lock_path.exists():
                fail("relock benötigt eine bestehende Plansperre.")
            old = self._control_json(self.lock_path)
            if not isinstance(old, dict) or old.get("schema_version") != 1:
                fail("Ungültige alte Plansperre.")
            path, relative = self._argument_file(amendment_path)
            amendment, raw = read_json(path)
            if not isinstance(amendment, dict) or amendment.get("schema_version") != 1:
                fail("Amendment benötigt schema_version=1.")
            expected = {"plan_id": self.plan["plan_id"], "previous_plan_sha256": old.get("plan_sha256"),
                        "new_plan_sha256": self.plan_hash, "previous_version": old.get("plan_version"),
                        "new_version": self.plan["version"]}
            if old.get("plan_id") != self.plan["plan_id"] or any(amendment.get(k) != v for k, v in expected.items()):
                fail("Amendment passt nicht zu alter und neuer Planversion.")
            def version(value):
                if not isinstance(value, str) or not re.fullmatch(r"\d+(?:\.\d+){0,3}", value):
                    fail("Für relock müssen Versionen aus 1–4 numerischen Teilen bestehen, z. B. 1.1.0.")
                return tuple(int(v) for v in value.split(".")) + (0,) * (4 - len(value.split(".")))
            if version(self.plan["version"]) <= version(old.get("plan_version")) or old.get("plan_sha256") == self.plan_hash:
                fail("relock benötigt eine strikt neuere Planversion und einen neuen Hash.")
            for key in ("author", "reason"):
                text_field(amendment, key)
            state = self.state(require_current=False)
            if self.state_path.exists() and state.get("plan_sha256") != old.get("plan_sha256"):
                fail("Vorhandener Status passt nicht zur alten Plansperre.")
            if any(x["status"] == "in_progress" for x in state["steps"].values()):
                fail("Vor relock müssen laufende Arbeitsschritte regulär beendet oder gesondert angehalten werden.")
            new = self._lock_record()
            previous = old.get("step_fingerprints")
            old_dependencies = old.get("dependencies")
            if not isinstance(previous, dict) or not isinstance(old_dependencies, dict):
                fail("Alte Plansperre enthält keine überprüfbare Schrittdefinition.")
            all_ids = set(previous) | set(self.steps)
            affected = {sid for sid in all_ids if previous.get(sid) != new["step_fingerprints"].get(sid)}
            if self.plan.get("global_rules", {}) != old.get("global_rules_snapshot", {}):
                # Alte Sperren ohne Regelsnapshot werden konservativ vollständig invalidiert.
                affected = set(all_ids)
            changed = True
            while changed:
                before = len(affected)
                for sid in all_ids:
                    deps = set(old_dependencies.get(sid, [])) | set(new["dependencies"].get(sid, []))
                    if deps & affected:
                        affected.add(sid)
                changed = len(affected) != before
            declared = set(unique_strings(amendment.get("affected_steps"), "affected_steps"))
            if declared != affected:
                fail("affected_steps muss geänderte Schritte und alle abhängigen Folgeschritte exakt nennen: " + ", ".join(sorted(affected)))
            at = utcnow()
            new_state = {"schema_version": 1, "plan_sha256": self.plan_hash,
                         "steps": {}, "history": list(state["history"])}
            for sid in self.steps:
                new_state["steps"][sid] = ({"status": "pending"} if sid in affected
                    else state["steps"].get(sid, {"status": "pending"}))
            record = {"path": relative, "sha256": sha_bytes(raw), "previous_plan_sha256": old["plan_sha256"],
                      "author": amendment["author"], "completion_mode": "single_actor_test_evidence",
                      "affected_steps": sorted(affected), "at": at}
            new_state["history"].append(dict(record, action="relock"))
            new["amendment"] = record
            # Sperre zuerst: ein Prozessabbruch zwischen den beiden atomaren Writes blockiert
            # weitere Aktionen wegen Hashabweichung, statt veralteten Fortschritt freizugeben.
            self._write(self.lock_path, new)
            self._write(self.state_path, new_state)
            return {"relocked": True, "plan_sha256": self.plan_hash, "reset_steps": sorted(affected)}


def parse_changed_files(value, root):
    if value.lstrip().startswith("["):
        return decode_json(value, "changed-files Argument")
    path = Path(value)
    if not path.is_absolute():
        path = root / path
    if not path.is_file() or path.stat().st_size > 1024 * 1024:
        fail("Änderungsliste fehlt oder überschreitet 1 MiB.")
    content = path.read_text(encoding="utf-8")
    return decode_json(content, str(path)) if content.lstrip().startswith("[") else content.splitlines()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", default=str(Path(__file__).resolve().parent.parent / "plan.json"))
    parser.add_argument("--project-root", help="Wurzel für Produkt-/Nachweisdateien; Standard: Ordner mit plan.json")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "lock", "next", "status"):
        commands.add_parser(name)
    work = commands.add_parser("workorder")
    work.add_argument("step")
    scope = commands.add_parser("scope")
    scope.add_argument("step")
    scope.add_argument("--changed-files", required=True)
    start = commands.add_parser("start")
    start.add_argument("step")
    start.add_argument("--actor", required=True)
    for name in ("verify", "finish"):
        command = commands.add_parser(name)
        command.add_argument("step")
        command.add_argument("--evidence", required=True)
    relock = commands.add_parser("relock")
    relock.add_argument("--amendment", required=True)
    block = commands.add_parser("block")
    block.add_argument("step")
    block.add_argument("--actor", required=True)
    block.add_argument("--reason", required=True)
    resume = commands.add_parser("resume")
    resume.add_argument("step")
    resume.add_argument("--actor", required=True)
    resume.add_argument("--reason", required=True)
    args = parser.parse_args(argv)
    try:
        ctl = Controller(args.plan, args.project_root)
        if args.command in ("validate", "lock", "next", "status"):
            result = getattr(ctl, args.command)()
        elif args.command == "workorder":
            print(ctl.workorder(args.step))
            return 0
        elif args.command == "scope":
            result = ctl.scope(args.step, parse_changed_files(args.changed_files, ctl.root))
        elif args.command == "start":
            result = ctl.start(args.step, args.actor)
        elif args.command in ("verify", "finish"):
            result = getattr(ctl, args.command)(args.step, args.evidence)
        elif args.command == "block":
            result = ctl.block(args.step, args.actor, args.reason)
        elif args.command == "resume":
            result = ctl.resume(args.step, args.actor, args.reason)
        else:
            result = ctl.relock(args.amendment)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (PlanError, OSError, RuntimeError) as exc:
        print(f"FEHLER: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
