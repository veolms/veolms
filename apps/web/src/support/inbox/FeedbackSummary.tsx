import type { SupportAdminStatsResponse } from "@veolms/contracts/support";

import { ElevatedCard } from "../../components/ElevatedCard";
import {
  FEEDBACK_CATEGORY_ORDER,
  FEEDBACK_STATUS_ORDER,
  RatingFace,
  SUPPORT_CATEGORIES,
  SUPPORT_RATINGS,
  SUPPORT_STATUSES,
} from "../supportCatalog";

const headingClasses =
  "m-0 text-[0.7rem] font-bold tracking-[0.08em] text-(--muted) uppercase";

/** Average rating, how the ratings spread, what it's about and what's left to read. */
export function FeedbackSummary({
  stats,
}: {
  stats: SupportAdminStatsResponse["feedback"] | undefined;
}) {
  const maxRating = Math.max(1, ...(stats?.ratings ?? [0]));
  const maxType = Math.max(
    1,
    ...FEEDBACK_CATEGORY_ORDER.map((value) => stats?.[value as "idea"] ?? 0),
  );
  const average = stats?.averageRating ?? null;
  const averageFace = average === null ? 3 : Math.round(average);
  const averageColor =
    SUPPORT_RATINGS.find((item) => item.value === averageFace)?.color ??
    "var(--muted)";

  return (
    <ElevatedCard
      padded
      className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
    >
      <div className="flex gap-5">
        <div className="flex shrink-0 flex-col items-center justify-center gap-1">
          <span style={{ color: averageColor }}>
            <RatingFace rating={averageFace} size={40} />
          </span>
          <span className="text-3xl font-bold tracking-[-0.03em] text-(--text) tabular-nums">
            {average === null ? "–" : average.toFixed(1)}
          </span>
          <span className="text-xs text-(--muted)">
            of 5 · {stats?.total ?? 0} sent
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <h3 className={headingClasses}>Average rating</h3>
          {[...SUPPORT_RATINGS].reverse().map((item) => {
            const count = stats?.ratings[item.value - 1] ?? 0;
            return (
              <div key={item.value} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-(--text-secondary)">
                  {item.label}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--surface-strong)">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(count / maxRating) * 100}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </span>
                <span className="w-6 text-right text-(--muted) tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={headingClasses}>By type</h3>
        {FEEDBACK_CATEGORY_ORDER.map((value) => {
          const info = SUPPORT_CATEGORIES[value];
          const TypeIcon = info.icon;
          const count = stats?.[value as "idea"] ?? 0;
          return (
            <div key={value} className="flex items-center gap-2 text-xs">
              <TypeIcon
                size={15}
                weight="duotone"
                style={{ color: info.color }}
                aria-hidden="true"
              />
              <span className="w-20 shrink-0 text-(--text-secondary)">
                {info.short}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--surface-strong)">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(count / maxType) * 100}%`,
                    backgroundColor: info.color,
                  }}
                />
              </span>
              <span className="w-6 text-right text-(--muted) tabular-nums">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={headingClasses}>Triage</h3>
        {FEEDBACK_STATUS_ORDER.map((value) => (
          <div key={value} className="flex items-center gap-2 text-sm">
            <span
              className={`size-2 rounded-full ${SUPPORT_STATUSES[value].dot}`}
              aria-hidden="true"
            />
            <span className="flex-1 text-(--text-secondary)">
              {SUPPORT_STATUSES[value].staffLabel}
            </span>
            <span className="font-semibold text-(--text) tabular-nums">
              {stats?.[value] ?? 0}
            </span>
          </div>
        ))}
        <p className="mt-1 mb-0 text-xs text-(--muted)">
          {stats?.contactable === 1
            ? "1 learner is open to a follow-up."
            : `${stats?.contactable ?? 0} learners are open to a follow-up.`}
        </p>
      </div>
    </ElevatedCard>
  );
}
