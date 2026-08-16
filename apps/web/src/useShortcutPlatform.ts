import { useEffect, useState } from "react";
import {
  readShortcutPlatformPreference,
  resolveShortcutPlatform,
  SHORTCUT_PLATFORM_PREFERENCE_EVENT,
  SHORTCUT_PLATFORM_PREFERENCE_KEY,
} from "./keyboardShortcuts";
import type {
  ShortcutPlatform,
  ShortcutPlatformPreference,
} from "./keyboardShortcuts";

export function useShortcutPlatformPreference(): ShortcutPlatformPreference {
  const [preference, setPreference] = useState(readShortcutPlatformPreference);

  useEffect(() => {
    const syncPreference = () =>
      setPreference(readShortcutPlatformPreference());
    const syncStoredPreference = (event: StorageEvent) => {
      if (event.key === SHORTCUT_PLATFORM_PREFERENCE_KEY) syncPreference();
    };

    window.addEventListener(SHORTCUT_PLATFORM_PREFERENCE_EVENT, syncPreference);
    window.addEventListener("storage", syncStoredPreference);
    return () => {
      window.removeEventListener(
        SHORTCUT_PLATFORM_PREFERENCE_EVENT,
        syncPreference,
      );
      window.removeEventListener("storage", syncStoredPreference);
    };
  }, []);

  return preference;
}

export function useShortcutPlatform(): ShortcutPlatform {
  const preference = useShortcutPlatformPreference();
  return resolveShortcutPlatform(preference);
}
