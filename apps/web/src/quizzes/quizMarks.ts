/** A mark as people write it: whole marks plainly, part marks to 2 places. */
export function formatMarks(value: number | null) {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Marks out of a quiz's total, "6 / 21", the way the course team reads a score. */
export function formatMarksOutOf(obtained: number | null, max: number) {
  return `${formatMarks(obtained)} / ${formatMarks(max)}`;
}
