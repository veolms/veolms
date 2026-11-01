import {
  eyebrowClasses,
  formatDuration,
  type MonthFigures,
} from "./progressFormat";

function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className={eyebrowClasses}>{label}</dt>
      <dd className="mt-1 text-xl leading-none font-bold tracking-tight text-(--text) tabular-nums sm:text-[1.35rem]">
        {value}
        {detail ? (
          <span className="ml-1.5 text-sm font-medium tracking-normal text-(--muted)">
            {detail}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * The month in four figures. While the month is being fetched the figures
 * stand with a dash in each, so nothing moves when they arrive.
 */
export function ProgressMonthFigures({
  figures,
}: {
  figures: MonthFigures | undefined;
}) {
  const read = (value: (figures: MonthFigures) => string) =>
    figures ? value(figures) : "–";
  return (
    <dl
      aria-busy={!figures}
      className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4"
    >
      <Figure
        label="Days studied"
        value={read((month) => String(month.daysStudied))}
      />
      <Figure
        label="Goals met"
        value={read((month) => String(month.goalsCompleted))}
        detail={
          figures
            ? `of ${figures.daysSoFar} ${figures.daysSoFar === 1 ? "day" : "days"}`
            : undefined
        }
      />
      <Figure
        label="Time learned"
        value={read((month) => formatDuration(month.seconds))}
      />
      <Figure
        label="Lessons finished"
        value={read((month) => String(month.completions))}
      />
    </dl>
  );
}
