/**
 * The app's search boxes match loosely, so a result still shows with a
 * typo, part of a word or a slightly different spelling: "javscript",
 * "typ scrip" and "Réact" all find what they mean.
 *
 * Every word typed must be found in the text, in any order. A word is found
 * when the text contains it, or when it is within a typo or two of one of
 * the text's words (or of the start of one): one for a word of 4 to 7
 * letters, two for a longer one. A typo is a letter wrong, missing, extra,
 * or two letters swapped. Words under 4 letters must be found as typed.
 */

/** Lower case, accents dropped, runs of spaces made one. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The typos a word of this length may have and still be found. */
function allowedTypos(length: number): number {
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

/**
 * The typos between two words (optimal string alignment distance), or
 * `limit + 1` as soon as there are more than `limit`.
 */
function typosBetween(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, beforePrevious[j - 2]! + 1);
      }
      current.push(value);
      rowBest = Math.min(rowBest, value);
    }
    if (rowBest > limit) return limit + 1;
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length]!;
}

function wordIsFound(word: string, text: string, textWords: string[]) {
  if (text.includes(word)) return true;
  const limit = allowedTypos(word.length);
  if (limit === 0) return false;
  return textWords.some((textWord) => {
    if (typosBetween(word, textWord, limit) <= limit) return true;
    // The start of a longer word, give or take the letters a typo adds or
    // drops: "netwrk" is the start of "networks" with its "o" missing.
    for (
      let length = Math.max(1, word.length - limit);
      length <= Math.min(textWord.length - 1, word.length + limit);
      length++
    ) {
      if (typosBetween(word, textWord.slice(0, length), limit) <= limit) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Whether `query` finds any of `fields` taken together. An empty query
 * finds everything.
 */
export function fuzzyMatches(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const words = normalizeSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeSearchText(fields.filter(Boolean).join(" "));
  if (!text) return false;
  const textWords = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.every((word) => wordIsFound(word, text, textWords));
}
