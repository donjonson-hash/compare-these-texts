"""Run with: python3 -m unittest discover -s experiments/ocr -p 'test_*.py'."""

import json
import unittest

from metrics import evaluate, levenshtein, normalize


class OCRMetricsTest(unittest.TestCase):
    def test_known_edit_operations(self):
        self.assertEqual(levenshtein("kitten", "sitting"), 3)
        self.assertEqual(levenshtein("abc", "axbc"), 1)
        self.assertEqual(levenshtein("abc", "ac"), 1)
        self.assertEqual(levenshtein("abc", "axc"), 1)
        self.assertEqual(levenshtein("", "abcd"), 4)

    def test_word_and_character_denominators(self):
        result = evaluate("one two", "one too three")
        self.assertEqual(result["word_edits"], 2)
        self.assertEqual(result["wer"], 1.0)
        self.assertEqual(result["reference_characters"], 7)
        self.assertAlmostEqual(result["cer"], result["character_edits"] / 7)

    def test_empty_reference_is_explicit(self):
        empty = evaluate(" \n", "")
        self.assertEqual((empty["cer"], empty["wer"]), (0.0, 0.0))
        inserted = evaluate("", "abc def")
        self.assertIsNone(inserted["cer"])
        self.assertIsNone(inserted["wer"])
        self.assertEqual(inserted["character_edits"], 7)
        self.assertEqual(inserted["word_edits"], 2)
        self.assertEqual(evaluate("abc", "")["cer"], 1.0)
        json.dumps(inserted, allow_nan=False)

    def test_insertions_can_exceed_one(self):
        self.assertEqual(evaluate("a", "abcd")["cer"], 3.0)

    def test_cyrillic_and_normalization(self):
        self.assertEqual(normalize(" е\u0308ж\n\t идёт\u00a0домой "), "ёж идёт домой")
        self.assertTrue(evaluate("ёж\nидёт", "е\u0308ж идёт")["exact_match"])
        self.assertEqual(evaluate("сумма", "суммa")["character_edits"], 1)
        self.assertEqual(evaluate("Ёж", "ёж")["character_edits"], 1)

    def test_duplicate_numbers_use_multisets(self):
        result = evaluate("10 10 20", "10 20 20 30")
        self.assertEqual(result["matched_numeric_tokens"], 2)
        self.assertEqual(result["numeric_precision"], 0.5)
        self.assertAlmostEqual(result["numeric_recall"], 2 / 3)

    def test_numeric_literals_preserve_sign_and_separators(self):
        result = evaluate("-12.50 +7 10% 1,000", "12.50 +7 10% 1000")
        self.assertEqual(result["reference_numeric_tokens"], 4)
        self.assertEqual(result["matched_numeric_tokens"], 2)
        self.assertEqual(result["numeric_recall"], 0.5)

    def test_absent_numbers_not_scored_as_perfect(self):
        self.assertIsNone(evaluate("hello", "hello")["numeric_precision"])
        self.assertIsNone(evaluate("hello", "10")["numeric_recall"])
        self.assertEqual(evaluate("hello", "10")["numeric_precision"], 0.0)
        self.assertEqual(evaluate("10", "hello")["numeric_recall"], 0.0)


if __name__ == "__main__":
    unittest.main()
