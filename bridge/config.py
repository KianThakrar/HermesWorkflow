"""Configuration constants for the local bridge."""

from __future__ import annotations

import os
import shutil
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_local_env() -> None:
    """Load a small, dependency-free local .env file when present."""
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value)


_load_local_env()

DATA_DIR = ROOT / "data"
TASKS_PATH = DATA_DIR / "tasks.json"
OVERRIDES_PATH = DATA_DIR / "card-overrides.json"
ACTIONS_PATH = DATA_DIR / "actions.json"
RUNS_PATH = DATA_DIR / "runs.json"
RECURRING_PATH = DATA_DIR / "recurring-jobs.json"
PROMPTS_PATH = DATA_DIR / "prompt-presets.json"
REPORTS_PATH = DATA_DIR / "reports.json"


def _default_hermes_path() -> Path:
    """Prefer an installed CLI without embedding a developer-specific path."""
    installed = shutil.which("hermes")
    return Path(installed) if installed else Path.home() / ".local" / "bin" / "hermes"


DEFAULT_HERMES = _default_hermes_path()
DEFAULT_VAULT = ROOT / "Vault"


def _coerce_path(value: str | Path | None, fallback: Path) -> Path:
    if value is None or str(value).strip() == "":
        return fallback.expanduser()
    return Path(value).expanduser()


def _path_from_env(names: tuple[str, ...], fallback: Path) -> Path:
    for name in names:
        value = os.environ.get(name)
        if value:
            return _coerce_path(value, fallback)
    return fallback.expanduser()


def get_vault_path(vault_path: str | Path | None = None) -> Path:
    """Return the active vault path, allowing tests and packaged apps to inject one."""
    if vault_path is not None:
        return _coerce_path(vault_path, DEFAULT_VAULT)
    return _path_from_env(("HERMES_DEAL_DESK_VAULT", "HERMES_VAULT_PATH"), DEFAULT_VAULT)


def get_manager_dir(vault_path: str | Path | None = None) -> Path:
    return get_vault_path(vault_path) / "Hermes Manager"


def get_manager_tasks_dir(vault_path: str | Path | None = None) -> Path:
    return get_manager_dir(vault_path) / "Tasks"


def get_manager_actions_dir(vault_path: str | Path | None = None) -> Path:
    return get_manager_dir(vault_path) / "Actions"


def get_briefings_dir(vault_path: str | Path | None = None) -> Path:
    return get_vault_path(vault_path) / "Briefings"


HERMES = _path_from_env(("HERMES_CLI_PATH", "HERMES_DEAL_DESK_HERMES", "HERMES_PATH"), DEFAULT_HERMES)
DEMO_VAULT = get_vault_path()
MANAGER_DIR = get_manager_dir()
MANAGER_TASKS_DIR = get_manager_tasks_dir()
MANAGER_ACTIONS_DIR = get_manager_actions_dir()
BRIEFINGS_DIR = get_briefings_dir()

TODAY = date.today()
VALID_CARD_STATUSES = {"pending", "active", "completed"}
