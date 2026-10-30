import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FUZZY_SEARCH_MIN_LENGTH,
  fuzzySearchTerm,
  isFuzzySearchTerm,
  termFromContainsPattern,
} from "./fuzzy-search.ts";
import { containsPattern } from "./like-pattern.ts";

await test("a search shorter than the minimum is matched as typed only", () => {
  assert.equal(isFuzzySearchTerm("js"), false);
  assert.equal(isFuzzySearchTerm("  ab  "), false);
  assert.equal(isFuzzySearchTerm("x".repeat(FUZZY_SEARCH_MIN_LENGTH)), true);
});

await test("a search is compared without its dots, as the text is", () => {
  assert.equal(fuzzySearchTerm("  Node.js "), "nodejs");
  assert.equal(fuzzySearchTerm("next.js"), "nextjs");
  assert.equal(fuzzySearchTerm("nodejs"), "nodejs");
  // Long enough is counted without the dots.
  assert.equal(isFuzzySearchTerm("a.b.c"), false);
});

await test("the search a contains-pattern was made from comes back as typed", () => {
  for (const term of ["mongdb", "50%", "a_b", "c:\\x", "Sandeep M"]) {
    assert.equal(
      termFromContainsPattern(containsPattern(term)),
      term.toLowerCase(),
    );
  }
});
