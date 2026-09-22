"""Small local HTTP server for the Hermes Manager frontend and API."""

from __future__ import annotations

import json
import fnmatch
import hmac
import mimetypes
import os
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import reports
from .config import DATA_DIR, ROOT, VALID_CARD_STATUSES
from .state import build_state
from .storage import (
    load_actions,
    load_tasks,
    read_json,
    save_actions,
    save_tasks,
    timestamp_id,
    write_action_note,
    write_json,
    write_task_note,
)
from .config import OVERRIDES_PATH
from .jobs import execute_recurring_job, save_recurring_job
from .runs import save_completed_run_report, start_run
from .scheduler import start_scheduler
from .health import check_health
from .presets import save_prompt_presets


class HermesManagerHandler(BaseHTTPRequestHandler):
    server_version = "HermesManager/0.2"

    def do_OPTIONS(self) -> None:
        """Answer CORS and browser private-network preflights for API routes."""
        if not urlparse(self.path).path.startswith("/api/"):
            self.send_error(404, "Unknown endpoint")
            return
        origin = self.headers.get("Origin", "")
        if origin and not _origin_allowed(origin):
            self.send_error(403, "Origin is not allowed")
            return
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/") and not self._authorize_api():
            return
        if parsed.path == "/api/state":
            self._send_json(build_state())
            return
        if parsed.path == "/api/health":
            self._send_json({"service": "Hermes Manager bridge", **check_health()})
            return
        if parsed.path == "/api/reports":
            self._send_json({"reports": reports.list_reports()})
            return
        if parsed.path.startswith("/api/reports/"):
            self._handle_report_get(parsed.path)
            return
        self._serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/") and not self._authorize_api():
            return
        if parsed.path == "/api/sync":
            self._send_json(build_state())
            return
        if parsed.path == "/api/tasks":
            self._send_json(add_task(self._read_json_body()), status=201)
            return
        if parsed.path == "/api/actions":
            self._send_json(stage_action(self._read_json_body()), status=201)
            return
        if parsed.path == "/api/runs":
            self._send_json(start_console_run(self._read_json_body()), status=202)
            return
        if parsed.path.startswith("/api/runs/") and parsed.path.endswith("/save"):
            run_id = unquote(parsed.path[len("/api/runs/") : -len("/save")]).strip("/")
            payload = self._read_json_body()
            self._send_json(save_run_report(run_id, payload), status=201)
            return
        if parsed.path == "/api/recurring":
            self._send_json(save_recurring(self._read_json_body()), status=201)
            return
        if parsed.path.startswith("/api/recurring/") and parsed.path.endswith("/run"):
            job_id = unquote(parsed.path[len("/api/recurring/") : -len("/run")]).strip("/")
            self._send_json(run_recurring(job_id), status=202)
            return
        if parsed.path == "/api/presets":
            self._send_json(save_presets(self._read_json_body()), status=200)
            return
        if parsed.path == "/api/reports":
            self._send_json(save_report(self._read_json_body()), status=201)
            return
        self.send_error(404, "Unknown endpoint")

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/") and not self._authorize_api():
            return
        prefix = "/api/cards/"
        if parsed.path.startswith(prefix):
            card_id = unquote(parsed.path[len(prefix) :])
            payload = self._read_json_body()
            self._send_json(update_card(card_id, payload))
            return
        self.send_error(404, "Unknown endpoint")

    def log_message(self, format: str, *args: object) -> None:
        # Keep the local terminal readable while still using BaseHTTPRequestHandler.
        print(f"[bridge] {self.address_string()} - {format % args}")

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin and _origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Hermes-Token")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def _authorize_api(self) -> bool:
        origin = self.headers.get("Origin", "")
        if origin and not _origin_allowed(origin):
            self._send_json({"error": "Origin is not allowed."}, status=403)
            return False
        expected = os.environ.get("HERMES_MANAGER_TOKEN", "").strip()
        supplied = self.headers.get("X-Hermes-Token", "").strip()
        if expected and not hmac.compare_digest(supplied, expected):
            self._send_json({"error": "A valid bridge pairing token is required."}, status=401)
            return False
        return True

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _send_json(self, payload: object, status: int = 200) -> None:
        encoded = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_markdown(self, filename: str, body: str) -> None:
        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/markdown; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _handle_report_get(self, request_path: str) -> None:
        tail = unquote(request_path[len("/api/reports/") :]).strip("/")
        if not tail:
            self.send_error(404, "Report not found")
            return
        if tail.endswith("/download"):
            report_id = tail[: -len("/download")].strip("/")
            download = reports.get_report_download(report_id)
            if not download:
                self.send_error(404, "Report not found")
                return
            self._send_markdown(*download)
            return
        report = reports.get_report(tail)
        if not report:
            self.send_error(404, "Report not found")
            return
        self._send_json(report)

    def _serve_static(self, request_path: str) -> None:
        target = _safe_static_path(request_path)
        if target.is_dir():
            target = target / "index.html"
        if not target.exists() or not target.is_file():
            self.send_error(404, "File not found")
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def update_card(card_id: str, payload: dict) -> dict:
    status = payload.get("status")
    due_date = str(payload.get("dueDate") or "").strip()
    if status is not None and status not in VALID_CARD_STATUSES:
        return build_state()
    if status is None and not due_date:
        return build_state()

    overrides = read_json(OVERRIDES_PATH, {})
    if not isinstance(overrides, dict):
        overrides = {}
    override = overrides.setdefault(card_id, {})
    if status is not None:
        override["status"] = status
    if due_date:
        override["dueDate"] = due_date
    write_json(OVERRIDES_PATH, overrides)

    action = {
        "id": timestamp_id("action"),
        "kind": "card-update",
        "targetId": card_id,
        "title": "Card updated",
        "detail": f"{card_id} updated with {', '.join(key for key in ('status', 'due date') if (key == 'status' and status is not None) or (key == 'due date' and due_date))}.",
        "status": "logged",
        "createdAt": _utc_timestamp(),
    }
    actions = load_actions()
    actions.insert(0, action)
    save_actions(actions)
    write_action_note(action)
    return build_state()


def add_task(payload: dict) -> dict:
    tasks = load_tasks()
    task = {
        "id": timestamp_id("task"),
        "title": str(payload.get("title") or "Untitled task").strip(),
        "owner": str(payload.get("owner") or "Unassigned").strip(),
        "priority": str(payload.get("priority") or "medium").strip(),
        "dueDate": str(payload.get("dueDate") or "").strip(),
        "summary": str(payload.get("summary") or "Manual dashboard task.").strip(),
        "status": "pending",
        "source": "Hermes Manager",
        "labels": ["Manual", "Operator"],
    }
    tasks.insert(0, task)
    save_tasks(tasks)
    write_task_note(task)
    return build_state()


def stage_action(payload: dict) -> dict:
    actions = load_actions()
    action = {
        "id": timestamp_id("action"),
        "kind": str(payload.get("kind") or "operator-action").strip(),
        "targetId": str(payload.get("targetId") or "").strip(),
        "title": str(payload.get("title") or "Operator action").strip(),
        "detail": str(payload.get("detail") or "Action staged from Hermes Manager.").strip(),
        "status": "staged",
        "createdAt": _utc_timestamp(),
    }
    actions.insert(0, action)
    save_actions(actions)
    write_action_note(action)
    return build_state()


def start_console_run(payload: dict) -> dict:
    prompt = str(payload.get("prompt") or "").strip()
    state = build_state()
    if not prompt:
        state["runError"] = "Enter a request before running Hermes."
        return state
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    metadata = {
        **metadata,
        "model": metadata.get("model") or state["bridge"].get("model", ""),
        "provider": metadata.get("provider") or state["bridge"].get("provider", ""),
    }
    run = start_run(prompt, str(payload.get("kind") or "console"), metadata=metadata)
    state = build_state()
    state["runId"] = run["id"]
    return state


def save_recurring(payload: dict) -> dict:
    job, result = save_recurring_job(payload)
    state = build_state()
    state["recurringResult"] = result
    state["recurringJobId"] = job["id"]
    return state


def run_recurring(job_id: str) -> dict:
    job, result = execute_recurring_job(job_id)
    state = build_state()
    state["recurringResult"] = result
    if job:
        state["recurringJobId"] = job["id"]
    return state


def save_report(payload: dict, vault_path: str | Path | None = None) -> dict:
    """Persist through the configured vault; tests may inject an isolated vault."""
    report = reports.persist_report(payload, vault_path=vault_path)
    state = build_state()
    state["reportId"] = report["id"]
    return state


def save_run_report(run_id: str, payload: dict) -> dict:
    report = save_completed_run_report(run_id, str(payload.get("title") or ""))
    if not report:
        state = build_state()
        state["reportError"] = "Only completed Hermes runs with output can be saved."
        return state
    state = build_state()
    state["reportId"] = report["id"]
    return state


def save_presets(payload: dict) -> dict:
    save_prompt_presets(payload)
    return build_state()


def run() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    start_scheduler()
    port = int(os.environ.get("HERMES_MANAGER_PORT", os.environ.get("HERMES_DEAL_DESK_PORT", "4174")))
    server = ThreadingHTTPServer(("127.0.0.1", port), HermesManagerHandler)
    print(f"Hermes Manager bridge running at http://localhost:{port}")
    server.serve_forever()


def _safe_static_path(request_path: str) -> Path:
    cleaned = unquote(request_path).lstrip("/") or "index.html"
    target = (ROOT / cleaned).resolve()
    if ROOT not in target.parents and target != ROOT:
        return ROOT / "index.html"
    return target


def _utc_timestamp() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _origin_allowed(origin: str) -> bool:
    """Allow loopback and explicitly configured hosted origins only."""
    parsed = urlparse(origin)
    if parsed.scheme in {"http", "https"} and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        return True
    configured = [item.strip() for item in os.environ.get("HERMES_MANAGER_ALLOWED_ORIGINS", "").split(",") if item.strip()]
    return any(fnmatch.fnmatchcase(origin, pattern) for pattern in configured)
