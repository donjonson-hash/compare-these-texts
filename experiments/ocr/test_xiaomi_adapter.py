import argparse
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("xiaomi_adapter", Path(__file__).with_name("benchmark-xiaomi.py"))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class AdapterTests(unittest.TestCase):
    def test_only_literal_loopback_allowed(self):
        self.assertEqual(adapter.endpoint("http://127.0.0.1:8080/v1/"), "http://127.0.0.1:8080/v1")
        self.assertEqual(adapter.endpoint("http://[::1]:8080/v1"), "http://[::1]:8080/v1")
        for url in ["http://example.com/v1", "http://127.0.0.1.example.com/v1", "http://0.0.0.0/v1",
                    "http://127.0.0.1@external.test/v1", "http://user:secret@127.0.0.1/v1", "file:///v1",
                    "http://127.0.0.1/v1?destination=external", "http://127.0.0.1:bad/v1"]:
            with self.subTest(url=url), self.assertRaises(argparse.ArgumentTypeError):
                adapter.endpoint(url)

    def test_truncated_result_not_success(self):
        result = adapter.parse_response({"choices": [{"finish_reason": "length", "message": {"content": "partial"}}]})
        self.assertEqual(result["status"], "truncated")
        self.assertEqual(result["text"], "partial")

    def test_stop_result_keeps_exact_text(self):
        result = adapter.parse_response({"choices": [{"finish_reason": "stop", "message": {"content": "Сумма 1 000.00\n"}}]})
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["text"], "Сумма 1 000.00\n")

    def test_missing_content_rejected(self):
        with self.assertRaises(ValueError):
            adapter.parse_response({"choices": [{"finish_reason": "stop", "message": {"content": None}}]})

    def test_unknown_finish_not_success(self):
        result = adapter.parse_response({"choices": [{"finish_reason": "tool_calls", "message": {"content": ""}}]})
        self.assertEqual(result["status"], "error")

    def test_redirect_refused(self):
        with self.assertRaises(ValueError):
            adapter.NoRedirect().redirect_request(None, None, 302, None, None, "https://example.com")


if __name__ == "__main__":
    unittest.main()
