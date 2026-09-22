"""Explicit connectivity checks for local development and diagnostics."""

from __future__ import annotations

from typing import Any

from .config import DEMO_VAULT, HERMES
from .hermes import parse_status, run_hermes
from .obsidian import load_vault_notes


def check_health() -> dict[str, Any]:
    """Report each local dependency independently so failures are actionable."""
    cli = run_hermes("status", timeout=18)
    status = parse_status(cli.output) if cli.output else {}
    vault_exists = DEMO_VAULT.exists() and DEMO_VAULT.is_dir()
    notes = load_vault_notes() if vault_exists else []
    gateway_ok = bool(status.get("gatewayRunning"))
    checks = {
        "bridge": {"ok": True, "detail": "HTTP bridge is responding."},
        "hermesCli": {
            "ok": cli.ok,
            "detail": "Hermes CLI is available." if cli.ok else "Hermes CLI is unavailable. Configure HERMES_CLI_PATH.",
        },
        "gateway": {"ok": gateway_ok, "detail": "Hermes gateway running." if gateway_ok else "Hermes gateway is not running."},
        "vault": {
            "ok": vault_exists and bool(notes),
            "detail": f"{len(notes)} Obsidian notes available." if vault_exists else "Configured Obsidian vault was not found.",
        },
    }
    return {
        "ok": all(item["ok"] for item in checks.values()),
        "checks": checks,
        "hermesCommand": HERMES.name,
        "vaultName": DEMO_VAULT.name,
        "model": status.get("model", "Configured default"),
        "provider": status.get("provider", "Configured provider"),
    }
