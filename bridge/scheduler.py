"""Small local scheduler for recurring Hermes Manager report jobs."""

from __future__ import annotations

import threading
import time
from datetime import datetime

from .jobs import execute_recurring_job, load_recurring_jobs
from .storage import save_json_list
from .config import RECURRING_PATH


def start_scheduler(interval_seconds: int = 20) -> threading.Thread:
    """Start the non-blocking scheduler used by the local bridge process."""
    thread = threading.Thread(target=_scheduler_loop, args=(interval_seconds,), daemon=True, name="hermes-manager-scheduler")
    thread.start()
    return thread


def _scheduler_loop(interval_seconds: int) -> None:
    while True:
        now = datetime.now().astimezone().replace(second=0, microsecond=0)
        jobs = load_recurring_jobs()
        for job in jobs:
            if job.get("status") not in {"synced", "scheduled", "running", "completed"}:
                continue
            if not _cron_matches(str(job.get("schedule") or ""), now):
                continue
            schedule_key = f"{job.get('id', 'job')}:{now.isoformat()}"
            if job.get("lastScheduledKey") == schedule_key:
                continue
            job["lastScheduledKey"] = schedule_key
            # Persist the guard before launching Hermes so a slow run cannot
            # be started twice when the scheduler wakes again.
            save_json_list(RECURRING_PATH, jobs[:30])
            execute_recurring_job(str(job.get("id")), now=now)
        time.sleep(max(5, interval_seconds))


def _cron_matches(expression: str, now: datetime) -> bool:
    parts = expression.split()
    if len(parts) != 5:
        return False
    values = (now.minute, now.hour, now.day, now.month, (now.weekday() + 1) % 7)
    return all(_field_matches(field, value) for field, value in zip(parts, values))


def _field_matches(field: str, value: int) -> bool:
    if field == "*":
        return True
    for item in field.split(","):
        if item.startswith("*/"):
            try:
                step = int(item[2:])
                if step > 0 and value % step == 0:
                    return True
            except ValueError:
                continue
        elif "-" in item:
            try:
                start, end = (int(part) for part in item.split("-", 1))
                if start <= value <= end:
                    return True
            except ValueError:
                continue
        else:
            try:
                if int(item) == value:
                    return True
            except ValueError:
                continue
    return False
