import { useEffect, useState } from "react";
import {
  ELASTIC_SCROLL_APPEARANCE_KEY,
  ELASTIC_SCROLL_ICON_ANIMATION_KEY,
  ELASTIC_SCROLL_ICON_KEY,
  ELASTIC_SCROLL_LOCK_SIDE_KEY,
  ELASTIC_SCROLL_PREFERENCES_DEFAULT,
  ELASTIC_SCROLL_PREFERENCES_EVENT,
  ELASTIC_SCROLL_UNLOCK_SIDE_KEY,
  readElasticScrollPreferences,
} from "../../settings/settingsPreferences";
import type { ElasticScrollPreferences } from "../../settings/settingsPreferences";

const ELASTIC_SCROLL_STORAGE_KEYS = new Set([
  ELASTIC_SCROLL_APPEARANCE_KEY,
  ELASTIC_SCROLL_ICON_KEY,
  ELASTIC_SCROLL_ICON_ANIMATION_KEY,
  ELASTIC_SCROLL_LOCK_SIDE_KEY,
  ELASTIC_SCROLL_UNLOCK_SIDE_KEY,
]);

export function useElasticScrollerPreferences(): ElasticScrollPreferences {
  const [preferences, setPreferences] = useState<ElasticScrollPreferences>({
    ...ELASTIC_SCROLL_PREFERENCES_DEFAULT,
  });

  useEffect(() => {
    const syncPreferences = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail) {
        setPreferences(event.detail as ElasticScrollPreferences);
        return;
      }
      setPreferences(readElasticScrollPreferences());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || ELASTIC_SCROLL_STORAGE_KEYS.has(event.key)) {
        syncPreferences();
      }
    };

    syncPreferences();
    window.addEventListener(
      ELASTIC_SCROLL_PREFERENCES_EVENT,
      syncPreferences,
    );
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(
        ELASTIC_SCROLL_PREFERENCES_EVENT,
        syncPreferences,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return preferences;
}
