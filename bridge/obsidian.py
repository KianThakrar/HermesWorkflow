"""Obsidian vault readers and card normalization."""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .config import DEMO_VAULT, TODAY
from .storage import read_json


TRIAGE_PATH = DEMO_VAULT / "Briefings" / "2026-09-07-Triage.md"


def load_vault_notes() -> list[dict[str, Any]]:
    """Return inbox notes with Markdown bodies for previews and trace links."""
    index_path = DEMO_VAULT / "Inbox" / "index.json"
    items = read_json(index_path, [])
    if not isinstance(items, list):
        return []

    notes: list[dict[str, Any]] = []
    for item in items:
        note_path = _resolve_vault_path(item.get("file", ""))
        body = _read_text(note_path)
        notes.append(
            {
                "id": item.get("id", note_path.stem),
                "title": item.get("subject") or note_path.stem,
                "thread": item.get("thread", "Inbox"),
                "sender": _sender_name(item.get("sender", "")),
                "date": item.get("date", ""),
                "path": _relative_to_vault(note_path),
                "obsidianHref": _obsidian_href(note_path) if note_path.exists() else "",
                "body": body,
                "preview": item.get("preview", ""),
            }
        )
    return notes


def vault_cards(overrides: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert vault inbox notes into PE workflow cards."""
    triage = _load_triage_priorities()
    cards: list[dict[str, Any]] = []

    for note in load_vault_notes():
        card_id = f"vault-{note['id']}"
        override = overrides.get(card_id, {})
        body = note.get("body", "")
        priority = _normalize_priority(override.get("priority") or triage.get(note["id"]) or _classify_priority(note, body))
        status = override.get("status") or _classify_status(priority, body)
        due_date = override.get("dueDate") or _extract_due_date(body, note.get("date", ""))
        labels = _labels_for(note, body)
        thread = note.get("thread", "Inbox")

        cards.append(
            {
                "id": card_id,
                "title": note.get("title") or thread,
                "company": _company_from_thread(thread),
                "sender": note.get("sender") or "Obsidian",
                "sourceType": "vault",
                "status": status,
                "priority": priority,
                "owner": _owner_for(labels, priority),
                "dueDate": due_date,
                "summary": note.get("preview") or _first_body_sentence(body),
                "nextAction": _next_action_for(priority, labels, body),
                "labels": labels,
                "source": note.get("path"),
                "sourcePath": note.get("path"),
                "sourceHref": note.get("obsidianHref"),
                "thread": thread,
            }
        )

    return cards


def _load_triage_priorities() -> dict[str, str]:
    body = _read_text(TRIAGE_PATH)
    priorities: dict[str, str] = {}
    for line in body.splitlines():
        match = re.match(r"\|\s*(E\d{3})\s*\|[^|]*\|\s*([^|]+?)\s*\|", line)
        if match:
            priorities[match.group(1)] = match.group(2).strip().lower()
    return priorities


def _classify_priority(note: dict[str, Any], body: str) -> str:
    text = f"{note.get('title', '')} {note.get('preview', '')} {body}".lower()
    if any(term in text for term in ["shortfall", "payroll", "urgent", "today", "critical"]):
        return "critical"
    if any(term in text for term in ["deadline", "investor meeting", "offer", "retention"]):
        return "high"
    if any(term in text for term in ["opportunity", "ebitda", "recurring revenue", "cash", "compliance"]):
        return "medium"
    return "low"


def _classify_status(priority: str, body: str) -> str:
    text = body.lower()
    if "excluded" in text or priority == "low" and "no response is required" in text:
        return "completed"
    if priority in {"critical", "high"}:
        return "active"
    return "pending"


def _extract_due_date(body: str, fallback_date: str) -> str:
    text = body.lower()
    date_map = {
        "monday 7 september": "2026-09-07",
        "tuesday 8 september": "2026-09-08",
        "wednesday 9 september": "2026-09-09",
    }
    for phrase, value in date_map.items():
        if phrase in text:
            return value
    if fallback_date:
        return fallback_date[:10]
    return TODAY.isoformat()


def _labels_for(note: dict[str, Any], body: str) -> list[str]:
    text = f"{note.get('title', '')} {note.get('thread', '')} {body}".lower()
    labels = [f"Thread: {note.get('thread', 'Inbox')}"]

    if "lp" in text or "investor" in text:
        labels.append("Relationship: LP")
    elif "founder" in text or "management" in text:
        labels.append("Relationship: Management")
    elif "adviser" in text or "sale" in text:
        labels.append("Relationship: Banker")
    else:
        labels.append("Relationship: Internal")

    if "indicative offer" in text or "loi" in text:
        labels.append("Stage: IC Prep")
    elif "diligence" in text or "retention" in text:
        labels.append("Stage: Diligence")
    elif "opportunity" in text or "introduction" in text:
        labels.append("Stage: Screening")
    elif "portfolio" in text or "trading" in text:
        labels.append("Stage: Portfolio")
    else:
        labels.append("Stage: Review")

    if "cash" in text or "finance" in text or "ebitda" in text:
        labels.append("Workstream: Financials")
    elif "compliance" in text or "legal" in text:
        labels.append("Workstream: Legal")
    elif "retention" in text or "customer" in text:
        labels.append("Workstream: Commercial")
    else:
        labels.append("Workstream: Triage")

    return labels


def _next_action_for(priority: str, labels: list[str], body: str) -> str:
    text = body.lower()
    if "no response is required" in text:
        return "Log as reviewed; no operator response required."
    if "shortfall" in text or "forecast" in text:
        return "Confirm owner, review cash forecast and escalate any funding risk."
    if "indicative offer" in text or "retention" in text:
        return "Check latest diligence evidence before moving toward IC materials."
    if "introductory call" in text or "opportunity" in text:
        return "Decide whether the opportunity fits mandate before scheduling."
    if priority in {"critical", "high"}:
        return "Assign an owner and confirm the next human response."
    if any("Portfolio" in label for label in labels):
        return "Track portfolio follow-up and unresolved diligence questions."
    return "Review and decide whether this should stay on the active desk."


def _owner_for(labels: list[str], priority: str) -> str:
    joined = " ".join(labels)
    if "LP" in joined:
        return "IR"
    if priority == "critical":
        return "Partner"
    if "Financials" in joined:
        return "VP"
    if "Screening" in joined:
        return "Associate"
    return "Principal"


def _company_from_thread(thread: str) -> str:
    return thread.replace("-", " ").title()


def _first_body_sentence(body: str) -> str:
    cleaned = re.sub(r"^#.*$", "", body, flags=re.MULTILINE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:220] or "Obsidian inbox item."


def _sender_name(sender: str) -> str:
    return sender.split("<", 1)[0].strip() or sender or "Unknown"


def _resolve_vault_path(file_value: str) -> Path:
    if not file_value:
        return DEMO_VAULT
    raw = Path(file_value)
    if raw.is_absolute():
        return raw
    parts = raw.parts
    if parts and parts[0] == "Vault":
        raw = Path(*parts[1:])
    return DEMO_VAULT / raw


def _relative_to_vault(path: Path) -> str:
    try:
        return str(path.relative_to(DEMO_VAULT))
    except ValueError:
        return str(path)


def _obsidian_href(path: Path) -> str:
    """Open a note by vault name and relative path, never by an absolute path."""
    relative = _relative_to_vault(path)
    return f"obsidian://open?vault={quote(DEMO_VAULT.name, safe='')}&file={quote(relative, safe='')}"


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _normalize_priority(value: str) -> str:
    lowered = str(value).strip().lower()
    return lowered if lowered in {"critical", "high", "medium", "low"} else "medium"
