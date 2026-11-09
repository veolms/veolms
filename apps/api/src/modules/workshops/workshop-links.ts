/** Where a course lesson opens in the player, without knowing its number. */
export function lessonPathOf(
  courseSlug: string | null | undefined,
  lessonId: string | null | undefined,
): string | null {
  return courseSlug && lessonId
    ? `/learn/${courseSlug}?lessonId=${lessonId}`
    : null;
}
