import { Headset } from "@phosphor-icons/react/Headset";

export interface NeedHelpWidgetProps {
  onContactSupport: () => void;
}

export function NeedHelpWidget({ onContactSupport }: NeedHelpWidgetProps) {
  return (
    <section
      aria-labelledby="need-help-heading"
      className="rounded-[18px] border border-[var(--border)] bg-[var(--card-surface)] p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <h3
        id="need-help-heading"
        className="font-bold text-base text-[var(--text)] tracking-tight"
      >
        Need help?
      </h3>

      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        If you have any concerns, please contact our support team.
      </p>

      <button
        type="button"
        onClick={onContactSupport}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] py-2.5 px-3 text-xs md:text-sm font-semibold text-[var(--text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all hover:bg-[var(--hover)] cursor-pointer"
      >
        <Headset size={17} />
        <span>Contact support</span>
      </button>
    </section>
  );
}
