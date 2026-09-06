import { useCallback, useEffect, useMemo, useState } from "react";
import type { CourseSection } from "../courseContent";
import {
  getCurriculumSectionForLesson,
  getInitialCurriculumExpandedSections,
} from "../curriculumExpandedSections";

export function useMiniPlayerCurriculumSections(
  sections: readonly CourseSection[],
  selectedLesson: number,
) {
  const sectionIds = useMemo(() => sections.map(({ id }) => id), [sections]);
  const [expandedSectionIds, setExpandedSectionIds] = useState<number[]>(() =>
    getInitialCurriculumExpandedSections(sections, selectedLesson, {
      hideHero: true,
    }),
  );

  useEffect(() => {
    const currentSection = getCurriculumSectionForLesson(
      sections,
      selectedLesson,
    );
    if (currentSection) {
      setExpandedSectionIds([currentSection.id]);
    }
  }, [sections, selectedLesson]);

  const expandAllSections = useCallback(() => {
    setExpandedSectionIds([...sectionIds]);
  }, [sectionIds]);

  const collapseAllSections = useCallback(() => {
    setExpandedSectionIds([]);
  }, []);

  return {
    sectionIds,
    expandedSectionIds,
    setExpandedSectionIds,
    expandAllSections,
    collapseAllSections,
  };
}
