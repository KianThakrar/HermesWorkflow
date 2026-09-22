"""Security-boundary checks for hosted UI to local bridge requests."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from bridge.http_server import _origin_allowed


class OriginPolicyTests(unittest.TestCase):
    def test_loopback_origins_are_allowed(self) -> None:
        self.assertTrue(_origin_allowed("http://127.0.0.1:4174"))
        self.assertTrue(_origin_allowed("http://localhost:4174"))

    def test_unknown_public_origin_is_denied(self) -> None:
        with patch.dict(os.environ, {"HERMES_MANAGER_ALLOWED_ORIGINS": ""}, clear=False):
            self.assertFalse(_origin_allowed("https://example.com"))

    def test_configured_origin_and_preview_pattern_are_allowed(self) -> None:
        allowed = "https://hermes.example.com,https://hermes-workflow-*.vercel.app"
        with patch.dict(os.environ, {"HERMES_MANAGER_ALLOWED_ORIGINS": allowed}, clear=False):
            self.assertTrue(_origin_allowed("https://hermes.example.com"))
            self.assertTrue(_origin_allowed("https://hermes-workflow-git-main.vercel.app"))
            self.assertFalse(_origin_allowed("https://unrelated.vercel.app"))


if __name__ == "__main__":
    unittest.main()
