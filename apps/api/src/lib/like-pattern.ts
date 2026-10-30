/**
 * Text a person typed, made safe to place inside a LIKE / ILIKE pattern.
 * "%" and "_" mean "anything" to LIKE, so a search for "50%" or "a_b"
 * matched far more than it said; they, and the escape character itself, are
 * escaped (backslash is LIKE's default escape). Add your own "%" around the
 * result: `${escapeLikePattern(term)}%` is "starts with".
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

/**
 * A LIKE pattern that finds `term` anywhere in lower-cased text, as typed.
 * Compare it against `lower(column)`, or use ILIKE.
 */
export function containsPattern(term: string): string {
  return `%${escapeLikePattern(term.toLowerCase())}%`;
}
