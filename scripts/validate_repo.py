#!/usr/bin/env python3
"""Fail CI when public source crosses the local-data boundary."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {"", ".css", ".html", ".js", ".json", ".md", ".py", ".toml", ".txt", ".yml", ".yaml"}
FORBIDDEN_FRAGMENTS = (
    "/" + "Users/",
    "/" + "home/",
    ":\\" + "Users\\",
    "file" + "://",
    "BEGIN " + "RSA PRIVATE KEY",
    "BEGIN " + "OPENSSH PRIVATE KEY",
    "BEGIN " + "EC PRIVATE KEY",
)


def tracked_files() -> list[Path]:
    completed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / item.decode("utf-8") for item in completed.stdout.split(b"\0") if item]


def validate() -> list[str]:
    errors: list[str] = []
    files = tracked_files()
    relative_files = {path.relative_to(ROOT).as_posix() for path in files}

    if ".env" in relative_files:
        errors.append(".env must never be tracked")
    for relative in sorted(relative_files):
        if relative.startswith("data/") and relative.endswith(".json") and not relative.endswith(".example.json"):
            errors.append(f"runtime JSON must not be tracked: {relative}")

    for path in files:
        if path.suffix.lower() not in TEXT_SUFFIXES or not path.is_file():
            continue
        try:
            body = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for fragment in FORBIDDEN_FRAGMENTS:
            if fragment in body:
                errors.append(f"forbidden public-source fragment {fragment!r}: {path.relative_to(ROOT)}")

    try:
        json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"vercel.json is invalid: {exc}")

    return errors


if __name__ == "__main__":
    failures = validate()
    if failures:
        for failure in failures:
            print(f"ERROR: {failure}", file=sys.stderr)
        raise SystemExit(1)
    print("Repository boundary checks passed.")
