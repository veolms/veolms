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
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 transition-all md:p-6"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between">
        <h3 id="top-reviewers-heading" className="text-base font-bold tracking-tight text-(--text)">
          Top reviewers
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

      <div className="mt-4 flex flex-col gap-2.5">
        {reviewers.map((reviewer) => (
          <div
            key={reviewer.id}
            onClick={() => onSelectReviewer?.(reviewer.name)}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl p-2 transition-colors hover:bg-(--hover)"
          >
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={reviewer.avatarUrl}
                alt={reviewer.name}
                className="h-8 w-8 rounded-full border border-(--border) bg-(--surface-strong) object-cover"
                loading="lazy"
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-(--text) md:text-sm">
                  {reviewer.name}
                </div>
                <div className="text-xs text-(--muted)">{reviewer.reviewCount} reviews</div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 text-xs font-bold text-(--text)">
              <Star size={13} weight="fill" className="text-(--accent)" />
              <span>{reviewer.rating.toFixed(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
