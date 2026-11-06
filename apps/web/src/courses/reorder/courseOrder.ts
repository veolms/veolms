/**
 * The list with `movedId` put where `targetId` stands; the courses between
 * them shift by one. Unchanged when either is missing or they are the same.
 */
export function moveCourseTo(
  ids: readonly string[],
  movedId: string,
  targetId: string,
): string[] {
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, movedId);
  return next;
}

/** The list with `movedId` moved `offset` places, kept within the list. */
export function moveCourseBy(
  ids: readonly string[],
  movedId: string,
  offset: number,
): string[] {
  const from = ids.indexOf(movedId);
  if (from < 0) return [...ids];
  const to = Math.min(Math.max(from + offset, 0), ids.length - 1);
  return moveCourseTo(ids, movedId, ids[to]!);
}

export function sameOrder(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((id, i) => id === right[i]);
}
