import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { DotsNineIcon as DotsNine } from "@phosphor-icons/react/DotsNine";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { GrainsIcon as Grains } from "@phosphor-icons/react/Grains";
import { ThermometerSimpleIcon as ThermometerSimple } from "@phosphor-icons/react/ThermometerSimple";
import { AppSlider } from "../AppSlider";
import { ThemedSelect } from "../ThemedSelect";
import {
  getReadingModeVisuals,
  persistReadingModePreferences,
  READING_MODE_CHANGE_EVENT,
  READING_MODE_DEFAULTS,
  READING_MODE_STORAGE_KEY,
  readReadingModePreferences,
} from "../reading-mode/readingModePreferences";
import type { ReadingModePreferences } from "../reading-mode/readingModePreferences";
import {
  getReadingModeTemperatureLabel,
  READING_MODE_COLOR_LABELS,
  READING_MODE_COLOR_OPTIONS,
} from "../reading-mode/readingModeUi";
import {
  clickContainedSettingsToggle,
  SettingRow,
  SettingsToggle,
} from "./SettingsControls";

type ReadingModePreviewStyle = CSSProperties & {
  "--reading-mode-preview-texture-opacity": string;
  "--reading-mode-preview-temperature-color": string;
  "--reading-mode-preview-temperature-opacity": string;
};

interface ReadingModeRangeProps {
  id: string;
  label: string;
  value: number;
  kind: "temperature" | "texture" | "grain-size";
  onChange: (value: number) => void;
}

function ReadingModeRange({
  id,
  label,
  value,
  kind,
  onChange,
}: ReadingModeRangeProps) {
  const valueText =
    kind === "temperature"
      ? getReadingModeTemperatureLabel(value)
      : kind === "texture"
        ? `${value}% texture`
        : `${value}% grain size`;

  return (
    <div className={`settings-reading-mode__range is-${kind}`}>
      <div className="settings-reading-mode__range-value" aria-hidden="true">
        <span>
          {kind === "temperature"
            ? "Cool to warm"
            : kind === "texture"
              ? "Paper grain"
              : "Grain scale"}
        </span>
        <output htmlFor={id}>
          {kind === "temperature" ? valueText : `${value}%`}
        </output>
      </div>
      <AppSlider
        id={id}
        min="0"
        max="100"
        step="1"
        value={value}
        variant={kind === "temperature" ? "temperature" : "accent"}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="settings-reading-mode__range-labels" aria-hidden="true">
        {kind === "temperature" ? (
          <>
            <span>Cool</span>
            <span>Neutral</span>
            <span>Warm</span>
          </>
        ) : kind === "texture" ? (
          <>
            <span>None</span>
            <span>Fine</span>
            <span>Paper</span>
          </>
        ) : (
          <>
            <span>Fine</span>
            <span>Default</span>
            <span>Coarse</span>
          </>
        )}
      </div>
    </div>
  );
}

function ReadingModePreview({
  preferences,
}: {
  preferences: ReadingModePreferences;
}) {
  const visuals = getReadingModeVisuals(preferences);
  const style = {
    "--reading-mode-preview-texture-opacity":
      visuals.textureOpacityDark.toFixed(5),
    "--reading-mode-preview-temperature-color": visuals.temperatureColor,
    "--reading-mode-preview-temperature-opacity":
      visuals.temperatureOpacity.toFixed(5),
  } as ReadingModePreviewStyle;

  return (
    <div className="settings-reading-mode__preview-block">
      <div className="settings-reading-mode__preview-heading">
        <strong>Live preview</strong>
        <span>{preferences.enabled ? "Applied to app" : "Preview only"}</span>
      </div>
      <div
        className="settings-reading-mode__preview"
        data-reading-mode-colors={preferences.colors}
        style={style}
        role="img"
        aria-label={`Reading mode preview: ${getReadingModeTemperatureLabel(preferences.colorTemperature)}, ${preferences.texture}% texture, ${preferences.textureGrainSize}% grain size, ${READING_MODE_COLOR_LABELS[preferences.colors]}`}
      >
        <div
          className="settings-reading-mode__preview-scene"
          aria-hidden="true"
        >
          <span className="settings-reading-mode__preview-rail">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="settings-reading-mode__preview-content">
            <b>Reading mode</b>
            <small>Comfortable focus across every lesson</small>
            <span>
              <i />
              <i />
              <i />
            </span>
          </span>
        </div>
        <span
          className="settings-reading-mode__preview-texture"
          aria-hidden="true"
        />
        <span
          className="settings-reading-mode__preview-temperature"
          aria-hidden="true"
        />
      </div>
      <p>
        Tune the preview first, then enable reading mode when it feels right.
      </p>
    </div>
  );
}

export function ReadingModeSettings() {
  const [preferences, setPreferences] = useState({ ...READING_MODE_DEFAULTS });

  useEffect(() => {
    const syncPreferences = () => {
      setPreferences(readReadingModePreferences());
    };
    syncPreferences();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === READING_MODE_STORAGE_KEY || event.key === null) {
        syncPreferences();
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(READING_MODE_CHANGE_EVENT, syncPreferences);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(READING_MODE_CHANGE_EVENT, syncPreferences);
    };
  }, []);

  const updatePreferences = (updates: Partial<ReadingModePreferences>) => {
    setPreferences(
      persistReadingModePreferences({ ...preferences, ...updates }),
    );
  };
  const restoreDefaults = () => {
    setPreferences(
      persistReadingModePreferences({
        ...preferences,
        colorTemperature: READING_MODE_DEFAULTS.colorTemperature,
        texture: READING_MODE_DEFAULTS.texture,
        textureGrainSize: READING_MODE_DEFAULTS.textureGrainSize,
      }),
    );
  };
  const slidersAreDefault =
    preferences.colorTemperature === READING_MODE_DEFAULTS.colorTemperature &&
    preferences.texture === READING_MODE_DEFAULTS.texture &&
    preferences.textureGrainSize === READING_MODE_DEFAULTS.textureGrainSize;

  return (
    <section className="settings-section settings-reading-mode">
      <div
        className="settings-reading-mode__heading"
        onClick={clickContainedSettingsToggle}
      >
        <div>
          <h2>Reading mode</h2>
          <p>Shift the display tone and tune a paper-like grain.</p>
        </div>
        <SettingsToggle
          checked={preferences.enabled}
          label={`Turn reading mode ${preferences.enabled ? "off" : "on"}`}
          onChange={(enabled) => updatePreferences({ enabled })}
        />
      </div>

      <ReadingModePreview preferences={preferences} />

      <div className="settings-row-list settings-reading-mode__controls">
        <SettingRow
          icon={Eye}
          label="Reading mode"
          note="Apply your selected temperature, texture, and colors across the application"
        >
          <SettingsToggle
            checked={preferences.enabled}
            onChange={(enabled) => updatePreferences({ enabled })}
            label="Reading mode"
          />
        </SettingRow>
        <SettingRow
          className="settings-row--reading-range"
          icon={ThermometerSimple}
          label="Color temperature"
          note="Keep neutral at 50, or shift toward a cooler or warmer white point"
        >
          <ReadingModeRange
            id="reading-mode-color-temperature"
            label="Color temperature"
            value={preferences.colorTemperature}
            kind="temperature"
            onChange={(colorTemperature) =>
              updatePreferences({ colorTemperature })
            }
          />
        </SettingRow>
        <SettingRow
          className="settings-row--reading-range"
          icon={Grains}
          label="Texture"
          note="Add fine static grain without softening text, images, or video"
        >
          <ReadingModeRange
            id="reading-mode-texture"
            label="Texture"
            value={preferences.texture}
            kind="texture"
            onChange={(texture) => updatePreferences({ texture })}
          />
        </SettingRow>
        <SettingRow
          className="settings-row--reading-range"
          icon={DotsNine}
          label="Grain size"
          note="Scale the texture from fine speckles to a coarser paper grain"
        >
          <ReadingModeRange
            id="reading-mode-texture-grain-size"
            label="Grain size"
            value={preferences.textureGrainSize}
            kind="grain-size"
            onChange={(textureGrainSize) =>
              updatePreferences({ textureGrainSize })
            }
          />
        </SettingRow>
      </div>

      <div className="settings-reading-mode__colors-row">
        <label htmlFor="reading-mode-colors">Colors</label>
        <ThemedSelect
          id="reading-mode-colors"
          value={preferences.colors}
          options={READING_MODE_COLOR_OPTIONS}
          ariaLabel="Reading mode colors"
          triggerClassName="settings-reading-mode__colors-select"
          contentClassName="settings-reading-mode__colors-menu"
          onValueChange={(colors) => updatePreferences({ colors })}
        />
      </div>

      <button
        type="button"
        className="settings-reading-mode__restore"
        disabled={slidersAreDefault}
        onClick={restoreDefaults}
      >
        <ArrowCounterClockwise size={17} weight="bold" />
        Restore defaults
      </button>
    </section>
  );
}
