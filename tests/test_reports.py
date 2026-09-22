"""Focused tests for local report persistence and API wiring."""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from bridge import reports
from bridge.http_server import save_report
from bridge.hermes import _parse_cron_blocks
from bridge.jobs import execute_recurring_job, save_recurring_job
from bridge.obsidian import load_vault_notes, vault_cards


class ReportPersistenceTests(unittest.TestCase):
    def test_persist_report_is_idempotent_and_writes_briefing_note(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            vault = temp / "Vault"
            reports_path = temp / "reports.json"

            with patch("bridge.reports.REPORTS_PATH", reports_path):
                first = reports.persist_report(
                    {
                        "title": "Daily Deal Briefing",
                        "body": "## Urgent actions\n- Review cash shortfall.",
                        "idempotencyKey": "daily:2026-09-16",
                    },
                    vault_path=vault,
                )
                second = reports.persist_report(
                    {
                        "title": "Daily Deal Briefing",
                        "body": "## Urgent actions\n- Review cash shortfall.\n- Confirm owner.",
                        "idempotencyKey": "daily:2026-09-16",
                    },
                    vault_path=vault,
                )

                self.assertEqual(first["id"], second["id"])
                self.assertEqual(len(reports.load_reports()), 1)
                note_path = vault / second["path"]
                self.assertTrue(note_path.exists())
                self.assertIn("Confirm owner", note_path.read_text(encoding="utf-8"))
                self.assertIn("idempotencyKey", note_path.read_text(encoding="utf-8"))

                detail = reports.get_report(second["id"], vault_path=vault)
                self.assertIsNotNone(detail)
                self.assertIn("Daily Deal Briefing", detail["markdown"])
                self.assertNotIn("absolutePath", detail)
                self.assertNotIn("vaultPath", detail)
                self.assertIn("vault=Vault", detail["obsidianHref"])

                download = reports.get_report_download(second["id"], vault_path=vault)
                self.assertIsNotNone(download)
                filename, markdown = download
                self.assertTrue(filename.endswith(".md"))
                self.assertIn("Confirm owner", markdown)

    def test_report_reader_rejects_paths_outside_briefings(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            vault = Path(temp_dir) / "Vault"
            outside = Path(temp_dir) / "secret.md"
            outside.write_text("do not read", encoding="utf-8")
            reports_path = Path(temp_dir) / "reports.json"
            reports_path.write_text(json.dumps([{"id": "report-unsafe", "path": "../secret.md"}]), encoding="utf-8")
            with patch("bridge.reports.REPORTS_PATH", reports_path):
                self.assertIsNone(reports.get_report("report-unsafe", vault))


class FixtureVaultTests(unittest.TestCase):
    def test_fixture_vault_indexes_synthetic_email_set(self) -> None:
        fixture_vault = Path(__file__).parent / "fixtures" / "email_vault"
        with patch("bridge.obsidian.DEMO_VAULT", fixture_vault), patch("bridge.obsidian.TRIAGE_PATH", fixture_vault / "Briefings" / "2026-09-07-Triage.md"):
            notes = load_vault_notes()
            cards = vault_cards({})
        self.assertEqual({note["id"] for note in notes}, {"E101", "E102", "E103", "E104"})
        self.assertEqual(len(cards), 4)
        self.assertEqual(next(card for card in cards if card["id"] == "vault-E102")["priority"], "critical")


class HermesOutputTests(unittest.TestCase):
    def test_cron_box_output_is_one_job(self) -> None:
        output = """
  ff83c15a6972 [paused]
    Name:      Demo Daily Email Briefing
    Schedule:  0 9 * * 1-5
    Deliver:   local
"""
        jobs = _parse_cron_blocks(output)
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["id"], "ff83c15a6972")
        self.assertEqual(jobs[0]["name"], "Demo Daily Email Briefing")


class ReportApiTests(unittest.TestCase):
    def test_report_api_helpers_cover_list_detail_and_download_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            vault = temp / "Vault"
            reports_path = temp / "reports.json"

            with patch("bridge.reports.REPORTS_PATH", reports_path), patch("bridge.http_server.build_state", return_value={"reports": []}):
                created = save_report({
                    "title": "LP Follow-up Briefing",
                    "body": "## Follow-ups\n- Send LP update.",
                    "idempotencyKey": "lp:briefing",
                }, vault_path=vault)
                report_id = created["reportId"]
                listing = reports.list_reports(vault)
                self.assertEqual([item["id"] for item in listing], [report_id])
                detail = reports.get_report(report_id, vault)
                self.assertEqual(detail["id"], report_id)
                self.assertIn("LP Follow-up Briefing", detail["markdown"])
                filename, markdown = reports.get_report_download(report_id, vault)
                self.assertTrue(filename.endswith(".md"))
                self.assertIn("Send LP update", markdown)


class RecurringReportTests(unittest.TestCase):
    def test_execute_recurring_job_starts_report_run_with_stable_period_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            recurring_path = temp / "recurring.json"
            vault = temp / "Vault"

            with patch("bridge.jobs.RECURRING_PATH", recurring_path), patch("bridge.jobs.run_hermes") as run_hermes_mock:
                run_hermes_mock.return_value.ok = False
                run_hermes_mock.return_value.output = ""
                run_hermes_mock.return_value.error = "cron unavailable in test"
                job, _result = save_recurring_job(
                    {
                        "name": "Daily Briefing",
                        "prompt": "Summarize today's PE email priorities.",
                        "reportConfig": {"kind": "briefing", "title": "Daily Briefing"},
                    },
                    vault_path=vault,
                )

                with patch("bridge.jobs.start_run") as start_run_mock:
                    start_run_mock.return_value = {"id": "run-123", "startedAt": "2026-09-16T09:00:00Z"}
                    updated, result = execute_recurring_job(job["id"], now=date(2026, 9, 16), vault_path=vault)

                self.assertTrue(result["ok"])
                self.assertEqual(updated["lastRunId"], "run-123")
                _, kwargs = start_run_mock.call_args
                self.assertEqual(kwargs["kind"], "recurring-report")
                self.assertEqual(kwargs["vault_path"], vault)
                self.assertEqual(
                    kwargs["metadata"]["report"]["idempotencyKey"],
                    f"recurring:{job['id']}:2026-09-16",
                )

if __name__ == "__main__":
    unittest.main()
