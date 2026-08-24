import { Star } from "@phosphor-icons/react/Star";
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
      className="rounded-[18px] border border-[var(--border)] bg-[var(--card-surface)] p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between">
        <h3
          id="top-reviewers-heading"
          className="font-bold text-base text-[var(--text)] tracking-tight"
        >
          Top reviewers
        </h3>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-[var(--accent)] hover:underline cursor-pointer"
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
            className="flex items-center justify-between gap-3 rounded-[12px] p-2 transition-colors hover:bg-[var(--hover)] cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={reviewer.avatarUrl}
                alt={reviewer.name}
                className="h-8 w-8 rounded-full object-cover border border-[var(--border)] bg-[var(--surface-strong)]"
                loading="lazy"
              />
              <div className="min-w-0">
                <div className="truncate font-bold text-xs md:text-sm text-[var(--text)]">
                  {reviewer.name}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {reviewer.reviewCount} reviews
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold text-[var(--text)] flex-shrink-0">
              <Star size={13} weight="fill" className="text-[var(--accent)]" />
              <span>{reviewer.rating.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
