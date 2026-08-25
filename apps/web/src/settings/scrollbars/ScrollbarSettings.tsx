import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { useEffect, useState } from "react";
import {
  HIDE_SCROLLBARS_KEY,
  SCROLLBAR_STYLE_DEFAULT,
  SCROLLBAR_STYLE_KEY,
  normalizeScrollbarStyle,
  readStored,
  readStoredBoolean,
} from "../settingsPreferences";
import type { ScrollbarStyle } from "../settingsPreferences";
import {
  ChoiceCard,
  RadioGroup,
  SettingRow,
  SettingsToggle,
} from "../SettingsControls";

interface ScrollbarStyleOption {
  id: ScrollbarStyle;
  label: string;
  note: string;
}

const SCROLLBAR_STYLES: readonly ScrollbarStyleOption[] = [
  {
    id: "default",
    label: "Default",
    note: "Use your browser and operating system style",
  },
  {
    id: "custom",
    label: "Custom",
    note: "A quiet, slim scrollbar with a neutral thumb",
  },
  {
    id: "theme",
    label: "Theme",
    note: "Match the active ProCodrr color theme",
  },
  {
    id: "thick",
    label: "Thick",
    note: "A wider track that is easier to see and grab",
  },
];

const PREVIEW_STYLES: Record<ScrollbarStyle, { track: string; thumb: string }> =
  {
    default: {
      track:
        "w-3 bg-[color-mix(in_srgb,var(--text)_10%,var(--canvas))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent)]",
      thumb:
        "inset-x-0.5 top-3 h-8 rounded-sm bg-[color-mix(in_srgb,var(--text-secondary)_58%,var(--surface))]",
    },
    custom: {
      track: "w-1.5 bg-transparent",
      thumb:
        "inset-x-0 top-3 h-8 rounded-full bg-[color-mix(in_srgb,var(--text-secondary)_58%,transparent)]",
    },
    theme: {
      track: "w-1.5 bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]",
      thumb: "inset-x-0 top-3 h-8 rounded-full bg-(--accent)",
    },
    thick: {
      track:
        "w-3 bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface-strong))]",
      thumb:
        "inset-x-0.5 top-3 h-8 rounded-full bg-[color-mix(in_srgb,var(--accent)_88%,var(--text))]",
    },
  };

function ScrollbarStylePreview({ style }: { style: ScrollbarStyle }) {
  const preview = PREVIEW_STYLES[style];

  return (
    <span
      className="relative block h-20 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--canvas)_82%,var(--surface-strong))] p-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)]"
      aria-hidden="true"
    >
      <span className="grid w-[calc(100%-24px)] gap-2 pt-0.5">
        <span className="h-1.5 w-4/5 rounded-full bg-[color-mix(in_srgb,var(--text-secondary)_24%,transparent)]" />
        <span className="h-1.5 w-full rounded-full bg-[color-mix(in_srgb,var(--text-secondary)_14%,transparent)]" />
        <span className="h-1.5 w-3/5 rounded-full bg-[color-mix(in_srgb,var(--text-secondary)_14%,transparent)]" />
        <span className="h-1.5 w-[72%] rounded-full bg-[color-mix(in_srgb,var(--text-secondary)_14%,transparent)]" />
      </span>
      <span
        className={`absolute inset-y-2 right-2 rounded-full ${preview.track}`}
      >
        <span className={`absolute ${preview.thumb}`} />
      </span>
    </span>
  );
}

export function ScrollbarSettings() {
  const [scrollbarsEnabled, setScrollbarsEnabled] = useState(true);
  const [scrollbarStyle, setScrollbarStyle] = useState<ScrollbarStyle>(
    SCROLLBAR_STYLE_DEFAULT,
  );
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    setScrollbarsEnabled(!readStoredBoolean(HIDE_SCROLLBARS_KEY, false));
    setScrollbarStyle(
      normalizeScrollbarStyle(
        readStored(SCROLLBAR_STYLE_KEY, SCROLLBAR_STYLE_DEFAULT),
      ),
    );
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const hideScrollbars = !scrollbarsEnabled;
    document.documentElement.dataset.hideScrollbars = String(hideScrollbars);
    document.documentElement.dataset.scrollbarStyle = scrollbarStyle;
    try {
      localStorage.setItem(HIDE_SCROLLBARS_KEY, String(hideScrollbars));
      localStorage.setItem(SCROLLBAR_STYLE_KEY, scrollbarStyle);
    } catch {
      // Keep the current-session preference when storage is unavailable.
    }
  }, [scrollbarStyle, scrollbarsEnabled, storageReady]);

  const selectedStyleLabel =
    SCROLLBAR_STYLES.find(({ id }) => id === scrollbarStyle)?.label ?? "Theme";

  return (
    <section className="settings-section">
      <div className="settings-section__heading-row">
        <div>
          <h2>Scrollbars</h2>
          <p>
            Choose when scrollbars appear and how they look in content areas.
          </p>
        </div>
        <span className="settings-section__count" aria-live="polite">
          {scrollbarsEnabled ? selectedStyleLabel : "Hidden"}
        </span>
      </div>

      <div className="settings-row-list mt-4">
        <SettingRow
          icon={Eye}
          label="Show scrollbars"
          note="Hide content scrollbar controls while keeping wheel, touch, and keyboard scrolling"
        >
          <SettingsToggle
            checked={scrollbarsEnabled}
            onChange={setScrollbarsEnabled}
            label="Show scrollbars"
          />
        </SettingRow>
      </div>

      <div className="mt-5">
        <div className="mb-3">
          <h3 className="m-0 text-sm font-semibold tracking-[-0.015em] text-(--text)">
            Scrollbar style
          </h3>
          <p className="mt-1 mb-0 text-xs leading-5 text-(--muted)">
            Preview a style, then select it to apply it immediately.
          </p>
        </div>

        <RadioGroup
          label="Scrollbar style"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {SCROLLBAR_STYLES.map(({ id, label, note }) => (
            <ChoiceCard
              key={id}
              checked={scrollbarStyle === id}
              onChange={() => setScrollbarStyle(id)}
              label={label}
              note={note}
              preview={<ScrollbarStylePreview style={id} />}
              className="min-h-44 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!scrollbarsEnabled}
            />
          ))}
        </RadioGroup>
      </div>
    </section>
  );
}
