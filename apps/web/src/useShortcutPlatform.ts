import { useEffect, useState } from "react";
import {
  readShortcutPlatformPreference,
  resolveShortcutPlatform,
  SHORTCUT_PLATFORM_PREFERENCE_DEFAULT,
  SHORTCUT_PLATFORM_PREFERENCE_EVENT,
  SHORTCUT_PLATFORM_PREFERENCE_KEY,
} from "./keyboardShortcuts";
import type {
  ShortcutPlatform,
  ShortcutPlatformPreference,
} from "./keyboardShortcuts";

interface ShortcutPlatformPreferenceState {
  preference: ShortcutPlatformPreference;
  ready: boolean;
}

function useShortcutPlatformPreferenceState(): ShortcutPlatformPreferenceState {
  // Keep the prerendered markup and the first client render identical. Reading
  // localStorage during the state initializer can otherwise change shortcut
  // labels (for example Ctrl to Command) before React has hydrated the page.
  const [preference, setPreference] = useState<ShortcutPlatformPreference>(
    SHORTCUT_PLATFORM_PREFERENCE_DEFAULT,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const syncPreference = () =>
      setPreference(readShortcutPlatformPreference());
    const syncStoredPreference = (event: StorageEvent) => {
      if (event.key === SHORTCUT_PLATFORM_PREFERENCE_KEY) syncPreference();
    };

    syncPreference();
    setReady(true);
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

  return { preference, ready };
}

export function useShortcutPlatformPreference(): ShortcutPlatformPreference {
  return useShortcutPlatformPreferenceState().preference;
}

export function useShortcutPlatform(): ShortcutPlatform {
  const { preference, ready } = useShortcutPlatformPreferenceState();
  // Keep the server-safe snapshot until storage restoration completes. This
  // prevents a saved override from briefly rendering the opposite shortcut
  // platform during hydration. Explicit preferences become authoritative once
  // the preference state is ready; follow-system then detects the runtime OS.
  return ready ? resolveShortcutPlatform(preference) : "windows";
}
