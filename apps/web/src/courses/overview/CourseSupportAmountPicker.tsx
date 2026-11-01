import { Heart } from "@phosphor-icons/react/Heart";
import { X } from "@phosphor-icons/react/X";
import { MAX_VOLUNTARY_AMOUNT } from "@veolms/contracts";
import { readCustomAmount } from "../customAmountEntry";
import {
  formatPriceWithCurrency,
  getCurrencySymbol,
} from "./coursePriceFormat";

export type ContributionPresetId = "0" | "100" | "250" | "500" | "custom";

interface CourseSupportAmountPickerProps {
  isFree: boolean;
  /** Catalog charge in major currency units. */
  basePrice: number;
  currency: string;
  selectedPreset: ContributionPresetId;
  voluntaryAmount: number;
  customAmountInput: string;
  /** Why the amount in the custom box cannot be used, when it cannot. */
  customAmountMessage: string | null;
  onSelectPreset: (preset: ContributionPresetId) => void;
  onVoluntaryAmountChange: (amount: number) => void;
  onCustomAmountInputChange: (input: string) => void;
  onCustomAmountErrorChange: (message: string | null) => void;
}

const presetClasses =
  "px-3 py-1.5 rounded-[8px] text-[0.82rem] font-bold border transition-all cursor-pointer";
const idlePresetClasses =
  "bg-[color-mix(in_srgb,var(--surface-strong)_70%,var(--canvas))] text-(--text) border-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] hover:bg-(--hover)";

/**
 * "Support the teacher": lets a buyer pay more than the price, or something
 * for a free course. The amounts it sets are read by the purchase section.
 */
export function CourseSupportAmountPicker({
  isFree,
  basePrice,
  currency,
  selectedPreset,
  voluntaryAmount,
  customAmountInput,
  customAmountMessage,
  onSelectPreset,
  onVoluntaryAmountChange,
  onCustomAmountInputChange,
  onCustomAmountErrorChange,
}: CourseSupportAmountPickerProps) {
  const price = (amount: number) => formatPriceWithCurrency(amount, currency);
  const totalIsShown = voluntaryAmount > (isFree ? 0 : basePrice);
  const presets: { id: ContributionPresetId; label: string; value: number }[] =
    isFree
      ? [
          { id: "0", label: `Free (${price(0)})`, value: 0 },
          { id: "100", label: price(100), value: 100 },
          { id: "250", label: price(250), value: 250 },
          { id: "500", label: price(500), value: 500 },
          { id: "custom", label: "Custom", value: -1 },
        ]
      : [
          { id: "0", label: `Regular (${price(basePrice)})`, value: 0 },
          ...[100, 250, 500].map((extra) => ({
            id: String(extra) as ContributionPresetId,
            label: `+${price(extra)} (${price(basePrice + extra)})`,
            value: basePrice + extra,
          })),
          { id: "custom", label: "Custom", value: -1 },
        ];

  return (
    <div className="flex flex-col gap-2 border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-3">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[0.8rem] font-bold tracking-wider text-(--text) uppercase">
          <Heart
            size={14}
            weight="fill"
            className="text-rose-500"
            aria-hidden="true"
          />
          <span>Support Teacher (Optional)</span>
        </span>
        <span
          // Kept in the layout while hidden so the row does not jump; hidden
          // from assistive technology too, which otherwise read out a stale
          // "₹0 Total".
          aria-hidden={!totalIsShown}
          className={`rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-500 transition-opacity duration-150 ${
            totalIsShown ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {price(voluntaryAmount)} Total
        </span>
      </div>
      <p className="m-0 text-[0.8rem] leading-snug text-(--muted)">
        {isFree
          ? "This course is free. If you'd like to support the instructor, you can optionally contribute any amount."
          : `You can optionally pay more than the regular price (${price(basePrice)}) to support the instructor.`}
      </p>

      <div className="flex min-h-8 flex-wrap items-center gap-1.5">
        {presets.map((preset) => {
          if (preset.id !== "custom") {
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onSelectPreset(preset.id);
                  onVoluntaryAmountChange(preset.value);
                  onCustomAmountInputChange("");
                  onCustomAmountErrorChange(null);
                }}
                className={`${presetClasses} ${
                  selectedPreset === preset.id
                    ? "border-(--accent) bg-(--accent) text-(--on-accent,#ffffff) shadow-xs"
                    : idlePresetClasses
                }`}
              >
                {preset.label}
              </button>
            );
          }

          if (selectedPreset !== "custom") {
            return (
              <button
                key="custom-btn"
                type="button"
                onClick={() => {
                  onSelectPreset("custom");
                  const entry = readCustomAmount(
                    customAmountInput,
                    MAX_VOLUNTARY_AMOUNT,
                  );
                  onVoluntaryAmountChange(
                    entry.kind === "amount" ? entry.amount : 0,
                  );
                }}
                className={`${presetClasses} ${idlePresetClasses}`}
              >
                Custom
              </button>
            );
          }

          return (
            <div
              key="custom-input-pill"
              className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-(--accent) bg-[color-mix(in_srgb,var(--surface-strong)_85%,var(--canvas))] px-2.5 transition-all focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
            >
              <span className="text-xs font-bold text-(--accent)">
                {getCurrencySymbol(currency)}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={customAmountInput}
                aria-label="Custom amount"
                aria-invalid={Boolean(customAmountMessage)}
                onBlur={() => onCustomAmountErrorChange(null)}
                onChange={(e) => {
                  const typed = e.target.value;
                  const entry = readCustomAmount(typed, MAX_VOLUNTARY_AMOUNT);
                  if (entry.kind !== "amount") {
                    // Empty, or not an amount. The box shows what was typed
                    // and no amount is taken from it; the purchase section
                    // holds the button and shows the reason.
                    onCustomAmountInputChange(
                      entry.kind === "empty" ? "" : typed,
                    );
                    onVoluntaryAmountChange(0);
                    onCustomAmountErrorChange(null);
                    return;
                  }
                  onCustomAmountInputChange(String(entry.amount));
                  onVoluntaryAmountChange(entry.amount);
                  onCustomAmountErrorChange(
                    entry.overMaximum
                      ? `The most you can pay here is ${price(MAX_VOLUNTARY_AMOUNT)}.`
                      : null,
                  );
                }}
                placeholder={isFree ? "Amount" : `>= ${basePrice}`}
                className="w-24 border-0 bg-transparent text-[0.82rem] font-bold text-(--text) placeholder-(--muted) outline-none"
                autoFocus
              />
              {customAmountInput && (
                <button
                  type="button"
                  onClick={() => {
                    onCustomAmountInputChange("");
                    onVoluntaryAmountChange(0);
                    onCustomAmountErrorChange(null);
                  }}
                  aria-label="Clear custom amount"
                  className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-(--muted) hover:text-(--text)"
                >
                  <X size={11} weight="bold" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {customAmountMessage && (
        <p role="alert" className="m-0 text-xs font-semibold text-rose-500">
          {customAmountMessage}
        </p>
      )}
    </div>
  );
}
