"""Background Hermes runs started from the local Manager console."""

from __future__ import annotations

import subprocess
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import HERMES, RUNS_PATH, get_vault_path
from .reports import persist_run_report
from .storage import load_json_list, save_json_list, timestamp_id


MAX_OUTPUT_CHARS = 24_000


def load_runs() -> list[dict[str, Any]]:
    """Return recent console runs, newest first."""
    return load_json_list(RUNS_PATH)


def save_completed_run_report(run_id: str, title: str = "") -> dict[str, Any] | None:
    """Explicitly archive a completed manual run as an Obsidian report."""
    runs = load_runs()
    run = next((item for item in runs if str(item.get("id")) == str(run_id)), None)
    if not run or run.get("status") != "completed" or not str(run.get("output") or "").strip():
        return None
    if run.get("reportId"):
        return _report_for_run(run)

    metadata = dict(run.get("metadata") or {})
    metadata["report"] = {
        "kind": "manual-briefing",
        "title": title.strip() if title.strip() else run.get("title") or "Hermes Briefing",
        "idempotencyKey": f"manual:{run['id']}",
    }
    run["metadata"] = metadata
    report = persist_run_report(run, str(run.get("output") or ""), vault_path=run.get("vaultPath"))
    if not report:
        return None
    _record_report_link(run, report)
    save_json_list(RUNS_PATH, runs[:30])
    return report


def start_run(
    prompt: str,
    kind: str = "console",
    metadata: dict[str, Any] | None = None,
    vault_path: str | Path | None = None,
) -> dict[str, Any]:
    """Start a local Hermes one-shot and collect its result in a daemon thread."""
    vault = get_vault_path(vault_path or (metadata or {}).get("vaultPath"))
    clean_metadata = _clean_metadata(metadata)
    run = {
        "id": timestamp_id("run"),
        "kind": kind,
        "title": str(clean_metadata.get("title") or _title_from_prompt(prompt)),
        "prompt": prompt,
        "status": "queued",
        "output": "",
        "error": "",
        "startedAt": _utc_timestamp(),
        "completedAt": "",
        "vaultPath": str(vault),
        "metadata": clean_metadata,
    }
    runs = load_runs()
    runs.insert(0, run)
    save_json_list(RUNS_PATH, runs[:30])

    try:
        process = subprocess.Popen(
            [
                str(HERMES),
                "--in",
                str(vault),
                "chat",
                "--query-file",
                "-",
                "--oneshot",
                "--quiet",
                "--source",
                "tool",
            ],
            cwd=str(vault),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except OSError as exc:
        _finish_run(run["id"], "failed", "", str(exc))
        return next(item for item in load_runs() if item["id"] == run["id"])

    run["status"] = "running"
    run["pid"] = process.pid
    save_json_list(RUNS_PATH, _replace_run(load_runs(), run))
    threading.Thread(
        target=_collect_run,
        args=(process, run["id"], _prompt_with_vault_context(prompt, vault)),
        daemon=True,
    ).start()
    return run


def _collect_run(process: subprocess.Popen[str], run_id: str, prompt: str) -> None:
    stdout, stderr = process.communicate(input=prompt)
    output = (stdout or "").strip()[-MAX_OUTPUT_CHARS:]
    error = (stderr or "").strip()[-MAX_OUTPUT_CHARS:]
    status = "completed" if process.returncode == 0 else "failed"
    extra: dict[str, Any] = {}
    if status == "completed" and output:
        run = next((item for item in load_runs() if item.get("id") == run_id), {})
        report = persist_run_report(run, output, vault_path=run.get("vaultPath"))
        if report:
            extra.update(_report_link_fields(report))
    _finish_run(run_id, status, output, error, extra=extra)


def _finish_run(run_id: str, status: str, output: str, error: str, extra: dict[str, Any] | None = None) -> None:
    runs = load_runs()
    for run in runs:
        if run.get("id") == run_id:
            run.update({"status": status, "output": output, "error": error, "completedAt": _utc_timestamp()})
            if extra:
                run.update(extra)
            run.pop("pid", None)
            break
    save_json_list(RUNS_PATH, runs[:30])
    finished = next((item for item in runs if item.get("id") == run_id), None)
    recurring_job_id = (finished or {}).get("metadata", {}).get("recurringJobId")
    if recurring_job_id:
        from .jobs import mark_recurring_job_finished

        mark_recurring_job_finished(str(recurring_job_id), run_id, status)


def _replace_run(runs: list[dict[str, Any]], replacement: dict[str, Any]) -> list[dict[str, Any]]:
    return [replacement if item.get("id") == replacement.get("id") else item for item in runs]


def _prompt_with_vault_context(prompt: str, vault_path: str | Path) -> str:
    return (
        "Use the connected local Obsidian vault as the source of truth for this request. "
        f"The vault is at {vault_path}. Read relevant notes directly, distinguish email facts "
        "from assumptions, and return a concise human-reviewable answer.\n\n"
        f"Operator request:\n{prompt.strip()}"
    )


def _clean_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for key, value in metadata.items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            cleaned[str(key)] = value
        elif isinstance(value, dict):
            cleaned[str(key)] = {
                str(child_key): child_value
                for child_key, child_value in value.items()
                if isinstance(child_value, (str, int, float, bool)) or child_value is None
            }
        elif isinstance(value, (list, tuple)):
            cleaned[str(key)] = [str(item) for item in value[:20]]
        else:
            cleaned[str(key)] = str(value)
    return cleaned


def _title_from_prompt(prompt: str) -> str:
    compact = " ".join(str(prompt or "").split())
    return compact[:80] or "Hermes run"


def _utc_timestamp() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _record_report_link(run: dict[str, Any], report: dict[str, Any]) -> None:
    run.update(_report_link_fields(report))


def _report_link_fields(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "reportId": report.get("id", ""),
        "reportPath": report.get("path", ""),
        "savedAt": report.get("updatedAt") or _utc_timestamp(),
        "jobId": report.get("jobId", ""),
        "model": report.get("model", ""),
        "provider": report.get("provider", ""),
    }


def _report_for_run(run: dict[str, Any]) -> dict[str, Any] | None:
    report_id = str(run.get("reportId") or "")
    if not report_id:
        return None
    from .reports import get_report

    return get_report(report_id, run.get("vaultPath"))
