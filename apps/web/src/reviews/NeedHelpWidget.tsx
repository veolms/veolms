import { HeadsetIcon as Headset } from "@phosphor-icons/react/Headset";
import { ElevatedCard } from "../components/ElevatedCard";

export interface NeedHelpWidgetProps {
  onContactSupport: () => void;
}

export function NeedHelpWidget({ onContactSupport }: NeedHelpWidgetProps) {
  return (
    <ElevatedCard
      aria-labelledby="need-help-heading"
      className="p-5 md:p-6 transition-all"
    >
      <h3
        id="need-help-heading"
        className="font-bold text-base text-(--text) tracking-tight"
      >
        Need help?
      </h3>

      <p className="mt-2 text-xs leading-relaxed text-(--muted)">
        If you have any concerns, please contact our support team.
      </p>

      <button
        type="button"
        onClick={onContactSupport}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-(--border) bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] py-2.5 px-3 text-xs md:text-sm font-semibold text-(--text) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all hover:bg-(--hover) cursor-pointer"
      >
        <Headset size={17} />
        <span>Contact support</span>
      </button>
    </ElevatedCard>
  );
}
