/**
 * The value a basics update asks for in a field that has two spellings (a
 * name and an older alias, such as `categoryId`/`category` and
 * `difficulty`/`difficultyLevel`):
 *
 * - a value: the course is given it;
 * - `null`: the course's value is removed;
 * - `undefined`: neither spelling was sent, so the value is left as it is.
 *
 * A value named in either spelling wins over a `null` in the other, and the
 * name wins over the alias when both hold a value. This one result is what
 * the update checks, writes and reports back.
 *
 * It used to be `name ?? alias` at each of those places. For
 * `{ name: null }` that is `undefined`, which the write skips: the request
 * answered 200 with `null` and the stored value stayed, so neither a
 * course's category nor its level could be removed.
 */
export function resolveAliasedBasicsUpdate<Value>(
  named: Value | null | undefined,
  alias: Value | null | undefined,
): Value | null | undefined {
  const value = named ?? alias;
  if (value !== null && value !== undefined) return value;
  return named === undefined && alias === undefined ? undefined : null;
}
