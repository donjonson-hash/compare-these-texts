export const CSV_DELIMITERS = [',', ';', '\t'];

// Existing reports store a single character. Mixed CSV/TSV comparisons store
// both characters so edits and resumed downloads use each source's dialect.
export function isCsvDelimiter(value) {
  return CSV_DELIMITERS.includes(value) || (
    value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 2 && Object.hasOwn(value, 'left') && Object.hasOwn(value, 'right') &&
    CSV_DELIMITERS.includes(value.left) && CSV_DELIMITERS.includes(value.right)
  );
}

export function delimiterForSide(value, side) {
  return typeof value === 'string' ? value : value[side];
}
