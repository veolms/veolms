import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import type { HighlightItem } from "./reviewsData";

export interface ReviewHighlightsWidgetProps {
  highlights: readonly HighlightItem[];
}

export function ReviewHighlightsWidget({
  highlights,
}: ReviewHighlightsWidgetProps) {
  const getIcon = (type: HighlightItem["iconType"]) => {
    switch (type) {
      case "recommend":
        return <ThumbsUp size={18} weight="fill" className="text-(--accent)" />;
      case "verified":
        return <ShieldCheck size={18} weight="fill" className="text-emerald-500" />;
      case "replies":
        return <ChatCircleDots size={18} weight="fill" className="text-blue-400" />;
    }
  };

  const getIconBackground = (type: HighlightItem["iconType"]) => {
    switch (type) {
      case "recommend":
        return "bg-(--accent-soft)";
      case "verified":
        return "bg-emerald-500/10";
      case "replies":
        return "bg-blue-500/10";
    }
  };

  return (
    <section
      aria-labelledby="review-highlights-heading"
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <h3
        id="review-highlights-heading"
        className="font-bold text-base text-(--text) tracking-tight"
      >
        Highlights
      </h3>

      <div className="mt-4 flex flex-col gap-3.5">
        {highlights.map((item) => (
          <div key={item.id} className="flex items-start gap-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${getIconBackground(
                item.iconType,
              )}`}
              aria-hidden="true"
            >
              {getIcon(item.iconType)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-(--text) leading-tight">
                {item.value}
              </div>
              <div className="text-xs text-(--muted) mt-0.5 leading-snug">
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
