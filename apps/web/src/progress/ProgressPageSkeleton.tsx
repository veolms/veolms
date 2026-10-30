import { ElevatedCard } from "../components/ElevatedCard";
import { progressPageClasses } from "./progressLayout";

const bone =
  "animate-pulse rounded-lg bg-(--text)/8 motion-reduce:animate-none";
// The ring's stand-in: `rounded-lg` would otherwise win over `rounded-full`.
const roundBone =
  "animate-pulse rounded-full bg-(--text)/8 motion-reduce:animate-none";

/**
 * The Progress page before its first answer: the same heading and the
 * same three cards at their usual heights, so the page does not move when
 * the days arrive.
 */
export function ProgressPageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading progress"
      className={progressPageClasses}
    >
      <div className="pt-1">
        <span className={`block h-9 w-44 ${bone}`} />
        <span className={`mt-2.5 block h-4 w-72 max-w-full ${bone}`} />
      </div>
      <ElevatedCard
        as="div"
        className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-10"
      >
        <div className="flex items-center gap-5 sm:gap-6">
          <span className={`size-32 shrink-0 sm:size-36 ${roundBone}`} />
          <span className="flex-1">
            <span className={`block h-3 w-14 ${bone}`} />
            <span className={`mt-3 block h-6 w-40 ${bone}`} />
            <span className={`mt-2.5 block h-4 w-28 ${bone}`} />
          </span>
        </div>
        <div className="flex flex-col">
          <span className={`block h-3 w-20 ${bone}`} />
          <span className={`mt-4 block h-32 ${bone}`} />
          <span className={`mt-2 block h-4 ${bone}`} />
        </div>
      </ElevatedCard>
      <ElevatedCard as="div" className="p-5 sm:p-7">
        <span className={`block h-5 w-36 ${bone}`} />
        <span className={`mt-5 block h-12 ${bone}`} />
        <span className={`mt-6 block h-72 ${bone}`} />
      </ElevatedCard>
      <ElevatedCard as="div" className="p-5 sm:p-7">
        <span className={`block h-5 w-40 ${bone}`} />
        <span className={`mt-2 block h-4 w-72 max-w-full ${bone}`} />
        <span className={`mt-5 block h-28 ${bone}`} />
      </ElevatedCard>
    </div>
  );
}
