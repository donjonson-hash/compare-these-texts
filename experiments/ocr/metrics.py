"""Small, deterministic OCR metrics, with no third-party dependencies.

NFC normalization and collapsing all Unicode whitespace to a single space make
line wrapping irrelevant. Case, punctuation, accents, and digit shapes remain
significant. CER includes normalized spaces; WER splits on those spaces.

Empty references: both empty gives an error rate of 0.0; a nonempty hypothesis
against an empty reference gives None (undefined), with its edit count retained.
Rates can exceed 1.0 when insertions outnumber reference characters or words.

Numeric tokens are literal digit sequences with an optional leading sign,
comma/dot-separated components, and optional percent sign. This deliberately
does not infer locale or equate 1,000 with 1000. Whitespace-separated digit groups
are separate tokens. Counts are multisets, so duplicate numbers matter. These
scores do not check a number's position, associated label, currency, or table row.
"""

from collections import Counter
import re
import unicodedata


_NUMBER = re.compile(r"[+-]?\d+(?:[.,]\d+)*%?")


def normalize(text: str) -> str:
    """Normalize canonical Unicode equivalents and layout whitespace only."""
    return " ".join(unicodedata.normalize("NFC", text).split())


def levenshtein(reference, hypothesis) -> int:
    """Exact unit-cost edit distance for strings or token sequences.

    Memory is O(min(n, m)); time is O(n*m). Inputs should be bounded by callers.
    """
    if reference == hypothesis:
        return 0
    if len(reference) < len(hypothesis):
        reference, hypothesis = hypothesis, reference
    previous = list(range(len(hypothesis) + 1))
    for row, expected in enumerate(reference, start=1):
        current = [row]
        for col, actual in enumerate(hypothesis, start=1):
            current.append(min(
                current[-1] + 1,
                previous[col] + 1,
                previous[col - 1] + (expected != actual),
            ))
        previous = current
    return previous[-1]


def _error_rate(edits: int, reference_length: int):
    if reference_length:
        return edits / reference_length
    return 0.0 if edits == 0 else None


def evaluate(reference: str, hypothesis: str) -> dict:
    """Return JSON-safe counts, CER/WER, and exact numeric precision/recall.

    Numeric precision is None when no numeric tokens were predicted; recall is
    None when the reference has no numeric tokens. Match counts remain available
    in both cases, avoiding misleading perfect scores for absent numeric data.
    """
    expected = normalize(reference)
    actual = normalize(hypothesis)
    expected_words, actual_words = expected.split(), actual.split()
    char_edits = levenshtein(expected, actual)
    word_edits = levenshtein(expected_words, actual_words)
    expected_numbers = Counter(_NUMBER.findall(expected))
    actual_numbers = Counter(_NUMBER.findall(actual))
    matches = sum((expected_numbers & actual_numbers).values())
    reference_numbers = sum(expected_numbers.values())
    hypothesis_numbers = sum(actual_numbers.values())
    return {
        "exact_match": expected == actual,
        "reference_characters": len(expected),
        "hypothesis_characters": len(actual),
        "character_edits": char_edits,
        "cer": _error_rate(char_edits, len(expected)),
        "reference_words": len(expected_words),
        "hypothesis_words": len(actual_words),
        "word_edits": word_edits,
        "wer": _error_rate(word_edits, len(expected_words)),
        "reference_numeric_tokens": reference_numbers,
        "hypothesis_numeric_tokens": hypothesis_numbers,
        "matched_numeric_tokens": matches,
        "numeric_precision": matches / hypothesis_numbers if hypothesis_numbers else None,
        "numeric_recall": matches / reference_numbers if reference_numbers else None,
    }
