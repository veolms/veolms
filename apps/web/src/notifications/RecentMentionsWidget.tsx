import type { RecentMentionItem } from "./notificationsData";
import { AtIcon as At } from "@phosphor-icons/react/At";

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
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 transition-all md:p-6"
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
            className="cursor-pointer text-xs font-semibold text-(--accent) hover:underline"
          >
            View all
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {mentions.map((mention) => (
          <button
            type="button"
            key={mention.id}
            onClick={() => onSelectMention?.(mention)}
            className="flex w-full cursor-pointer items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-(--hover)"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--border) bg-(--surface-strong) text-purple-400">
              <At size={17} weight="bold" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-(--text) truncate">
                  {mention.title}
                </span>
                <span className="text-[11px] text-(--muted) shrink-0">
                  {mention.timestamp}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-(--text-secondary) leading-snug line-clamp-2">
                {mention.context}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
