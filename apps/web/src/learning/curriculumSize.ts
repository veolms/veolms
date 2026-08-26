export interface CurriculumSize {
  sectionCount: number;
  lectureCount: number;
}

export const CURRICULUM_SECTION_COUNT_MIN = 1;
export const CURRICULUM_SECTION_COUNT_MAX = 50;
export const CURRICULUM_SECTION_COUNT_DEFAULT = 10;
export const CURRICULUM_LECTURE_COUNT_MIN = 10;
export const CURRICULUM_LECTURE_COUNT_MAX = 1000;
export const CURRICULUM_LECTURE_COUNT_DEFAULT = 100;

export const CURRICULUM_SIZE_DEFAULTS: CurriculumSize = {
  sectionCount: CURRICULUM_SECTION_COUNT_DEFAULT,
  lectureCount: CURRICULUM_LECTURE_COUNT_DEFAULT,
};

const normalizeCount = (
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numericValue)));
};

export const normalizeCurriculumSize = (
  value: Partial<CurriculumSize> | null | undefined,
): CurriculumSize => ({
  sectionCount: normalizeCount(
    value?.sectionCount,
    CURRICULUM_SECTION_COUNT_MIN,
    CURRICULUM_SECTION_COUNT_MAX,
    CURRICULUM_SECTION_COUNT_DEFAULT,
  ),
  lectureCount: normalizeCount(
    value?.lectureCount,
    CURRICULUM_LECTURE_COUNT_MIN,
    CURRICULUM_LECTURE_COUNT_MAX,
    CURRICULUM_LECTURE_COUNT_DEFAULT,
  ),
});
