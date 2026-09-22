"""Report persistence for local Hermes briefings."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .config import REPORTS_PATH, get_briefings_dir, get_vault_path
from .storage import load_json_list, slugify, timestamp_id, write_json, write_text_atomic


MAX_PREVIEW_CHARS = 260


def load_reports() -> list[dict[str, Any]]:
    """Return persisted report records, newest first."""
    reports = load_json_list(REPORTS_PATH)
    return sorted(reports, key=lambda item: item.get("updatedAt") or item.get("createdAt") or "", reverse=True)


def list_reports(vault_path: str | Path | None = None) -> list[dict[str, Any]]:
    """Return list records with enough metadata for a report index view."""
    public: list[dict[str, Any]] = []
    for record in load_reports():
        try:
            public.append(_public_record(record, vault_path))
        except ValueError:
            # Ignore stale or foreign-vault records rather than exposing a path.
            continue
    return public


def get_report(report_id: str, vault_path: str | Path | None = None) -> dict[str, Any] | None:
    """Return a report record with Markdown content loaded from the vault."""
    record = _find_report(str(report_id))
    if not record:
        return None
    try:
        path = _report_path(record, vault_path)
    except ValueError:
        return None
    if not path.exists():
        return None
    markdown = _read_text(path)
    public = _public_record(record, vault_path)
    public["markdown"] = markdown
    public["body"] = _body_from_markdown(markdown)
    return public


def get_report_download(report_id: str, vault_path: str | Path | None = None) -> tuple[str, str] | None:
    """Return a safe filename and Markdown payload for API downloads."""
    report = get_report(report_id, vault_path)
    if not report:
        return None
    filename = Path(str(report.get("path") or f"{report_id}.md")).name
    return filename, str(report.get("markdown") or "")


def persist_report(payload: dict[str, Any], vault_path: str | Path | None = None) -> dict[str, Any]:
    """Persist one report into the vault Briefings folder and local index.

    Idempotency is based on ``idempotencyKey`` when supplied. Reusing the same key
    updates the same Markdown file and JSON record rather than creating duplicates.
    """
    reports = load_reports()
    kind = _clean_slug(payload.get("kind") or "briefing")
    title = _clean_title(payload.get("title") or "Hermes Briefing")
    body = _clean_body(payload.get("body") or payload.get("content") or payload.get("markdown") or "")
    now = _utc_timestamp()
    idempotency_key = str(payload.get("idempotencyKey") or payload.get("idempotency_key") or "").strip()
    existing = _find_existing(reports, payload.get("id"), idempotency_key)
    report_id = str(existing.get("id") if existing else payload.get("id") or timestamp_id("report"))
    if not idempotency_key:
        idempotency_key = report_id

    created_at = str(existing.get("createdAt") or payload.get("createdAt") or now)
    source_run_id = str(payload.get("sourceRunId") or payload.get("source_run_id") or existing.get("sourceRunId") or "")
    metadata = _clean_metadata(payload.get("metadata") or existing.get("metadata") or {})
    source_ids = _source_ids(payload.get("sourceIds") or metadata.get("sourceIds") or body)
    metadata.setdefault("sourceIds", source_ids)
    markdown = _render_markdown(
        {
            "id": report_id,
            "kind": kind,
            "title": title,
            "idempotencyKey": idempotency_key,
            "sourceRunId": source_run_id,
            "createdAt": created_at,
            "updatedAt": now,
        },
        body,
        metadata,
    )

    note_path = _safe_report_path(existing, report_id, title, created_at, vault_path)
    write_text_atomic(note_path, markdown)
    vault = get_vault_path(vault_path)
    relative_path = _relative_to_vault(note_path, vault)
    record = {
        "id": report_id,
        "kind": kind,
        "title": title,
        "status": "ready",
        "summary": str(payload.get("summary") or _preview(body)).strip(),
        "idempotencyKey": idempotency_key,
        "sourceRunId": source_run_id,
        "path": relative_path,
        "vaultName": vault.name,
        "createdAt": created_at,
        "updatedAt": now,
        "contentHash": _hash(markdown),
        "metadata": metadata,
        "jobId": str(metadata.get("recurringJobId") or metadata.get("jobId") or ""),
        "model": str(metadata.get("model") or ""),
        "provider": str(metadata.get("provider") or ""),
        "sourceIds": source_ids,
    }

    updated = [record if item.get("id") == report_id else item for item in reports]
    if not any(item.get("id") == report_id for item in updated):
        updated.insert(0, record)
    write_json(REPORTS_PATH, updated[:100])
    return _public_record(record, vault_path) | {"markdown": markdown, "body": body}


def persist_run_report(
    run: dict[str, Any],
    output: str,
    vault_path: str | Path | None = None,
) -> dict[str, Any] | None:
    """Persist a completed Hermes run when its metadata asks for a report."""
    metadata = run.get("metadata") if isinstance(run.get("metadata"), dict) else {}
    report_config = metadata.get("report") if isinstance(metadata.get("report"), dict) else None
    if not report_config or not output.strip():
        return None

    payload = {
        "kind": report_config.get("kind") or "briefing",
        "title": report_config.get("title") or run.get("title") or "Hermes Briefing",
        "body": output,
        "summary": report_config.get("summary") or _preview(output),
        "idempotencyKey": report_config.get("idempotencyKey") or run.get("id"),
        "sourceRunId": run.get("id", ""),
        "metadata": {**metadata, "runKind": run.get("kind", "")},
    }
    return persist_report(payload, vault_path=vault_path or run.get("vaultPath"))


def _find_report(report_id: str) -> dict[str, Any] | None:
    return next((record for record in load_reports() if str(record.get("id")) == report_id), None)


def _find_existing(reports: list[dict[str, Any]], report_id: Any, idempotency_key: str) -> dict[str, Any]:
    if report_id:
        found = next((record for record in reports if str(record.get("id")) == str(report_id)), None)
        if found:
            return found
    if idempotency_key:
        found = next((record for record in reports if record.get("idempotencyKey") == idempotency_key), None)
        if found:
            return found
    return {}


def _public_record(record: dict[str, Any], vault_path: str | Path | None = None) -> dict[str, Any]:
    path = _report_path(record, vault_path)
    exists = path.exists()
    public = dict(record)
    vault = get_vault_path(vault_path)
    relative = _relative_to_vault(path, vault)
    public.pop("absolutePath", None)
    public.pop("vaultPath", None)
    public["vaultName"] = vault.name
    public["obsidianHref"] = (
        f"obsidian://open?vault={quote(vault.name, safe='')}&file={quote(relative, safe='')}"
        if exists else ""
    )
    public["exists"] = exists
    public["downloadUrl"] = f"/api/reports/{record.get('id')}/download"
    return public


def _safe_report_path(
    existing: dict[str, Any],
    report_id: str,
    title: str,
    created_at: str,
    vault_path: str | Path | None,
) -> Path:
    briefings_dir = get_briefings_dir(vault_path).resolve()
    if existing.get("path"):
        candidate = (get_vault_path(vault_path) / str(existing["path"])).resolve()
    else:
        day = _date_part(created_at)
        filename = f"{day}-{slugify(title)}-{slugify(report_id)}.md"
        candidate = (briefings_dir / filename).resolve()
    if candidate != briefings_dir and briefings_dir not in candidate.parents:
        raise ValueError("Report path must stay inside the vault Briefings folder.")
    return candidate


def _report_path(record: dict[str, Any], vault_path: str | Path | None = None) -> Path:
    vault = get_vault_path(vault_path)
    stored_vault = str(record.get("vaultPath") or "").strip()
    if stored_vault and Path(stored_vault).expanduser().resolve() != vault.resolve():
        raise ValueError("Report belongs to a different configured vault.")
    relative = str(record.get("path") or "").strip()
    if relative:
        candidate = (vault / relative).resolve()
    else:
        absolute = str(record.get("absolutePath") or "").strip()
        candidate = Path(absolute).expanduser().resolve() if absolute else (get_briefings_dir(vault_path) / f"{record.get('id', 'report')}.md").resolve()
    briefings_dir = get_briefings_dir(vault_path).resolve()
    if candidate != briefings_dir and briefings_dir not in candidate.parents:
        raise ValueError("Report path must stay inside the vault Briefings folder.")
    return candidate


def _render_markdown(frontmatter: dict[str, str], body: str, metadata: dict[str, Any] | None = None) -> str:
    lines = ["---"]
    for key, value in frontmatter.items():
        lines.append(f"{key}: {json.dumps(str(value))}")
    metadata = metadata or {}
    for key in ("jobId", "model", "provider"):
        if metadata.get(key):
            lines.append(f"{key}: {json.dumps(str(metadata[key]))}")
    source_ids = metadata.get("sourceIds")
    if isinstance(source_ids, list) and source_ids:
        lines.append(f"source_ids: [{', '.join(json.dumps(str(item)) for item in source_ids)}]")
    lines.extend(["source: \"Hermes Manager\"", "tags: [hermes, briefing]", "---", ""])
    if not re.match(r"^\s*#\s+", body):
        lines.extend([f"# {frontmatter['title']}", ""])
    lines.append(body.strip() or "_No report content was returned._")
    lines.append("")
    return "\n".join(lines)


def _body_from_markdown(markdown: str) -> str:
    if markdown.startswith("---"):
        _, _, remainder = markdown.partition("---\n")
        _, _, body = remainder.partition("---\n")
        return body.strip()
    return markdown.strip()


def _clean_title(value: Any) -> str:
    title = re.sub(r"\s+", " ", str(value or "Hermes Briefing")).strip()
    return title[:120] or "Hermes Briefing"


def _clean_body(value: Any) -> str:
    return str(value or "").replace("\r\n", "\n").strip()


def _clean_slug(value: Any) -> str:
    slug = slugify(str(value or "briefing"))
    return slug[:64] or "briefing"


def _clean_metadata(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for key, item in value.items():
        if isinstance(item, (str, int, float, bool)) or item is None:
            cleaned[str(key)] = item
        elif isinstance(item, (list, tuple)):
            cleaned[str(key)] = [str(child) for child in item[:20]]
        elif isinstance(item, dict):
            cleaned[str(key)] = {str(child_key): str(child_value) for child_key, child_value in list(item.items())[:20]}
        else:
            cleaned[str(key)] = str(item)
    return cleaned


def _preview(body: str) -> str:
    compact = re.sub(r"\s+", " ", str(body or "")).strip()
    return compact[:MAX_PREVIEW_CHARS]


def _source_ids(value: Any) -> list[str]:
    """Extract stable synthetic email IDs without trusting model-provided HTML."""
    if isinstance(value, (list, tuple)):
        values = [str(item).strip() for item in value]
    else:
        values = re.findall(r"\bE\d{3}\b", str(value or ""))
    return list(dict.fromkeys(item for item in values if re.fullmatch(r"E\d{3}", item)))[:50]


def _hash(markdown: str) -> str:
    return hashlib.sha256(markdown.encode("utf-8")).hexdigest()


def _date_part(timestamp: str) -> str:
    match = re.match(r"\d{4}-\d{2}-\d{2}", timestamp)
    return match.group(0) if match else datetime.utcnow().date().isoformat()


def _relative_to_vault(path: Path, vault: Path) -> str:
    try:
        return str(path.relative_to(vault.resolve()))
    except ValueError:
        return str(path)


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _utc_timestamp() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
