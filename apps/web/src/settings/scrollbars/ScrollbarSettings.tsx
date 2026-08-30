import { ArrowsDownUpIcon as ArrowsDownUp } from "@phosphor-icons/react/ArrowsDownUp";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { LockOpenIcon as LockOpen } from "@phosphor-icons/react/LockOpen";
import { useEffect, useState } from "react";
import {
  ElasticScrollerGlyph,
  ElasticScrollerSocket,
  elasticScrollerButtonSurface,
} from "../../components/elastic-scroller";
import {
  ELASTIC_SCROLL_PREFERENCES_DEFAULT,
  HIDE_SCROLLBARS_DEFAULT,
  HIDE_SCROLLBARS_KEY,
  SCROLLBAR_STYLE_DEFAULT,
  SCROLLBAR_STYLE_KEY,
  normalizeScrollbarStyle,
  persistElasticScrollPreferences,
  readElasticScrollPreferences,
  readStored,
  readStoredBoolean,
} from "../settingsPreferences";
import type {
  ElasticScrollAppearance,
  ElasticScrollGestureSide,
  ElasticScrollIcon,
  ScrollbarStyle,
} from "../settingsPreferences";
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

interface ElasticScrollAppearanceOption {
  id: ElasticScrollAppearance;
  label: string;
  note: string;
}

interface ElasticScrollIconOption {
  id: ElasticScrollIcon;
  label: string;
  note: string;
}

interface ElasticScrollGestureSideOption {
  id: ElasticScrollGestureSide;
  label: string;
}

const SCROLLBAR_STYLES: readonly ScrollbarStyleOption[] = [
  {
    id: "default",
    label: "Default",
    note: "Use your browser and operating system style at a slim width",
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

const ELASTIC_SCROLL_APPEARANCES: readonly ElasticScrollAppearanceOption[] = [
  {
    id: "2d",
    label: "2D",
    note: "The original flat control with a quiet progress puck",
  },
  {
    id: "3d",
    label: "3D",
    note: "A raised arrow that settles into a recessed progress socket",
  },
];

const ELASTIC_SCROLL_ICONS: readonly ElasticScrollIconOption[] = [
  {
    id: "arrow",
    label: "Classic arrow",
    note: "Clear and familiar",
  },
  {
    id: "caret",
    label: "Compact caret",
    note: "Light and minimal",
  },
  {
    id: "double-caret",
    label: "Double caret",
    note: "Emphasizes direction",
  },
  {
    id: "bold-arrow",
    label: "Bold arrow",
    note: "Stronger at a glance",
  },
  {
    id: "edge",
    label: "Edge arrow",
    note: "Suggests the list boundary",
  },
];

const ELASTIC_SCROLL_GESTURE_SIDES: readonly ElasticScrollGestureSideOption[] =
  [
    { id: "left", label: "Left side" },
    { id: "right", label: "Right side" },
  ];

const PREVIEW_STYLES: Record<ScrollbarStyle, { track: string; thumb: string }> =
  {
    default: {
      track:
        "w-1.5 bg-[color-mix(in_srgb,var(--text)_10%,var(--canvas))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent)]",
      thumb:
        "inset-x-0 top-3 h-8 rounded-sm bg-[color-mix(in_srgb,var(--text-secondary)_58%,var(--surface))]",
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

function ElasticScrollAppearancePreview({
  appearance,
  icon,
}: {
  appearance: ElasticScrollAppearance;
  icon: ElasticScrollIcon;
}) {
  const hasDepth = appearance === "3d";

  return (
    <span
      className="relative block h-20 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--canvas)_82%,var(--surface-strong))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)]"
      aria-hidden="true"
    >
      <ElasticScrollerSocket
        appearance={appearance}
        className="absolute top-2 left-1/2 -translate-x-1/2"
      />
      <span
        className={`absolute bottom-1 left-1/2 inline-flex size-10 -translate-x-1/2 items-center justify-center rounded-full border text-(--text) ${elasticScrollerButtonSurface(appearance)}`}
      >
        <ElasticScrollerGlyph
          icon={icon}
          size={19}
          className={
            hasDepth
              ? "drop-shadow-[0_2px_1px_color-mix(in_srgb,var(--canvas)_74%,transparent)]"
              : undefined
          }
        />
      </span>
    </span>
  );
}

function ElasticScrollIconPreview({ icon }: { icon: ElasticScrollIcon }) {
  return (
    <span
      className="flex h-16 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--canvas)_82%,var(--surface-strong))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)]"
      aria-hidden="true"
    >
      <span className="inline-flex size-10 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--border-strong)_72%,var(--text)_28%)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong)_88%,white),color-mix(in_srgb,var(--surface-strong)_78%,var(--canvas)))] text-(--text) shadow-[inset_0_1px_0_color-mix(in_srgb,white_24%,transparent),0_6px_14px_color-mix(in_srgb,black_36%,transparent)]">
        <ElasticScrollerGlyph icon={icon} size={20} />
      </span>
    </span>
  );
}

function ElasticScrollGesturePreview({
  side,
  action,
}: {
  side: ElasticScrollGestureSide;
  action: "lock" | "unlock";
}) {
  const DirectionIcon = side === "left" ? ArrowLeft : ArrowRight;
  const StateIcon = action === "lock" ? LockOpen : Lock;

  return (
    <span
      className="relative flex h-14 items-center justify-center overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--canvas)_82%,var(--surface-strong))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)]"
      aria-hidden="true"
    >
      <span
        className={`absolute top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_42%,var(--border-strong))] bg-[color-mix(in_srgb,var(--canvas)_78%,var(--surface))] text-(--accent) shadow-[inset_0_2px_4px_color-mix(in_srgb,black_28%,transparent)] ${side === "left" ? "left-3" : "right-3"}`}
      >
        <StateIcon size={14} weight={action === "lock" ? "bold" : "fill"} />
      </span>
      <span className="inline-flex size-8 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--border-strong)_72%,var(--text)_28%)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong)_88%,white),color-mix(in_srgb,var(--surface-strong)_78%,var(--canvas)))] text-(--text) shadow-[inset_0_1px_0_color-mix(in_srgb,white_24%,transparent),0_5px_10px_color-mix(in_srgb,black_30%,transparent)]">
        <ElasticScrollerGlyph icon="arrow" size={16} />
      </span>
      <DirectionIcon
        className={`absolute top-1/2 -translate-y-1/2 text-(--muted) ${side === "left" ? "left-11" : "right-11"}`}
        size={14}
        weight="bold"
      />
    </span>
  );
}

export function ScrollbarSettings() {
  const [scrollbarsEnabled, setScrollbarsEnabled] = useState(
    !HIDE_SCROLLBARS_DEFAULT,
  );
  const [scrollbarStyle, setScrollbarStyle] = useState<ScrollbarStyle>(
    SCROLLBAR_STYLE_DEFAULT,
  );
  const [elasticScrollPreferences, setElasticScrollPreferences] = useState({
    ...ELASTIC_SCROLL_PREFERENCES_DEFAULT,
  });
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    setScrollbarsEnabled(
      !readStoredBoolean(HIDE_SCROLLBARS_KEY, HIDE_SCROLLBARS_DEFAULT),
    );
    setScrollbarStyle(
      normalizeScrollbarStyle(
        readStored(SCROLLBAR_STYLE_KEY, SCROLLBAR_STYLE_DEFAULT),
      ),
    );
    setElasticScrollPreferences(readElasticScrollPreferences());
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

  useEffect(() => {
    if (!storageReady) return;
    persistElasticScrollPreferences(elasticScrollPreferences);
  }, [elasticScrollPreferences, storageReady]);

  const selectedStyleLabel =
    SCROLLBAR_STYLES.find(({ id }) => id === scrollbarStyle)?.label ?? "Theme";
  const selectedElasticAppearanceLabel =
    ELASTIC_SCROLL_APPEARANCES.find(
      ({ id }) => id === elasticScrollPreferences.appearance,
    )?.label ?? "2D";
  const selectedElasticIconLabel =
    ELASTIC_SCROLL_ICONS.find(
      ({ id }) => id === elasticScrollPreferences.icon,
    )?.label ?? "Classic arrow";

  return (
    <>
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
            note="Display content scrollbar controls alongside wheel, touch, and keyboard scrolling"
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

      <section className="settings-section">
        <div className="settings-section__heading-row">
          <div>
            <h2>Elastic scroller</h2>
            <p>
              Customize the floating drag control that appears while scrolling
              long lists.
            </p>
          </div>
          <span className="settings-section__count" aria-live="polite">
            {selectedElasticAppearanceLabel} · {selectedElasticIconLabel}
          </span>
        </div>

        <div className="mt-5">
          <div className="mb-3">
            <h3 className="m-0 text-sm font-semibold tracking-[-0.015em] text-(--text)">
              Control depth
            </h3>
            <p className="mt-1 mb-0 text-xs leading-5 text-(--muted)">
              Keep the original flat design or use the raised control and
              recessed socket.
            </p>
          </div>
          <RadioGroup
            label="Elastic scroller depth"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {ELASTIC_SCROLL_APPEARANCES.map(({ id, label, note }) => (
              <ChoiceCard
                key={id}
                checked={elasticScrollPreferences.appearance === id}
                onChange={() =>
                  setElasticScrollPreferences((current) => ({
                    ...current,
                    appearance: id,
                  }))
                }
                label={label}
                note={note}
                preview={
                  <ElasticScrollAppearancePreview
                    appearance={id}
                    icon={elasticScrollPreferences.icon}
                  />
                }
                className="min-h-44"
              />
            ))}
          </RadioGroup>
        </div>

        <div className="mt-6">
          <div className="mb-3">
            <h3 className="m-0 text-sm font-semibold tracking-[-0.015em] text-(--text)">
              Direction icon
            </h3>
            <p className="mt-1 mb-0 text-xs leading-5 text-(--muted)">
              Choose the symbol that points toward the available scroll
              direction.
            </p>
          </div>
          <RadioGroup
            label="Elastic scroll direction icon"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {ELASTIC_SCROLL_ICONS.map(({ id, label, note }) => (
              <ChoiceCard
                key={id}
                checked={elasticScrollPreferences.icon === id}
                onChange={() =>
                  setElasticScrollPreferences((current) => ({
                    ...current,
                    icon: id,
                  }))
                }
                label={label}
                note={note}
                preview={<ElasticScrollIconPreview icon={id} />}
                className="min-h-36"
              />
            ))}
          </RadioGroup>
        </div>

        <div className="mt-6">
          <div className="mb-3">
            <h3 className="m-0 text-sm font-semibold tracking-[-0.015em] text-(--text)">
              Speed lock gestures
            </h3>
            <p className="mt-1 mb-0 text-xs leading-5 text-(--muted)">
              Choose the horizontal directions for docking and releasing a
              speed. Vertical movement always controls speed and direction.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-2">
                <h4 className="m-0 text-xs font-semibold text-(--text)">
                  Lock side
                </h4>
                <p className="mt-1 mb-0 text-xs leading-5 text-(--muted)">
                  Cross this side while dragging, then release to keep
                  scrolling.
                </p>
              </div>
              <RadioGroup
                label="Elastic scroll lock side"
                className="grid grid-cols-2 gap-3"
              >
                {ELASTIC_SCROLL_GESTURE_SIDES.map(({ id, label }) => (
                  <ChoiceCard
                    key={id}
                    checked={elasticScrollPreferences.lockSide === id}
                    onChange={() =>
                      setElasticScrollPreferences((current) => ({
                        ...current,
                        lockSide: id,
                      }))
                    }
                    label={label}
                    note={`Drag ${id} to lock`}
                    preview={
                      <ElasticScrollGesturePreview side={id} action="lock" />
                    }
                    className="min-h-30"
                  />
                ))}
              </RadioGroup>
            </div>

            <div>
              <div className="mb-2">
                <h4 className="m-0 text-xs font-semibold text-(--text)">
                  Unlock side
                </h4>
                <p className="mt-1 mb-0 text-xs leading-5 text-(--muted)">
                  Cross this side while locked, then release to stop.
                </p>
              </div>
              <RadioGroup
                label="Elastic scroll unlock side"
                className="grid grid-cols-2 gap-3"
              >
                {ELASTIC_SCROLL_GESTURE_SIDES.map(({ id, label }) => (
                  <ChoiceCard
                    key={id}
                    checked={elasticScrollPreferences.unlockSide === id}
                    onChange={() =>
                      setElasticScrollPreferences((current) => ({
                        ...current,
                        unlockSide: id,
                      }))
                    }
                    label={label}
                    note={`Drag ${id} to unlock`}
                    preview={
                      <ElasticScrollGesturePreview
                        side={id}
                        action="unlock"
                      />
                    }
                    className="min-h-30"
                  />
                ))}
              </RadioGroup>
            </div>
          </div>
        </div>

        <div className="settings-row-list mt-5">
          <SettingRow
            icon={ArrowsDownUp}
            label="Animate direction changes"
            note="Rotate the icon when direction changes. Keep this off to switch instantly"
          >
            <SettingsToggle
              checked={elasticScrollPreferences.animateIcon}
              onChange={(animateIcon) =>
                setElasticScrollPreferences((current) => ({
                  ...current,
                  animateIcon,
                }))
              }
              label="Animate direction changes"
            />
          </SettingRow>
        </div>
      </section>
    </>
  );
}
