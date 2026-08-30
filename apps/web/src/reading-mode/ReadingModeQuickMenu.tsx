import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { AppSlider } from "../AppSlider";
import { ThemedSelect } from "../ThemedSelect";
import {
  clickContainedSettingsToggle,
  SettingsToggle,
} from "../settings/SettingsControls";
import type { ReadingModePreferences } from "./readingModePreferences";
import {
  getReadingModeTemperatureLabel,
  READING_MODE_COLOR_OPTIONS,
} from "./readingModeUi";

interface ReadingModeQuickMenuProps {
  id: string;
  className?: string;
  preferences: ReadingModePreferences;
  onChange: (preferences: Partial<ReadingModePreferences>) => void;
}

export function ReadingModeQuickMenu({
  id,
  className = "",
  preferences,
  onChange,
}: ReadingModeQuickMenuProps) {
  const temperatureLabel = getReadingModeTemperatureLabel(
    preferences.colorTemperature,
  );

  return (
    <section
      id={id}
      className={`reading-mode-quick-menu ${className}`.trim()}
      role="dialog"
      aria-label="Reading mode quick settings"
      data-reading-mode-menu
      onContextMenu={(event) => event.preventDefault()}
    >
      <header
        className="reading-mode-quick-menu__header"
        onClick={clickContainedSettingsToggle}
      >
        <span className="reading-mode-quick-menu__icon" aria-hidden="true">
          <Eye size={18} weight={preferences.enabled ? "fill" : "regular"} />
        </span>
        <span>
          <strong>Reading mode</strong>
          <small>
            {preferences.enabled ? "Applied to app" : "Preview only"}
          </small>
        </span>
        <SettingsToggle
          checked={preferences.enabled}
          onChange={(enabled) => onChange({ enabled })}
          label={`Turn reading mode ${preferences.enabled ? "off" : "on"}`}
        />
      </header>

      <div className="reading-mode-quick-menu__control">
        <div className="reading-mode-quick-menu__label">
          <label htmlFor={`${id}-temperature`}>Color temperature</label>
          <output htmlFor={`${id}-temperature`}>{temperatureLabel}</output>
        </div>
        <AppSlider
          id={`${id}-temperature`}
          min="0"
          max="100"
          step="1"
          value={preferences.colorTemperature}
          variant="temperature"
          aria-label="Quick color temperature"
          aria-valuetext={temperatureLabel}
          onChange={(event) =>
            onChange({ colorTemperature: Number(event.currentTarget.value) })
          }
        />
        <div
          className="reading-mode-quick-menu__range-labels"
          aria-hidden="true"
        >
          <span>Cool</span>
          <span>Neutral</span>
          <span>Warm</span>
        </div>
      </div>

      <div className="reading-mode-quick-menu__control">
        <div className="reading-mode-quick-menu__label">
          <label htmlFor={`${id}-texture`}>Texture</label>
          <output htmlFor={`${id}-texture`}>{preferences.texture}%</output>
        </div>
        <AppSlider
          id={`${id}-texture`}
          min="0"
          max="100"
          step="1"
          value={preferences.texture}
          aria-label="Quick texture"
          aria-valuetext={`${preferences.texture}% texture`}
          onChange={(event) =>
            onChange({ texture: Number(event.currentTarget.value) })
          }
        />
        <div
          className="reading-mode-quick-menu__range-labels"
          aria-hidden="true"
        >
          <span>None</span>
          <span>Fine</span>
          <span>Paper</span>
        </div>
      </div>

      <div className="reading-mode-quick-menu__colors">
        <label htmlFor={`${id}-colors`}>Colors</label>
        <ThemedSelect
          id={`${id}-colors`}
          value={preferences.colors}
          options={READING_MODE_COLOR_OPTIONS}
          ariaLabel="Quick reading mode colors"
          triggerClassName="reading-mode-quick-menu__select"
          contentClassName="reading-mode-quick-menu__select-menu"
          onValueChange={(colors) => onChange({ colors })}
        />
      </div>
    </section>
  );
}
