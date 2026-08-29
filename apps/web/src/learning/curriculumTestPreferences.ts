import {
  CURRICULUM_LECTURE_COUNT_DEFAULT,
  CURRICULUM_LECTURE_COUNT_MAX,
  CURRICULUM_LECTURE_COUNT_MIN,
  CURRICULUM_SECTION_COUNT_DEFAULT,
  CURRICULUM_SECTION_COUNT_MAX,
  CURRICULUM_SECTION_COUNT_MIN,
  CURRICULUM_SIZE_DEFAULTS,
  normalizeCurriculumSize,
} from "./curriculumSize";
import type { CurriculumSize } from "./curriculumSize";

export {
  CURRICULUM_LECTURE_COUNT_DEFAULT,
  CURRICULUM_LECTURE_COUNT_MAX,
  CURRICULUM_LECTURE_COUNT_MIN,
  CURRICULUM_SECTION_COUNT_DEFAULT,
  CURRICULUM_SECTION_COUNT_MAX,
  CURRICULUM_SECTION_COUNT_MIN,
};

export type CurriculumTestPreferences = CurriculumSize;

export const CURRICULUM_SECTION_COUNT_PRESETS = [
  7, 10, 16, 23, 32, 50,
] as const;
export const CURRICULUM_LECTURE_COUNT_PRESETS = [
  50, 100, 300, 600, 1000,
] as const;

export const CURRICULUM_TEST_PREFERENCES_DEFAULTS: CurriculumTestPreferences = {
  ...CURRICULUM_SIZE_DEFAULTS,
};

export const CURRICULUM_TEST_PREFERENCES_KEY =
  "veolms-session-curriculum-test-preferences";
export const CURRICULUM_TEST_PREFERENCES_EVENT =
  "veolms:curriculum-test-preferences-change";

export const normalizeCurriculumTestPreferences = (
  value: Partial<CurriculumTestPreferences> | null | undefined,
): CurriculumTestPreferences => normalizeCurriculumSize(value);

export const readCurriculumTestPreferences = (): CurriculumTestPreferences => {
  if (typeof window === "undefined") {
    return CURRICULUM_TEST_PREFERENCES_DEFAULTS;
  }

  try {
    const storedValue = window.sessionStorage.getItem(
      CURRICULUM_TEST_PREFERENCES_KEY,
    );
    if (!storedValue) return CURRICULUM_TEST_PREFERENCES_DEFAULTS;
    const parsedValue: unknown = JSON.parse(storedValue);
    return normalizeCurriculumTestPreferences(
      typeof parsedValue === "object" && parsedValue !== null
        ? (parsedValue as Partial<CurriculumTestPreferences>)
        : undefined,
    );
  } catch {
    return CURRICULUM_TEST_PREFERENCES_DEFAULTS;
  }
};

export const persistCurriculumTestPreferences = (
  value: CurriculumTestPreferences,
): CurriculumTestPreferences => {
  const normalizedValue = normalizeCurriculumTestPreferences(value);
  if (typeof window === "undefined") return normalizedValue;

  try {
    window.sessionStorage.setItem(
      CURRICULUM_TEST_PREFERENCES_KEY,
      JSON.stringify(normalizedValue),
    );
  } catch {
    // Keep the active React state when session storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<CurriculumTestPreferences>(
      CURRICULUM_TEST_PREFERENCES_EVENT,
      { detail: normalizedValue },
    ),
  );
  return normalizedValue;
};
