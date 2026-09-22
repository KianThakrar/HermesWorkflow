"""Persistence for operator-owned prompt presets."""

from __future__ import annotations

from typing import Any

from .config import PROMPTS_PATH
from .storage import load_json_list, save_json_list, timestamp_id


DEFAULT_PROMPTS = [
    {"id": "recent-email-summary", "name": "Recent email summary", "prompt": "Give me a concise summary of my recent emails.", "favorite": True, "usageCount": 0},
    {"id": "kanban-next-actions", "name": "Kanban next actions", "prompt": "Which Kanban items need doing next, and what is the owner and due date for each?", "favorite": False, "usageCount": 0},
    {"id": "lp-follow-ups", "name": "LP follow-ups", "prompt": "Prepare my LP and relationship follow-ups from the latest email notes.", "favorite": False, "usageCount": 0},
]


def load_prompt_presets() -> list[dict[str, Any]]:
    presets = load_json_list(PROMPTS_PATH)
    return presets or [dict(prompt) for prompt in DEFAULT_PROMPTS]


def save_prompt_presets(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize and persist a small local library of operator prompts."""
    raw_presets = payload.get("presets") if isinstance(payload, dict) else []
    if not isinstance(raw_presets, list):
        raw_presets = []
    presets = []
    for item in raw_presets[:40]:
        if not isinstance(item, dict) or not str(item.get("prompt") or "").strip():
            continue
        presets.append(
            {
                "id": str(item.get("id") or timestamp_id("prompt")),
                "name": str(item.get("name") or "Untitled prompt").strip()[:80],
                "prompt": str(item.get("prompt") or "").strip()[:2000],
                "favorite": bool(item.get("favorite")),
                "usageCount": max(0, int(item.get("usageCount") or 0)),
                "lastUsedAt": str(item.get("lastUsedAt") or ""),
            }
        )
    save_json_list(PROMPTS_PATH, presets)
    return presets
