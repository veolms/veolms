import {
  MARKETING_FONTS,
  MARKETING_THEME_COLORS,
  MARKETING_THEME_LABELS,
  MARKETING_THEMES,
  type MarketingDesign,
  type MarketingFont,
} from "@veolms/contracts";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { TextAlignCenterIcon as TextAlignCenter } from "@phosphor-icons/react/TextAlignCenter";
import { TextAlignLeftIcon as TextAlignLeft } from "@phosphor-icons/react/TextAlignLeft";
import { ColorChoice, SegmentedChoice } from "./MarketingControls";
import { ACCENT_CHOICES } from "./marketingHelpers";

const FONT_LABELS: Record<MarketingFont, string> = {
  modern: "Modern",
  classic: "Classic",
  rounded: "Rounded",
};

/**
 * The email's look: one of the themes, then its accent colour, font and
 * where the logo sits. Every block follows it; a button can still have
 * its own colour.
 */
export function MarketingDesignPanel({
  design,
  onChange,
  disabled = false,
}: {
  design: MarketingDesign;
  onChange: (design: MarketingDesign) => void;
  disabled?: boolean;
}) {
  const theme = MARKETING_THEME_COLORS[design.theme];
  return (
    <div className="grid gap-5">
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      >
        {MARKETING_THEMES.map((key) => {
          const colors = MARKETING_THEME_COLORS[key];
          const accent =
            design.theme === key && design.accent
              ? design.accent
              : colors.accent;
          const selected = design.theme === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange({ ...design, theme: key })}
              className={`group/theme relative grid cursor-pointer gap-2 rounded-xl border bg-transparent p-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                selected
                  ? "border-(--accent) ring-2 ring-(--accent)/25"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-(--accent)/45"
              }`}
            >
              <span
                aria-hidden="true"
                className="block rounded-lg p-2.5"
                style={{ backgroundColor: colors.page }}
              >
                <span
                  className="grid gap-1.5 rounded-md border p-2"
                  style={{
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                  }}
                >
                  <span
                    className="block h-1.5 w-3/4 rounded-full"
                    style={{ backgroundColor: colors.text }}
                  />
                  <span
                    className="block h-1 w-full rounded-full opacity-70"
                    style={{ backgroundColor: colors.muted }}
                  />
                  <span
                    className="block h-1 w-5/6 rounded-full opacity-70"
                    style={{ backgroundColor: colors.muted }}
                  />
                  <span
                    className="mt-0.5 block h-2.5 w-1/2 rounded"
                    style={{ backgroundColor: accent }}
                  />
                </span>
              </span>
              <span className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-[12.5px] font-semibold text-(--text)">
                  {MARKETING_THEME_LABELS[key]}
                </span>
                <span className="text-[11px] text-(--muted)">
                  {colors.scheme === "dark" ? "Dark" : "Light"}
                </span>
              </span>
              {selected ? (
                <span className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-(--accent) text-white">
                  <Check size={12} weight="bold" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <ColorChoice
        label="Accent colour: buttons, links and highlights"
        value={design.accent}
        options={ACCENT_CHOICES}
        onChange={(accent) => onChange({ ...design, accent })}
        defaultColor={theme.accent}
        defaultLabel={`The ${MARKETING_THEME_LABELS[design.theme]} theme's own`}
        disabled={disabled}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <SegmentedChoice
          label="Font"
          showLabel
          value={design.font}
          options={MARKETING_FONTS.map((font) => ({
            value: font,
            label: FONT_LABELS[font],
          }))}
          onChange={(font) => onChange({ ...design, font })}
          disabled={disabled}
        />
        <SegmentedChoice
          label="Logo"
          showLabel
          value={design.headerAlign}
          options={[
            { value: "left", label: "Logo on the left", icon: TextAlignLeft },
            {
              value: "center",
              label: "Logo in the centre",
              icon: TextAlignCenter,
            },
          ]}
          onChange={(headerAlign) => onChange({ ...design, headerAlign })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
