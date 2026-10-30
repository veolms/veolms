import type { CourseSection } from "./courseContent";

export function getInitialCurriculumExpandedSections(
  sections: readonly CourseSection[],
  selectedLesson: number,
  options: {
    expandAllSections?: boolean;
    hideHero?: boolean;
  } = {},
): number[] {
  const sectionIds = sections.map(({ id }) => id);
  if (options.expandAllSections) return [...sectionIds];
  // Only the section of the lesson being played; the others start closed.
  const currentSection = sections.find((section) =>
    section.lessons.some(([number]) => number === selectedLesson),
  );
  if (currentSection) return [currentSection.id];
  return sectionIds.length > 0 ? [sectionIds[0]!] : [];
}

export function getCurriculumSectionForLesson(
  sections: readonly CourseSection[],
  selectedLesson: number,
) {
  return (
    sections.find((section) =>
      section.lessons.some(([number]) => number === selectedLesson),
    ) ?? sections[0]
  );
}
