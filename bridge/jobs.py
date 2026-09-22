"""Recurring prompt configuration and Hermes cron synchronization."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
import re
from typing import Any

from .config import RECURRING_PATH
from .hermes import parse_status, run_hermes
from .runs import start_run
from .storage import load_json_list, save_json_list, timestamp_id


DEFAULT_EMAIL_PROMPT = (
    "Review the most recent email-summary notes in the connected Obsidian vault. "
    "Return a short daily briefing with bullet points grouped into: urgent actions, "
    "deal activity, portfolio or liquidity items, LP or relationship follow-ups, and "
    "items requiring no response. Include the source note ID for every item. "
    "Do not make investment decisions or present unverified claims as facts."
)


def load_recurring_jobs() -> list[dict[str, Any]]:
    return load_json_list(RECURRING_PATH)


def save_recurring_job(
    payload: dict[str, Any],
    vault_path: str | Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Persist a job locally and attempt to create or edit its Hermes cron entry."""
    jobs = load_recurring_jobs()
    existing = next((job for job in jobs if job.get("id") == payload.get("id")), None)
    report_config = _clean_report_config(payload.get("reportConfig") or payload.get("report"))
    job = {
        "id": existing.get("id") if existing else timestamp_id("job"),
        "hermesId": (existing or {}).get("hermesId", ""),
        "name": str(payload.get("name") or "Daily Email Summary").strip(),
        "schedule": str(payload.get("schedule") or "0 9 * * 1-5").strip(),
        "prompt": str(payload.get("prompt") or DEFAULT_EMAIL_PROMPT).strip(),
        "delivery": str(payload.get("delivery") or "local").strip(),
        "scheduleConfig": _clean_schedule_config(payload.get("scheduleConfig")),
        "reportConfig": report_config,
        "runner": "local-bridge",
        "vaultPath": str(vault_path or payload.get("vaultPath") or (existing or {}).get("vaultPath") or ""),
        "status": "syncing",
    }

    if job["hermesId"]:
        result = run_hermes(
            "cron",
            "edit",
            job["hermesId"],
            "--schedule",
            job["schedule"],
            "--prompt",
            job["prompt"],
            "--name",
            job["name"],
            "--deliver",
            job["delivery"],
            "--paused",
            "--paused-reason",
            "Managed by Hermes Manager local report runner.",
            timeout=20,
        )
    else:
        result = run_hermes(
            "cron",
            "create",
            job["schedule"],
            job["prompt"],
            "--name",
            job["name"],
            "--deliver",
            job["delivery"],
            "--paused",
            "--paused-reason",
            "Managed by Hermes Manager local report runner.",
            timeout=20,
        )

    job["status"] = "synced" if result.ok else "needs-attention"
    job["message"] = result.output or result.error or "Hermes cron command completed."
    if result.ok:
        job["hermesId"] = _extract_job_id(result.output)

    jobs = [job if item.get("id") == job["id"] else item for item in jobs]
    if not any(item.get("id") == job["id"] for item in jobs):
        jobs.insert(0, job)
    save_json_list(RECURRING_PATH, jobs[:30])
    return job, {"ok": result.ok, "message": job["message"]}


def execute_recurring_job(
    job_id: str,
    now: date | datetime | None = None,
    vault_path: str | Path | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Start a recurring report run using the saved prompt and stable report key."""
    jobs = load_recurring_jobs()
    job = next((item for item in jobs if item.get("id") == job_id), None)
    if not job:
        return None, {"ok": False, "message": f"Recurring job not found: {job_id}"}

    period = _period_key(now)
    report_config = _clean_report_config(job.get("reportConfig"))
    report_title = report_config.get("title") or f"{job.get('name', 'Hermes Briefing')} - {period}"
    status_result = run_hermes("status", timeout=18)
    model_status = parse_status(status_result.output) if status_result.ok else {}
    run = start_run(
        str(job.get("prompt") or DEFAULT_EMAIL_PROMPT),
        kind="recurring-report",
        metadata={
            "title": str(job.get("name") or "Recurring Hermes report"),
            "recurringJobId": job["id"],
            "hermesId": job.get("hermesId", ""),
            "schedule": job.get("schedule", ""),
            "runner": job.get("runner", "local-bridge"),
            "model": model_status.get("model", ""),
            "provider": model_status.get("provider", ""),
            "report": {
                "kind": report_config.get("kind", "briefing"),
                "title": report_title,
                "summary": report_config.get("summary") or f"Recurring briefing from {job.get('name', 'Hermes')}.",
                "idempotencyKey": f"recurring:{job['id']}:{period}",
            },
        },
        vault_path=vault_path or job.get("vaultPath") or None,
    )
    job["lastRunId"] = run["id"]
    job["lastRunAt"] = run.get("startedAt", _utc_timestamp())
    job["status"] = "running"
    updated = [job if item.get("id") == job_id else item for item in jobs]
    save_json_list(RECURRING_PATH, updated[:30])
    return job, {"ok": True, "message": "Recurring report run started.", "runId": run["id"]}


def mark_recurring_job_finished(job_id: str, run_id: str, status: str) -> None:
    """Reflect the terminal state of a local recurring run in its job record."""
    jobs = load_recurring_jobs()
    for job in jobs:
        if job.get("id") == job_id:
            job["status"] = "completed" if status == "completed" else "needs-attention"
            job["lastRunStatus"] = status
            job["lastRunId"] = run_id
            break
    save_json_list(RECURRING_PATH, jobs[:30])


def _clean_schedule_config(value: Any) -> dict[str, str]:
    """Keep the human schedule settings beside Hermes' generated cron string."""
    if not isinstance(value, dict):
        return {}
    return {
        "cadence": str(value.get("cadence") or "weekdays").strip(),
        "time": str(value.get("time") or "09:00").strip(),
        "weekday": str(value.get("weekday") or "1").strip(),
        "monthDay": str(value.get("monthDay") or "1").strip(),
    }


def _clean_report_config(value: Any) -> dict[str, str]:
    """Normalize report options retained beside the Hermes cron prompt."""
    if not isinstance(value, dict):
        value = {}
    return {
        "kind": str(value.get("kind") or "briefing").strip(),
        "title": str(value.get("title") or "").strip(),
        "summary": str(value.get("summary") or "").strip(),
    }


def _period_key(value: date | datetime | None) -> str:
    if value is None:
        return datetime.utcnow().date().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat()


def _utc_timestamp() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _extract_job_id(output: str) -> str:
    match = re.search(r"\b[0-9a-f]{12}\b", output, flags=re.IGNORECASE)
    if match:
        return match.group(0)
    for token in output.split():
        if len(token) >= 6 and all(character.isalnum() or character in "_-" for character in token):
            return token.strip(".,")
    return ""
