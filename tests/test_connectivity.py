"""Development checks for the local Hermes and Obsidian integration."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from bridge.config import DEMO_VAULT, HERMES
from bridge.health import check_health
from bridge.hermes import HermesResult, run_hermes
from bridge.obsidian import load_vault_notes


class LocalIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("HERMES_LIVE_TESTS") == "1", "Set HERMES_LIVE_TESTS=1 for local Hermes checks")
    def test_hermes_cli_is_available(self) -> None:
        result = run_hermes("status", timeout=18)
        self.assertTrue(HERMES.exists(), f"Hermes executable missing: {HERMES}")
        self.assertTrue(result.ok, result.error or result.output)

    @unittest.skipUnless(os.environ.get("HERMES_LIVE_TESTS") == "1", "Set HERMES_LIVE_TESTS=1 for local vault checks")
    def test_demo_vault_has_indexed_notes(self) -> None:
        notes = load_vault_notes()
        self.assertTrue(DEMO_VAULT.is_dir(), f"Demo vault missing: {DEMO_VAULT}")
        self.assertGreater(len(notes), 0, "No Obsidian notes were indexed")

    @unittest.skipUnless(os.environ.get("HERMES_LIVE_TESTS") == "1", "Set HERMES_LIVE_TESTS=1 for local connectivity checks")
    def test_health_reports_gateway_and_model_configuration(self) -> None:
        health = check_health()
        self.assertTrue(health["checks"]["hermesCli"]["ok"], health["checks"]["hermesCli"]["detail"])
        self.assertTrue(health["checks"]["gateway"]["ok"], health["checks"]["gateway"]["detail"])
        self.assertTrue(health["checks"]["vault"]["ok"], health["checks"]["vault"]["detail"])
        self.assertTrue(health["model"])
        self.assertTrue(health["provider"])

    @patch("bridge.health.load_vault_notes", return_value=[])
    @patch("bridge.health.run_hermes")
    def test_health_preserves_independent_failure_states(self, run_hermes_mock, _notes_mock) -> None:
        run_hermes_mock.return_value = HermesResult("hermes status", False, "", "Hermes unavailable")
        health = check_health()
        self.assertFalse(health["ok"])
        self.assertFalse(health["checks"]["hermesCli"]["ok"])
        self.assertFalse(health["checks"]["gateway"]["ok"])
        self.assertFalse(health["checks"]["vault"]["ok"])


if __name__ == "__main__":
    unittest.main()
