import { LightbulbIcon as Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { analyticsCardClasses } from "./surfaces";

/**
 * A short list of plain-language callouts derived from the tab's own data:
 * the "Insights" panels of the reference design, without any extra
 * tracking. Renders nothing when there is nothing to say.
 */
export function InsightsPanel({
  insights,
  title = "Insights",
}: {
  insights: string[];
  title?: string;
}) {
  if (insights.length === 0) return null;
  return (
    <section
      data-fixed-radius
      className={`${analyticsCardClasses} p-3.5 sm:p-6`}
    >
      <div className="flex items-center gap-2 sm:gap-2.5">
        <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500">
          <Lightbulb size={16} weight="bold" />
        </span>
        <h3 className="text-sm sm:text-base font-bold tracking-tight text-(--text)">
          {title}
        </h3>
      </div>
      <ul className="mt-3 sm:mt-4 grid gap-2 sm:gap-2.5">
        {insights.map((insight) => (
          <li
            key={insight}
            className="flex items-start gap-2 text-xs sm:text-sm leading-5 text-(--muted)"
          >
            <span
              className="mt-[7px] size-1.5 shrink-0 rounded-full bg-(--accent)"
              aria-hidden="true"
            />
            <span>{insight}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
