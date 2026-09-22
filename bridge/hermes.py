"""Hermes CLI adapters used by the local dashboard bridge."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from typing import Any

from .config import HERMES


@dataclass
class HermesResult:
    command: str
    ok: bool
    output: str
    error: str = ""


def run_hermes(*args: str, timeout: int = 12) -> HermesResult:
    """Run a Hermes command and return text that the UI can report safely."""
    command = " ".join([str(HERMES), *args])
    if not HERMES.exists():
        return HermesResult(command, False, "", f"Hermes executable not found at {HERMES}")

    try:
        completed = subprocess.run(
            [str(HERMES), *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return HermesResult(command, False, "", "Hermes command timed out.")
    except OSError as exc:
        return HermesResult(command, False, "", str(exc))

    output = (completed.stdout or "").strip()
    error = (completed.stderr or "").strip()
    return HermesResult(command, completed.returncode == 0, output, error)


def load_hermes_snapshot() -> dict[str, Any]:
    """Collect the non-destructive Hermes state used by the manager UI."""
    status = run_hermes("status", timeout=18)
    kanban = load_kanban_tasks()
    cron = load_cron_jobs()
    sessions = load_sessions()
    errors = load_recent_errors()

    parsed_status = parse_status(status.output) if status.output else {}
    return {
        "connected": status.ok,
        "message": "Hermes CLI connected." if status.ok else "Hermes CLI unavailable. Configure HERMES_CLI_PATH.",
        "status": parsed_status,
        "rawStatus": status.output,
        "gatewayRunning": bool(parsed_status.get("gatewayRunning")),
        "activeSessions": int(parsed_status.get("activeSessions", 0)),
        "kanban": kanban,
        "cron": cron,
        "sessions": sessions,
        "errors": errors,
    }


def load_kanban_tasks() -> list[dict[str, Any]]:
    result = run_hermes("kanban", "list", "--json", "--archived")
    if not result.ok or not result.output:
        return []
    try:
        payload = json.loads(result.output)
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else []


def load_cron_jobs() -> list[dict[str, str]]:
    result = run_hermes("cron", "list", "--all")
    if not result.ok or not result.output or "No scheduled jobs" in result.output:
        return []

    formatted = _parse_cron_blocks(result.output)
    if formatted:
        return formatted

    jobs: list[dict[str, str]] = []
    for index, line in enumerate(_useful_table_lines(result.output), start=1):
        jobs.append(
            {
                "id": _extract_id(line, f"cron-{index}"),
                "name": _clean_table_line(line),
                "schedule": _extract_schedule(line),
                "raw": line,
            }
        )
    return jobs


def _parse_cron_blocks(output: str) -> list[dict[str, str]]:
    """Parse Hermes' box-formatted cron output one job block at a time."""
    jobs: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for raw_line in output.splitlines():
        line = raw_line.strip()
        header = re.match(r"^([0-9a-f]{12})\s+\[([^]]+)\]$", line, flags=re.IGNORECASE)
        if header:
            if current:
                jobs.append(current)
            current = {"id": header.group(1), "status": header.group(2), "name": "", "schedule": "", "raw": line}
            continue
        if current is None:
            continue
        field = re.match(r"^(Name|Schedule|Deliver):\s*(.*)$", line)
        if field:
            key = {"Name": "name", "Schedule": "schedule", "Deliver": "delivery"}[field.group(1)]
            current[key] = field.group(2).strip()
    if current:
        jobs.append(current)
    return jobs


def load_sessions() -> list[dict[str, str]]:
    result = run_hermes("sessions", "list", "--limit", "20")
    if not result.ok or not result.output:
        return []

    sessions: list[dict[str, str]] = []
    for index, line in enumerate(_useful_table_lines(result.output), start=1):
        session_id = _extract_id(line, f"session-{index}")
        if session_id.startswith("session-") and not re.search(r"\d{8}_\d{6}", line):
            continue
        sessions.append(
            {
                "id": session_id,
                "name": _clean_table_line(line),
                "raw": line,
            }
        )
    return sessions


def load_recent_errors() -> list[dict[str, str]]:
    result = run_hermes("logs", "errors", "-n", "12")
    if not result.ok or not result.output:
        return []
    if "No errors" in result.output:
        return []

    errors: list[dict[str, str]] = []
    for index, line in enumerate(_useful_table_lines(result.output), start=1):
        errors.append({"id": f"error-{index}", "name": line[:110], "raw": line})
    return errors


def build_agent_rows(snapshot: dict[str, Any], card_count: int) -> list[dict[str, Any]]:
    """Return live process rows; historical sessions and errors stay in traceback."""
    status = snapshot.get("status", {})
    cron_jobs = snapshot.get("cron", [])
    sessions = snapshot.get("sessions", [])
    kanban = snapshot.get("kanban", [])
    active_runs = snapshot.get("runs", [])
    connected = bool(snapshot.get("connected"))

    rows: list[dict[str, Any]] = [
        {
            "id": "hermes-gateway",
            "name": "Hermes Gateway",
            "role": "Local routing layer for model runs, tools and connected channels.",
            "status": "Connected" if connected and status.get("gatewayRunning") else "Unavailable",
            "progress": 100 if connected and status.get("gatewayRunning") else 0,
            "queue": len(kanban),
            "currentTask": snapshot.get("message") or "Waiting for local Hermes status.",
            "lastRun": status.get("model") or "local",
            "runtime": f"{len(sessions)} sessions",
            "category": "system",
        },
        {
            "id": "obsidian-ingest",
            "name": "Obsidian Inbox Sync",
            "role": "Reads email-summary notes from the connected vault into the Kanban board.",
            "status": "Connected" if card_count else "Unavailable",
            "progress": 100 if card_count else 0,
            "queue": card_count,
            "currentTask": f"{card_count} vault-backed cards indexed for review.",
            "lastRun": "On refresh",
            "runtime": "local file scan",
            "category": "system",
        },
    ]

    rows.extend(_rows_from_cron(cron_jobs))
    if status.get("activeSessions", 0) > 0:
        rows.extend(_rows_from_active_sessions(sessions, status["activeSessions"]))

    rows.extend(_rows_from_console_runs(active_runs))

    return rows


def _rows_from_console_runs(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for run in runs:
        if run.get("status") not in {"queued", "running"}:
            continue
        rows.append(
            {
                "id": f"run-{run.get('id', 'unknown')}",
                "name": "Hermes Console Run",
                "role": "Operator request running through the local Hermes console.",
                "status": "Running" if run.get("status") == "running" else "Queued",
                "progress": 45 if run.get("status") == "running" else 15,
                "queue": 0,
                "currentTask": run.get("prompt") or "Processing operator request.",
                "lastRun": run.get("startedAt", ""),
                "runtime": "console run",
                "category": "current",
            }
        )
    return rows


def parse_status(output: str) -> dict[str, Any]:
    status: dict[str, Any] = {}
    for line in output.splitlines():
        if "Model:" in line:
            status["model"] = line.split("Model:", 1)[1].strip()
        elif "Provider:" in line:
            status["provider"] = line.split("Provider:", 1)[1].strip()
        elif "Status:" in line and "running" in line.lower():
            status["gatewayRunning"] = True
        elif "Jobs:" in line:
            status["scheduledJobs"] = _first_int(line)
        elif "Active:" in line:
            status["activeSessions"] = _first_int(line)
    return status


def _rows_from_cron(jobs: list[dict[str, str]]) -> list[dict[str, Any]]:
    rows = []
    for job in jobs:
        rows.append(
            {
                "id": f"cron-{job['id']}",
                "name": job["name"] or "Recurring Hermes job",
                "role": "Scheduled Hermes automation.",
                "status": "Recurring",
                "progress": 75,
                "queue": 1,
                "currentTask": job.get("schedule") or job.get("raw") or "Scheduled job.",
                "lastRun": "Scheduled",
                "runtime": job.get("schedule") or "cron",
                "category": "recurring",
            }
        )
    return rows


def _rows_from_active_sessions(sessions: list[dict[str, str]], active_count: int) -> list[dict[str, Any]]:
    rows = []
    for session in sessions[:active_count]:
        rows.append(
            {
                "id": f"thread-{session['id']}",
                "name": session.get("name") or session["id"],
                "role": "Hermes session / thread.",
                "status": "Running",
                "progress": 60,
                "queue": 1,
                "currentTask": session.get("raw") or "Hermes session.",
                "lastRun": session["id"],
                "runtime": "session",
                "category": "current",
            }
        )
    return rows


def _useful_table_lines(output: str) -> list[str]:
    lines = []
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line or set(line) <= {"-", "+", "|", " "}:
            continue
        if line.startswith("---"):
            continue
        if line.lower().startswith(("id ", "title ", "created", "no scheduled", "create one")):
            continue
        lines.append(line)
    return lines


def _clean_table_line(line: str) -> str:
    cleaned = re.sub(r"\s+", " ", line.replace("|", " ")).strip()
    return cleaned[:130]


def _extract_id(line: str, fallback: str) -> str:
    match = re.search(r"\b\d{8}_\d{6}_[A-Za-z0-9]+\b", line)
    if match:
        return match.group(0)
    match = re.search(r"\b[A-Za-z0-9][A-Za-z0-9_.:-]{5,}\b", line)
    return match.group(0) if match else fallback


def _extract_schedule(line: str) -> str:
    lowered = line.lower()
    if "daily" in lowered:
        return "daily"
    if "weekly" in lowered:
        return "weekly"
    if "hourly" in lowered:
        return "hourly"
    cron_match = re.search(r"(\*|\d+)\s+(\*|\d+)\s+(\*|\d+)\s+(\*|\d+)\s+(\*|\d+)", line)
    return cron_match.group(0) if cron_match else "scheduled"


def _first_int(line: str) -> int:
    match = re.search(r"\d+", line)
    return int(match.group(0)) if match else 0
