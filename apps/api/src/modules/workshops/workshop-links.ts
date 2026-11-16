/** Where a course lesson opens in the player, without knowing its number. */
export function lessonPathOf(
  courseSlug: string | null | undefined,
  lessonId: string | null | undefined,
): string | null {
  return courseSlug && lessonId
    ? `/learn/${courseSlug}?lessonId=${lessonId}`
    : null;
}

/** Who a workshop is for: a course's learners, buyers, or every learner. */
export function audienceOf(row: {
  course_id: string | null;
  price_minor: number | null;
}): "everyone" | "course" | "paid" {
  if (row.course_id) return "course";
  if (row.price_minor !== null && row.price_minor > 0) return "paid";
  return "everyone";
}
