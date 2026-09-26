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
  const currentSection = sections.find((section) =>
    section.lessons.some(([number]) => number === selectedLesson),
  );
  if (options.hideHero) {
    if (currentSection) return [currentSection.id];
    return sectionIds.length > 0 ? [sectionIds[0]!] : [];
  }
  if (currentSection) return [currentSection.id];
  return sectionIds.length > 0 ? [sectionIds[0]!] : [1];
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
