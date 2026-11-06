import unittest

from table_text import plain_table_text


class TableTextTests(unittest.TestCase):
    def test_valid_table_preserves_content_order_and_exact_numeric_literals(self):
        source = "Before\n\n| Item | Amount |\n| :--- | ---: |\n| **Paper** | -18,50 |\n| Ёж | 001.00% |\n\nAfter!\n"
        result = plain_table_text(source)
        self.assertEqual(result["converted_tables"], 1)
        self.assertEqual(result["text"], "Before\n\nItem Amount\n**Paper** -18,50\nЁж 001.00%\n\nAfter!\n")

    def test_optional_outer_pipes_and_crlf(self):
        result = plain_table_text("Name | Qty\r\n--- | ---\r\nA | 2")
        self.assertEqual(result, {"text": "Name Qty\r\nA 2", "converted_tables": 1})

    def test_ordinary_pipes_without_valid_delimiter_remain(self):
        for text in ("a | b\nc | d", "a | b\n-- | --\nc | d", "a | b\n--- | --- | ---\nc | d"):
            with self.subTest(text=text):
                self.assertEqual(plain_table_text(text), {"text": text, "converted_tables": 0})

    def test_escapes_in_header_or_body_reject_entire_candidate(self):
        for text in ("a\\|x | b\n--- | ---\nc | d", "a | b\n--- | ---\nc\\|x | d"):
            with self.subTest(text=text):
                self.assertEqual(plain_table_text(text), {"text": text, "converted_tables": 0})

    def test_malformed_or_nested_pipes_reject_entire_table(self):
        for row in ("c | d | e", "c || d", "`c | d` | e", "c | "):
            text = "a | b\n--- | ---\nok | row\n" + row
            with self.subTest(row=row):
                self.assertEqual(plain_table_text(text), {"text": text, "converted_tables": 0})

    def test_code_fences_headings_and_emphasis_not_stripped(self):
        text = "# Heading\n**bold**\n```markdown\na | b\n--- | ---\nc | d\n```\n"
        self.assertEqual(plain_table_text(text), {"text": text, "converted_tables": 0})

    def test_two_tables_after_closed_fence(self):
        source = "~~~\na | b\n--- | ---\n~~~\n\na | b\n--- | ---\nc | d\n\ne | f\n--- | ---\ng | h\n"
        result = plain_table_text(source)
        self.assertEqual(result["converted_tables"], 2)
        self.assertEqual(result["text"], "~~~\na | b\n--- | ---\n~~~\n\na b\nc d\n\ne f\ng h\n")

    def test_header_only_table_preserves_final_newline(self):
        self.assertEqual(plain_table_text("a | b\n--- | ---"), {"text": "a b", "converted_tables": 1})


if __name__ == "__main__":
    unittest.main()
