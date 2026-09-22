"""Local JSON and Obsidian-backed persistence helpers."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import ACTIONS_PATH, DATA_DIR, TASKS_PATH, get_manager_actions_dir, get_manager_tasks_dir


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_text_atomic(path, json.dumps(payload, indent=2))


def write_text_atomic(path: Path, body: str) -> None:
    """Write text through a same-directory temp file to avoid partial records."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temp_path.write_text(body, encoding="utf-8")
    temp_path.replace(path)


def load_json_list(path: Path) -> list[dict]:
    payload = read_json(path, [])
    return payload if isinstance(payload, list) else []


def save_json_list(path: Path, payload: list[dict]) -> None:
    write_json(path, payload)


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").lower()
    return cleaned or "record"


def load_tasks() -> list[dict]:
    return read_json(TASKS_PATH, [])


def save_tasks(tasks: list[dict]) -> None:
    write_json(TASKS_PATH, tasks)


def load_actions() -> list[dict]:
    return read_json(ACTIONS_PATH, [])


def save_actions(actions: list[dict]) -> None:
    write_json(ACTIONS_PATH, actions)


def timestamp_id(prefix: str) -> str:
    return f"{prefix}-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"


def write_task_note(task: dict, vault_path: str | Path | None = None) -> None:
    """Mirror a dashboard-created task into Obsidian for traceability."""
    manager_tasks_dir = get_manager_tasks_dir(vault_path)
    manager_tasks_dir.mkdir(parents=True, exist_ok=True)
    path = manager_tasks_dir / f"{task['id']}-{slugify(task['title'])}.md"
    write_text_atomic(
        path,
        "\n".join(
            [
                "---",
                f"id: {task['id']}",
                f"status: {task.get('status', 'pending')}",
                f"priority: {task.get('priority', 'medium')}",
                f"owner: {task.get('owner', 'Unassigned')}",
                f"due_date: {task.get('dueDate', '')}",
                "source: Hermes Manager",
                "---",
                "",
                f"# {task['title']}",
                "",
                task.get("summary", "Manual dashboard task."),
                "",
                "## Traceback",
                "",
                "- Created from Hermes Manager UI.",
            ]
        ),
    )


def write_action_note(action: dict, vault_path: str | Path | None = None) -> None:
    """Mirror staged operator actions into Obsidian audit notes."""
    manager_actions_dir = get_manager_actions_dir(vault_path)
    manager_actions_dir.mkdir(parents=True, exist_ok=True)
    path = manager_actions_dir / f"{action['id']}-{slugify(action['kind'])}.md"
    write_text_atomic(
        path,
        "\n".join(
            [
                "---",
                f"id: {action['id']}",
                f"kind: {action.get('kind', '')}",
                f"status: {action.get('status', 'staged')}",
                f"target_id: {action.get('targetId', '')}",
                f"created_at: {action.get('createdAt', '')}",
                "source: Hermes Manager",
                "---",
                "",
                f"# {action.get('title', action.get('kind', 'Action'))}",
                "",
                action.get("detail", "Action staged from Hermes Manager UI."),
                "",
                "## Review",
                "",
                "- Confirm before promoting this into a live Hermes command.",
            ]
        ),
    )
