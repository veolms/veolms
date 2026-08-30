import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import type { RatingSummaryData } from "./reviewsData";
import type { RatingFilterOption } from "./useReviewsFilter";

export interface RatingSummaryWidgetProps {
  summary: RatingSummaryData;
  selectedRatingFilter?: RatingFilterOption;
  onSelectRatingFilter?: (rating: RatingFilterOption) => void;
  isCollapsible?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function RatingSummaryWidget({
  summary,
  selectedRatingFilter = "all",
  onSelectRatingFilter,
  isCollapsible = false,
  isExpanded = true,
  onToggleExpand,
}: RatingSummaryWidgetProps) {
  return (
    <section
      aria-labelledby="rating-summary-heading"
      className="rounded-[18px] border border-(--border) bg-(--card-surface) p-5 md:p-6 transition-all"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div
        className={`flex items-center justify-between ${
          isCollapsible ? "cursor-pointer select-none" : ""
        }`}
        onClick={isCollapsible ? onToggleExpand : undefined}
      >
        <h3
          id="rating-summary-heading"
          className="font-bold text-base text-(--text) tracking-tight"
        >
          Rating summary
        </h3>
        {isCollapsible && (
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label="Toggle rating summary breakdown"
            className="text-(--muted) hover:text-(--text) transition-transform"
          >
            <CaretRight
              size={18}
              weight="bold"
              className={`transition-transform duration-200 ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-4">
          {/* Big Score and Stars */}
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-extrabold tracking-tight text-(--text)">
              {summary.averageRating.toFixed(1)}
            </span>
            <div className="flex flex-col gap-0.5">
              <div
                className="flex items-center gap-1 text-(--accent)"
                aria-label={`Average rating ${summary.averageRating} out of 5 stars`}
              >
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Star
                    key={idx}
                    size={16}
                    weight="fill"
                    className="text-(--accent)"
                  />
                ))}
              </div>
              <p className="text-xs text-(--muted)">
                Based on {summary.totalReviews} reviews
              </p>
            </div>
          </div>

          {/* Progress Bars Breakdown */}
          <div className="mt-5 flex flex-col gap-2.5">
            {summary.breakdown.map((row) => {
              const isSelected = selectedRatingFilter === String(row.stars);
              return (
                <button
                  key={row.stars}
                  type="button"
                  onClick={() =>
                    onSelectRatingFilter?.(
                      isSelected ? "all" : (String(row.stars) as RatingFilterOption),
                    )
                  }
                  className={`group flex items-center gap-2 text-xs transition-colors rounded-lg px-2 py-1.5 text-left cursor-pointer ${
                    isSelected
                      ? "bg-(--accent-soft) text-(--accent) font-semibold"
                      : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
                  }`}
                  title={`Filter by ${row.stars} star reviews`}
                >
                  <span className="w-6 font-medium flex items-center gap-0.5">
                    {row.stars} <Star size={11} weight="fill" className="opacity-80" />
                  </span>

                  {/* Progress Bar Container */}
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-(--progress-track,rgba(255,255,255,0.08))">
                    <div
                      className="h-full rounded-full bg-(--accent) transition-all duration-500 ease-out"
                      style={{ width: `${row.percentage}%` }}
                    />
                  </div>

                  <span className="w-8 text-right font-medium text-(--muted) group-hover:text-(--text)">
                    {row.percentage}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
