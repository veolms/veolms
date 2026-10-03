import { HeadsetIcon as Headset } from "@phosphor-icons/react/Headset";

export interface NeedHelpWidgetProps {
  onContactSupport: () => void;
}

export function NeedHelpWidget({ onContactSupport }: NeedHelpWidgetProps) {
  return (
    <section
      aria-labelledby="need-help-heading"
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 transition-all md:p-6"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <h3 id="need-help-heading" className="text-base font-bold tracking-tight text-(--text)">
        Need help?
      </h3>

      <p className="mt-2 text-xs leading-relaxed text-(--muted)">
        If you have any concerns, please contact our support team.
      </p>

      <button
        type="button"
        onClick={onContactSupport}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 py-2.5 text-xs font-semibold text-(--text) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all hover:bg-(--hover) md:text-sm"
      >
        <Headset size={17} />
        <span>Contact support</span>
      </button>
    </section>
  );
}
