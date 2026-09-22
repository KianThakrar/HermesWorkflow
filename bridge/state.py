"""State assembly for the Hermes Manager API."""

from __future__ import annotations

import threading
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from . import obsidian as obsidian_reader
from .config import HERMES, OVERRIDES_PATH, get_vault_path
from .hermes import build_agent_rows, load_hermes_snapshot
from .jobs import load_recurring_jobs
from .presets import load_prompt_presets
from .reports import list_reports
from .runs import load_runs
from .storage import load_actions, load_tasks, read_json


_OBSIDIAN_LOCK = threading.Lock()


def build_state(vault_path: str | Path | None = None) -> dict[str, Any]:
    vault = get_vault_path(vault_path)
    overrides = read_json(OVERRIDES_PATH, {})
    if not isinstance(overrides, dict):
        overrides = {}

    vault_backed_cards, notes = _load_vault_projection(overrides, vault)
    cards = _sorted_cards([*vault_backed_cards, *load_task_cards(overrides)])
    hermes = load_hermes_snapshot()
    runs = load_runs()
    agents = build_agent_rows(
        {**hermes, "runs": runs},
        len([card for card in cards if card["sourceType"] == "vault"]),
    )
    actions = load_actions()
    recurring_jobs = merge_recurring_jobs(hermes.get("cron", []), load_recurring_jobs())

    state = {
        "bridge": {
            "reachable": True,
            "connected": bool(hermes.get("connected")),
            "message": hermes.get("message", "Hermes bridge ready."),
            "vaultName": vault.name,
            "hermesCommand": HERMES.name,
            "gatewayRunning": bool(hermes.get("gatewayRunning")),
            "activeSessions": int(hermes.get("activeSessions", 0)),
            "model": hermes.get("status", {}).get("model", "Configured default"),
            "provider": hermes.get("status", {}).get("provider", "Configured provider"),
            "syncedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        },
        "cards": cards,
        "agents": agents,
        "actions": actions,
        "traceback": hermes.get("errors", []),
        "runs": [_without_local_paths(run) for run in runs],
        "reports": list_reports(vault),
        "recurringJobs": [_without_local_paths(job) for job in recurring_jobs],
        "promptPresets": load_prompt_presets(),
        "overview": build_overview(cards, agents, actions),
        "vault": {"name": vault.name, "notes": notes},
    }
    return _redact_private_paths(state)


def load_task_cards(overrides: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    cards = []
    for task in load_tasks():
        task_id = task.get("id")
        if not task_id:
            continue
        override = overrides.get(task_id, {})
        cards.append(
            {
                "id": task_id,
                "title": task.get("title", "Manual task"),
                "company": task.get("company") or task.get("title", "Manual task"),
                "sender": task.get("sender", "Dashboard"),
                "sourceType": "task",
                "status": override.get("status") or task.get("status", "pending"),
                "priority": override.get("priority") or task.get("priority", "medium"),
                "owner": task.get("owner", "Unassigned"),
                "dueDate": override.get("dueDate") or task.get("dueDate", ""),
                "summary": task.get("summary", "Manual dashboard task."),
                "nextAction": task.get("nextAction", "Move this through the workflow as work progresses."),
                "labels": task.get("labels", ["Manual"]),
                "source": task.get("source", "Hermes Manager"),
                "sourcePath": task.get("sourcePath", ""),
                "sourceHref": task.get("sourceHref", ""),
            }
        )
    return cards


def merge_recurring_jobs(hermes_jobs: list[dict[str, Any]], local_jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prefer local records so prompt edits remain visible when cron is unavailable."""
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for job in [*local_jobs, *hermes_jobs]:
        key = str(job.get("hermesId") or job.get("id") or job.get("name") or "job")
        if key in seen:
            continue
        seen.add(key)
        merged.append(job)
    return merged


def build_overview(
    cards: list[dict[str, Any]],
    agents: list[dict[str, Any]],
    actions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for agent in agents:
        if agent.get("status") != "Running":
            continue
        items.append(
            {
                "name": agent["name"],
                "detail": agent.get("role", ""),
                "currentTask": agent.get("currentTask", ""),
            }
        )

    if actions:
        items.append(
            {
                "name": "Operator Action Queue",
                "detail": f"{len(actions)} staged action records.",
                "currentTask": "Review staged changes before promoting them into live Hermes commands.",
            }
        )

    critical = len([card for card in cards if card.get("priority") == "critical"])
    if critical:
        items.append(
            {
                "name": "Critical Desk Items",
                "detail": f"{critical} critical records require owner review.",
                "currentTask": "Use the Kanban board to advance or close each item with traceback.",
            }
        )
    return items


def _sorted_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    status_order = {"active": 0, "pending": 1, "completed": 2}
    return sorted(
        cards,
        key=lambda card: (
            status_order.get(card.get("status", ""), 9),
            priority_order.get(card.get("priority", ""), 9),
            card.get("dueDate") or "9999-12-31",
        ),
    )


def _load_vault_projection(overrides: dict[str, dict[str, Any]], vault: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Call the existing Obsidian reader with a temporary injected vault path."""
    with _OBSIDIAN_LOCK:
        previous_vault = obsidian_reader.DEMO_VAULT
        previous_triage = obsidian_reader.TRIAGE_PATH
        obsidian_reader.DEMO_VAULT = vault
        obsidian_reader.TRIAGE_PATH = vault / "Briefings" / "2026-09-07-Triage.md"
        try:
            return obsidian_reader.vault_cards(overrides), obsidian_reader.load_vault_notes()
        finally:
            obsidian_reader.DEMO_VAULT = previous_vault
            obsidian_reader.TRIAGE_PATH = previous_triage


def _without_local_paths(record: dict[str, Any]) -> dict[str, Any]:
    """Keep local execution paths in runtime storage but out of browser payloads."""
    return {key: value for key, value in record.items() if key not in {"vaultPath", "absolutePath"}}


def _redact_private_paths(value: Any) -> Any:
    """Redact the operator's home directory from all browser-facing state."""
    if isinstance(value, str):
        redacted = value.replace(str(Path.home()), "~")
        redacted = re.sub(r"/(?:Users|home)/(?:[^/\s)]*)", "~", redacted)
        return re.sub(r"[A-Za-z]:\\\\Users\\\\[^\\\\\s]+", "~", redacted)
    if isinstance(value, list):
        return [_redact_private_paths(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact_private_paths(item) for key, item in value.items()}
    return value
