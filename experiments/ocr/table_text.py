"""Conservative Markdown-table normalization for an optional OCR diagnostic.

This does not establish transcription fidelity: use raw CER/WER as primary
metrics. Only simple pipe tables with a header and a matching delimiter row are
converted. Cell strings retain their spelling, punctuation, case and numbers;
outer cell whitespace and Markdown table delimiters are replaced by spaces.

Escapes, inline code, empty cells, one-column tables and malformed body rows are
unsupported and leave the entire candidate table unchanged. Fenced code blocks
are never converted. No headings, emphasis, HTML or general punctuation are
removed. Output is intended for inspecting formatting effects, not as an OCR
correction or the input to document comparison.
"""

import re


_DELIMITER = re.compile(r":?-{3,}:?\Z")
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")


def _content(line):
    return line.rstrip("\r\n")


def _ending(line):
    return line[len(_content(line)):]


def _cells(line):
    value = _content(line).strip()
    if "|" not in value or "\\" in value or "`" in value:
        return None
    if value.startswith("|"):
        value = value[1:]
    if value.endswith("|"):
        value = value[:-1]
    cells = [cell.strip() for cell in value.split("|")]
    if len(cells) < 2 or not all(cells):
        return None
    return cells


def plain_table_text(text: str) -> dict:
    """Return {text: str, converted_tables: int}; leave uncertain input intact.

    A candidate's body comprises subsequent contiguous lines containing pipes.
    Every such line must parse with the same column count. A blank line or a
    non-pipe paragraph ends the table. Multiple tables need a separating line.
    """
    lines = text.splitlines(keepends=True)
    output = []
    converted_tables = 0
    fence = None
    index = 0
    while index < len(lines):
        line = lines[index]
        marker = _FENCE.match(_content(line))
        if marker:
            run, suffix = marker.groups()
            if fence is None:
                fence = (run[0], len(run))
            elif run[0] == fence[0] and len(run) >= fence[1] and not suffix.strip():
                fence = None
            output.append(line)
            index += 1
            continue
        if fence is not None or index + 1 >= len(lines):
            output.append(line)
            index += 1
            continue
        header = _cells(line)
        delimiter = _cells(lines[index + 1])
        if (header is None or delimiter is None or len(header) != len(delimiter)
                or not all(_DELIMITER.fullmatch(cell) for cell in delimiter)):
            output.append(line)
            index += 1
            continue
        end = index + 2
        body = []
        valid = True
        while end < len(lines) and "|" in _content(lines[end]) and not _FENCE.match(_content(lines[end])):
            cells = _cells(lines[end])
            if cells is None or len(cells) != len(header) or all(_DELIMITER.fullmatch(cell) for cell in cells):
                valid = False
            body.append(cells)
            end += 1
        if not valid:
            output.extend(lines[index:end])
            index = end
            continue
        # Keep line boundaries (including CRLF) and the original final newline.
        # A header-only table inherits the delimiter's final line ending.
        header_ending = _ending(line) if body else _ending(lines[index + 1])
        output.append(" ".join(header) + header_ending)
        for offset, cells in enumerate(body, start=index + 2):
            output.append(" ".join(cells) + _ending(lines[offset]))
        converted_tables += 1
        index = end
    return {"text": "".join(output), "converted_tables": converted_tables}
