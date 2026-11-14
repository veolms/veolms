import { useEffect, useState } from "react";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import {
  READING_MODE_CHANGE_EVENT,
  READING_MODE_STORAGE_KEY,
  persistReadingModePreferences,
  readReadingModePreferences,
} from "../reading-mode/readingModePreferences";
import { SettingsToggle } from "./SettingsControls";

/**
 * Reading mode's switch at the top of the settings page, beside its heading:
 * on and off in one click, without opening Appearance. The same preference
 * as the sidebar's eye and the Appearance section's switch (kept in step
 * through the change event and other tabs' storage).
 */
export function SettingsReadingModeSwitch() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(readReadingModePreferences().enabled);
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === READING_MODE_STORAGE_KEY || event.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(READING_MODE_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(READING_MODE_CHANGE_EVENT, sync);
    };
  }, []);

  const change = (next: boolean) => {
    setEnabled(
      persistReadingModePreferences({
        ...readReadingModePreferences(),
        enabled: next,
      }).enabled,
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-(--border) bg-(--surface) py-1.5 pr-1.5 pl-3">
      <Eye
        size={18}
        weight={enabled ? "fill" : "regular"}
        className="text-(--accent-ink,var(--accent))"
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-(--text)">Reading mode</span>
      <SettingsToggle
        checked={enabled}
        onChange={change}
        label={`Turn reading mode ${enabled ? "off" : "on"}`}
      />
    </div>
  );
}
