import { resolveAliasedBasicsUpdate } from "./basics-aliased-field.ts";

/**
 * The category a basics update asks for, read from its two spellings
 * (`categoryId`, and the older alias `category`):
 *
 * - a category id: the course is given that category;
 * - `null`: the course's category is removed;
 * - `undefined`: neither field was sent, so the category is left as it is.
 *
 * A category named in either field wins over a `null` in the other. This one
 * value is what the update checks, writes and reports back. The rule itself,
 * and what it replaced, is in `resolveAliasedBasicsUpdate`; the course's
 * level is read by the same rule.
 */
export function resolveBasicsCategoryUpdate(updates: {
  categoryId?: string | null;
  category?: string | null;
}): string | null | undefined {
  return resolveAliasedBasicsUpdate(updates.categoryId, updates.category);
}
