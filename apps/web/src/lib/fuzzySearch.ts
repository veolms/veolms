/**
 * The app's loose search (typos, parts of words, any order): the matcher
 * lives in @veolms/contracts (fuzzy-text.ts) so the API matches the same
 * way; highlighting is the web's own.
 */
import {
  matchesFuzzyText,
  normalizeSearchText,
  wordIsFound,
} from "@veolms/contracts";

export { normalizeSearchText };

/**
 * Whether `query` finds any of `fields` taken together. An empty query
 * finds everything.
 */
export const fuzzyMatches = matchesFuzzyText;

/**
 * A word as it is highlighted: letters and digits, with the dots (and
 * apostrophes) inside it, so "Node.js" is one word and a full stop is not.
 */
const HIGHLIGHT_WORD = /[\p{L}\p{N}\p{M}]+(?:[.'’][\p{L}\p{N}\p{M}]+)*/gu;

/**
 * Where the words `query` finds are in `text`, as [start, end) ranges of
 * whole words, in order: a word is in when any word typed finds it by the
 * rule of the matcher (fuzzy-text.ts in @veolms/contracts), so a typo ("javscript"), part of a word ("type" in
 * "TypeScript") or a name without its dot ("nodejs" in "Node.js") marks
 * the whole word. A word typed of one letter marks nothing.
 */
export function findSearchMatches(
  query: string,
  text: string,
): [number, number][] {
  const words = normalizeSearchText(query)
    .split(" ")
    .filter((word) => word.length >= 2);
  if (words.length === 0 || !text) return [];
  const ranges: [number, number][] = [];
  for (const match of text.matchAll(HIGHLIGHT_WORD)) {
    const token = normalizeSearchText(match[0]);
    if (words.some((word) => wordIsFound(word, token, [token]))) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}
