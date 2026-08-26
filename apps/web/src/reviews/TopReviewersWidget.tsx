import { StarIcon as Star } from "@phosphor-icons/react/Star";
import type { TopReviewer } from "./reviewsData";

export interface TopReviewersWidgetProps {
  reviewers: readonly TopReviewer[];
  onSelectReviewer?: (reviewerName: string) => void;
  onViewAll?: () => void;
}

export function TopReviewersWidget({
  reviewers,
  onSelectReviewer,
  onViewAll,
}: TopReviewersWidgetProps) {
  return (
    <section
      aria-labelledby="top-reviewers-heading"
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between">
        <h3
          id="top-reviewers-heading"
          className="font-bold text-base text-(--text) tracking-tight"
        >
          Top reviewers
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

      <div className="mt-4 flex flex-col gap-2.5">
        {reviewers.map((reviewer) => (
          <div
            key={reviewer.id}
            onClick={() => onSelectReviewer?.(reviewer.name)}
            className="flex items-center justify-between gap-3 rounded-xl p-2 transition-colors hover:bg-(--hover) cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={reviewer.avatarUrl}
                alt={reviewer.name}
                className="h-8 w-8 rounded-full object-cover border border-(--border) bg-(--surface-strong)"
                loading="lazy"
              />
              <div className="min-w-0">
                <div className="truncate font-bold text-xs md:text-sm text-(--text)">
                  {reviewer.name}
                </div>
                <div className="text-xs text-(--muted)">
                  {reviewer.reviewCount} reviews
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold text-(--text) shrink-0">
              <Star size={13} weight="fill" className="text-(--accent)" />
              <span>{reviewer.rating.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
