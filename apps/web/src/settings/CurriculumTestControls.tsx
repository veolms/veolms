import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { FlaskIcon as Flask } from "@phosphor-icons/react/Flask";
import { ThemedSelect } from "../ThemedSelect";
import {
  CURRICULUM_LECTURE_COUNT_MAX,
  CURRICULUM_LECTURE_COUNT_MIN,
  CURRICULUM_LECTURE_COUNT_PRESETS,
  CURRICULUM_SECTION_COUNT_MAX,
  CURRICULUM_SECTION_COUNT_MIN,
  CURRICULUM_SECTION_COUNT_PRESETS,
  CURRICULUM_TEST_PREFERENCES_DEFAULTS,
} from "../learning/curriculumTestPreferences";
import type { CurriculumTestPreferences } from "../learning/curriculumTestPreferences";
import { useCurriculumTestPreferences } from "../learning/useCurriculumTestPreferences";

type CurriculumCountKey = keyof CurriculumTestPreferences;

interface CurriculumCountFieldProps {
  id: string;
  label: string;
  note: string;
  value: number;
  minimum: number;
  maximum: number;
  presets: readonly number[];
  onCommit: (value: number) => void;
}

function CurriculumCountField({
  id,
  label,
  note,
  value,
  minimum,
  maximum,
  presets,
  onCommit,
}: CurriculumCountFieldProps) {
  const [draftValue, setDraftValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedPreset = presets.includes(value) ? String(value) : "custom";
  const presetOptions = [
    ...presets.map(
      (preset) =>
        [
          String(preset),
          `${preset.toLocaleString()} ${label.toLowerCase()}`,
        ] as const,
    ),
    ["custom", "Custom"] as const,
  ];

  useEffect(() => setDraftValue(String(value)), [value]);

  const commitDraft = () => {
    const normalizedValue = Math.min(
      maximum,
      Math.max(minimum, Math.round(Number(draftValue) || minimum)),
    );
    setDraftValue(String(normalizedValue));
    onCommit(normalizedValue);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key !== "Escape") return;
    setDraftValue(String(value));
    event.currentTarget.blur();
  };

  return (
    <div className="grid gap-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] py-3 first:border-t-0 first:pt-1 last:pb-1 sm:grid-cols-[minmax(0,1fr)_minmax(230px,0.8fr)] sm:items-center sm:gap-5">
      <div className="grid min-w-0 gap-1">
        <label
          htmlFor={`${id}-custom`}
          className="text-xs font-semibold text-(--text)"
        >
          {label}
        </label>
        <span
          id={`${id}-description`}
          className="text-[0.68rem] leading-relaxed text-(--muted)"
        >
          {note}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
        <div className="grid gap-1.5">
          <span className="text-[0.64rem] font-semibold text-(--text-secondary)">
            Preset
          </span>
          <ThemedSelect
            id={`${id}-preset`}
            value={selectedPreset}
            ariaLabel={`${label} preset`}
            options={presetOptions}
            onValueChange={(nextValue) => {
              if (nextValue === "custom") {
                window.requestAnimationFrame(() =>
                  window.requestAnimationFrame(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                  }),
                );
                return;
              }
              onCommit(Number(nextValue));
            }}
            triggerClassName="h-9 px-3 text-[0.7rem]"
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-[0.64rem] font-semibold text-(--text-secondary)">
            Custom
          </span>
          <input
            ref={inputRef}
            id={`${id}-custom`}
            type="number"
            inputMode="numeric"
            min={minimum}
            max={maximum}
            step={1}
            value={draftValue}
            aria-describedby={`${id}-description ${id}-range`}
            className="h-9 min-w-0 rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_74%,var(--surface))] px-3 text-right text-xs font-semibold text-(--text) outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:bg-[color-mix(in_srgb,var(--canvas)_66%,var(--accent-soft))] focus:border-(--accent) focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_24%,transparent)]"
            onChange={(event) => setDraftValue(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={handleInputKeyDown}
            onWheel={(event) => event.currentTarget.blur()}
          />
          <span id={`${id}-range`} className="sr-only">
            Enter a value from {minimum} to {maximum}.
          </span>
        </div>
      </div>
    </div>
  );
}

export function CurriculumTestControls() {
  const { preferences, savePreferences } = useCurriculumTestPreferences();

  const updateCount = (key: CurriculumCountKey, value: number) => {
    savePreferences({ ...preferences, [key]: value });
  };

  const reset = () => {
    savePreferences(CURRICULUM_TEST_PREFERENCES_DEFAULTS);
  };

  const isDefault =
    preferences.sectionCount ===
      CURRICULUM_TEST_PREFERENCES_DEFAULTS.sectionCount &&
    preferences.lectureCount ===
      CURRICULUM_TEST_PREFERENCES_DEFAULTS.lectureCount;

  return (
    <section
      className="settings-learning-card col-span-full"
      aria-labelledby="curriculum-test-data-heading"
    >
      <header className="settings-learning-card__heading mb-1! flex-wrap">
        <Flask size={21} weight="duotone" />
        <h3 id="curriculum-test-data-heading">Curriculum test data</h3>
        <span className="ml-auto inline-flex min-h-6 items-center rounded-full bg-[color-mix(in_srgb,var(--warning)_12%,var(--surface))] px-2.5 text-[0.62rem] font-bold text-[color-mix(in_srgb,var(--warning)_82%,var(--text))]">
          Temporary
        </span>
      </header>
      <p className="mb-3 max-w-[68ch] text-[0.7rem] leading-relaxed text-(--muted)">
        Resize the generated course outline for scroll and performance testing.
        These values last only for this browser session.
      </p>

      <div className="grid min-w-0">
        <CurriculumCountField
          id="learning-test-section-count"
          label="Sections"
          note="Controls how many section groups appear in course content."
          value={preferences.sectionCount}
          minimum={CURRICULUM_SECTION_COUNT_MIN}
          maximum={CURRICULUM_SECTION_COUNT_MAX}
          presets={CURRICULUM_SECTION_COUNT_PRESETS}
          onCommit={(sectionCount) => updateCount("sectionCount", sectionCount)}
        />
        <CurriculumCountField
          id="learning-test-lecture-count"
          label="Lectures"
          note="Distributes this many generated lectures across the sections."
          value={preferences.lectureCount}
          minimum={CURRICULUM_LECTURE_COUNT_MIN}
          maximum={CURRICULUM_LECTURE_COUNT_MAX}
          presets={CURRICULUM_LECTURE_COUNT_PRESETS}
          onCommit={(lectureCount) => updateCount("lectureCount", lectureCount)}
        />
      </div>

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] pt-3">
        <p
          className="m-0 text-[0.68rem] font-semibold text-(--text-secondary)"
          role="status"
          aria-live="polite"
        >
          Learning screen: {preferences.sectionCount.toLocaleString()} sections
          · {preferences.lectureCount.toLocaleString()} lectures
        </p>
        <button
          type="button"
          disabled={isDefault}
          className="inline-flex min-h-8 items-center gap-2 rounded-lg px-3 text-[0.68rem] font-semibold text-(--text-secondary) transition-[color,background-color] duration-150 hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-45"
          onClick={reset}
        >
          <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
          Reset test data
        </button>
      </footer>
    </section>
  );
}
