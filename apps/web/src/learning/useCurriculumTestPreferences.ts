import { useCallback, useEffect, useState } from "react";
import {
  CURRICULUM_TEST_PREFERENCES_DEFAULTS,
  CURRICULUM_TEST_PREFERENCES_EVENT,
  normalizeCurriculumTestPreferences,
  persistCurriculumTestPreferences,
  readCurriculumTestPreferences,
} from "./curriculumTestPreferences";
import type { CurriculumTestPreferences } from "./curriculumTestPreferences";

const getEventPreferences = (
  event: Event,
): Partial<CurriculumTestPreferences> | undefined => {
  if (!(event instanceof CustomEvent)) return undefined;
  const detail: unknown = event.detail;
  return typeof detail === "object" && detail !== null
    ? (detail as Partial<CurriculumTestPreferences>)
    : undefined;
};

export function useCurriculumTestPreferences() {
  const [preferences, setPreferences] = useState(
    CURRICULUM_TEST_PREFERENCES_DEFAULTS,
  );

  useEffect(() => {
    setPreferences(readCurriculumTestPreferences());

    const syncPreferences = (event: Event) => {
      const eventPreferences = getEventPreferences(event);
      setPreferences(
        eventPreferences
          ? normalizeCurriculumTestPreferences(eventPreferences)
          : readCurriculumTestPreferences(),
      );
    };

    window.addEventListener(CURRICULUM_TEST_PREFERENCES_EVENT, syncPreferences);
    return () =>
      window.removeEventListener(
        CURRICULUM_TEST_PREFERENCES_EVENT,
        syncPreferences,
      );
  }, []);

  const savePreferences = useCallback((value: CurriculumTestPreferences) => {
    persistCurriculumTestPreferences(value);
  }, []);

  return { preferences, savePreferences };
}
