import { sql, type RawBuilder } from "kysely";

/**
 * Search boxes match loosely, so a result still shows with a typo, part of
 * a word or a slightly different spelling ("mongdb", "netwrk", "javscript").
 * Every search keeps its contains-match (ILIKE) as well; this adds the
 * near ones.
 *
 * `word_similarity` (pg_trgm, enabled by the student-list migration) scores
 * how well the search matches the closest stretch of the text, 0 to 1.
 * Measured on course titles and names, a typo scores 0.57 to 0.62, while a
 * near-namesake ("typscript" against "JavaScript") scores 0.50 and an
 * unrelated word 0.33 or less, so 0.55 is the line (pg_trgm's own default,
 * 0.6, missed half the typos). It is used on short fields only (titles,
 * names, usernames): over long text such as a post's body every row
 * would be compared in full, and a contains-match serves it.
 */
export const FUZZY_SEARCH_THRESHOLD = 0.55;

/** Searches shorter than this match as typed only: "js" is not near "jsx". */
export const FUZZY_SEARCH_MIN_LENGTH = 4;

/** Whether a search is long enough to be matched loosely. */
export function isFuzzySearchTerm(term: string): boolean {
  return term.trim().length >= FUZZY_SEARCH_MIN_LENGTH;
}

/**
 * True where `text` is close to `term` (see above). `text` is any SQL
 * expression; a null one never matches.
 */
export function fuzzyMatches(
  term: string,
  text: RawBuilder<unknown> | ReturnType<typeof sql.ref>,
): RawBuilder<boolean> {
  return sql<boolean>`coalesce(word_similarity(${term.trim().toLowerCase()}, ${text}) >= ${FUZZY_SEARCH_THRESHOLD}, false)`;
}

/**
 * True where any of `texts` is close to `term`; false outright for a search
 * too short to match loosely. Added as one more alternative beside a
 * search's contains-matches.
 */
export function fuzzyMatchesAny(
  term: string,
  texts: (RawBuilder<unknown> | ReturnType<typeof sql.ref>)[],
): RawBuilder<boolean> {
  if (!isFuzzySearchTerm(term) || texts.length === 0)
    return sql<boolean>`false`;
  return sql<boolean>`(${sql.join(
    texts.map((text) => fuzzyMatches(term, text)),
    sql` or `,
  )})`;
}

/** The search a `containsPattern` (like-pattern.ts) was made from. */
export function termFromContainsPattern(pattern: string): string {
  return pattern.replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1");
}
