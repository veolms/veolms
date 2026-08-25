import type { RecentMentionItem } from "./notificationsData";

export interface RecentMentionsWidgetProps {
  mentions: readonly RecentMentionItem[];
  onViewAll?: () => void;
  onSelectMention?: (mention: RecentMentionItem) => void;
}

export function RecentMentionsWidget({
  mentions,
  onViewAll,
  onSelectMention,
}: RecentMentionsWidgetProps) {
  return (
    <section
      aria-labelledby="recent-mentions-heading"
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between">
        <h3
          id="recent-mentions-heading"
          className="font-bold text-base text-(--text) tracking-tight"
        >
          Recent mentions
        </h3>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-(--accent) hover:underline cursor-pointer"
          >
            View all
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {mentions.map((mention) => (
          <div
            key={mention.id}
            onClick={() => onSelectMention?.(mention)}
            className="flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-(--hover) cursor-pointer text-left"
          >
            <img
              src={mention.authorAvatar}
              alt={mention.authorName}
              className="h-9 w-9 rounded-full object-cover border border-(--border) bg-(--surface-strong) shrink-0"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-(--text) truncate">
                  {mention.authorName}
                </span>
                <span className="text-[11px] text-(--muted) shrink-0">
                  {mention.timestamp}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-(--text-secondary) leading-snug line-clamp-2">
                {mention.context}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
