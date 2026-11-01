/**
 * What stands in for the dashboard (the home of someone who runs courses)
 * until it can be shown: while the session is checked, the saved view is
 * restored, the dashboard's permission is read and its code arrives.
 *
 * Every block is where the dashboard's own is and the same size, at every
 * page width, so nothing moves when the dashboard takes its place. The
 * dashboard is styled by its own stylesheet, which arrives with its code;
 * this is in the page from the first paint, so its sizes are written out
 * here from that stylesheet (styles/features/creator-dashboard.css). The
 * breakpoints are that stylesheet's, viewport widths written as media
 * queries because they include their upper bound and Tailwind's do not.
 * A change to the dashboard's layout has to be made in both.
 */
const pulse = "animate-pulse motion-reduce:animate-none";
/** What a placeholder is filled with; each one sets its own corners. */
const fill = `${pulse} bg-[color-mix(in_srgb,var(--text)_10%,transparent)]`;
/** A placeholder for a line of text. */
const bar = `${fill} rounded-md`;
/** The surface the dashboard's cards and panels are drawn on. */
const card =
  "min-w-0 rounded-[10px] bg-(--card-surface) shadow-(--card-shadow)";

/** The dashboard's three actions, by the width each one's label gives it. */
const ACTION_WIDTHS = ["w-[105px]", "w-[147px]", "w-[146px]"] as const;

const KPI_CARDS = [0, 1, 2, 3] as const;

/**
 * The dashboard's panels in the order it lays them out, each as tall as the
 * dashboard's is: side by side in two columns on a wide page (a row is as
 * tall as its taller panel), and one under another from 960px down, where
 * each has a height of its own.
 */
const PANELS = [
  {
    name: "revenue",
    size: "h-[423px] [@media(min-width:640.02px)_and_(max-width:960px)]:h-[407.4px] [@media(max-width:640px)]:h-[442.8px]",
  },
  {
    name: "learning",
    size: "h-[423px] [@media(min-width:480.02px)_and_(max-width:640px)]:h-[417px] [@media(max-width:480px)]:h-[397px]",
  },
  {
    name: "courses",
    size: "h-[369px] [@media(max-width:640px)]:h-[363px]",
  },
  {
    name: "discussions",
    size: "h-[369px] [@media(max-width:640px)]:h-[429px]",
  },
  {
    name: "enrollments",
    size: "col-span-full h-[363px] [@media(max-width:640px)]:h-[383px]",
  },
] as const;

export function CreatorDashboardSkeleton() {
  return (
    <div
      data-dashboard-skeleton=""
      role="status"
      aria-label="Loading dashboard"
      className="min-w-0 text-(--text) [@media(max-width:640px)]:pb-4"
    >
      <div
        data-part="heading"
        className="mb-4.5 flex items-start justify-between gap-5 [@media(max-width:640px)]:flex-col [@media(max-width:640px)]:items-stretch [@media(max-width:640px)]:gap-[13px]"
      >
        <div>
          {/* The greeting and the name after it, as two pieces that wrap
              where the words would: the name goes to a second line when the
              two do not fit side by side. Their lengths are remembered from
              the last time the dashboard was shown (see store/homeHint.ts). */}
          <div
            data-part="title"
            aria-hidden="true"
            className="flex items-center gap-2 text-[clamp(1.55rem,2.2vw,2rem)] leading-[1.2] font-bold tracking-[-0.03em]"
          >
            <span className="min-w-0">
              <span
                className={`${bar} inline-block h-[0.72em] w-(--dashboard-greeting-width,7.9em)`}
              />{" "}
              <span
                className={`${bar} inline-block h-[0.72em] w-(--dashboard-name-width,7.2em)`}
              />
            </span>
          </div>
          <p
            data-part="subtitle"
            className="mt-[7px] text-[0.82rem] text-(--muted)"
          >
            Here&apos;s what&apos;s happening with your academy today.
          </p>
        </div>
        <div
          data-part="actions"
          aria-hidden="true"
          className="flex flex-none items-center gap-2.5 [@media(max-width:640px)]:w-full [@media(max-width:480px)]:gap-1.5"
        >
          {ACTION_WIDTHS.map((width) => (
            <span
              key={width}
              data-part="action"
              className={`${fill} block h-[42px] rounded-lg ${width} [@media(max-width:640px)]:w-auto [@media(max-width:640px)]:flex-1`}
            />
          ))}
        </div>
      </div>

      <div
        data-part="kpi-grid"
        aria-hidden="true"
        className="grid auto-rows-[90px] grid-cols-4 gap-3 [@media(max-width:1180px)]:grid-cols-2 [@media(min-width:420.02px)_and_(max-width:640px)]:auto-rows-[88px] [@media(min-width:420.02px)_and_(max-width:640px)]:gap-[9px] [@media(max-width:420px)]:auto-rows-[86px] [@media(max-width:420px)]:gap-2"
      >
        {KPI_CARDS.map((index) => (
          <div
            key={index}
            data-part="kpi-card"
            className={`${card} flex items-center gap-2.5 p-3`}
          >
            <span className={`${fill} size-9 flex-none rounded-full`} />
            <span className="grid min-w-0 flex-1 gap-1.5">
              <span className={`${bar} block h-2.5 w-24 max-w-full`} />
              <span className={`${bar} block h-5 w-20 max-w-full`} />
              <span className={`${bar} block h-2.5 w-28 max-w-full`} />
            </span>
          </div>
        ))}
      </div>

      <div
        data-part="panel-grid"
        aria-hidden="true"
        className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 [@media(max-width:960px)]:grid-cols-1"
      >
        {PANELS.map(({ name, size }) => (
          <div
            key={name}
            data-part="panel"
            className={`${card} flex flex-col p-[15px] ${size}`}
          >
            <span className="mb-[13px] flex h-[26px] flex-none items-center">
              <span className={`${bar} block h-4 w-40 max-w-[60%]`} />
            </span>
            <span className={`${fill} block min-h-0 flex-1 rounded-lg`} />
          </div>
        ))}
      </div>
    </div>
  );
}
