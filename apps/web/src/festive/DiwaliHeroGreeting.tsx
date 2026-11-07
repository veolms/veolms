import type { HomePageFestiveAlign } from "@veolms/contracts/home-page-defaults";
import { DiyaIcon } from "./DiyaIcon";
import "./diwali.css";

const greetingSizes = {
  /** The visitor's hero, under its two-line headline. */
  hero: "text-[clamp(2.25rem,5cqw,2.9rem)] @[50rem]/home:text-[clamp(2.4rem,3.4cqw,3.15rem)]",
  /**
   * The signed-in learner's hero, under a greeting that is its title: kept
   * smaller here, so the title still reads as the heading.
   */
  compact:
    "text-[clamp(1.75rem,6cqw,2.1rem)] @[50rem]/home:text-[clamp(1.75rem,2.5cqw,2.35rem)]",
};

/**
 * Where the hero stacks (a phone, a narrow window), as an admin chose it:
 * centred, one over the other as on a greeting card, or along the
 * headline's left edge. Beside the picture they always follow the headline.
 */
const stackedAlign: Record<HomePageFestiveAlign, string> = {
  center: "items-center text-center",
  start: "items-start text-left",
};

/**
 * The festive greeting in the home hero, where the quote stands the rest of
 * the year: a lit diya, the greeting ("Happy Diwali" unless an admin set
 * another) in gold script with a stroke drawn under it, and the message
 * beside it; stacked where the hero is narrow (see `stackedAlign`).
 *
 * The gold is light by night and a deep amber by day, so it reads on the
 * navy of the night picture and on the cream wall of the day one.
 */
export function DiwaliHeroGreeting({
  greeting,
  message,
  align = "center",
  className = "",
  size = "hero",
}: {
  greeting: string;
  /** Left out, with the line before it, when empty. */
  message: string;
  align?: HomePageFestiveAlign;
  className?: string;
  size?: keyof typeof greetingSizes;
}) {
  return (
    <div
      className={`flex w-full flex-col gap-x-5 gap-y-2.5 ${stackedAlign[align]} @[50rem]/home:w-auto @[50rem]/home:flex-row @[50rem]/home:flex-wrap @[50rem]/home:items-center @[50rem]/home:text-left ${className}`}
    >
      <p className={`flex items-end gap-[0.28em] ${greetingSizes[size]}`}>
        <DiyaIcon className="mb-[0.3em] h-[0.78em] w-[1.05em]" />
        <span className="relative pb-[0.22em] font-[Lora,'Lora_Fallback',Georgia,serif] leading-none font-medium tracking-[-0.01em] whitespace-nowrap italic">
          <span className="bg-[linear-gradient(180deg,#FFEBC2_0%,#F2C27A_55%,#D9984A_100%)] bg-clip-text pr-[0.08em] text-transparent [:root[data-theme=light]_&]:bg-[linear-gradient(180deg,#C2700F_0%,#A3520B_60%,#7C3A0A_100%)]">
            {greeting}
          </span>
          {/* The stroke under it, ending in a spark. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 220 14"
            preserveAspectRatio="none"
            className="absolute bottom-0 left-[8%] h-[0.26em] w-[90%] overflow-visible"
          >
            <path
              d="M2 10 C 60 2, 140 1, 212 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="text-[#E9B872]/60 [:root[data-theme=light]_&]:text-[#B4610E]/55"
            />
            <circle
              cx="215"
              cy="6.5"
              r="2.4"
              className="fill-[#F5D08A] [:root[data-theme=light]_&]:fill-[#C2700F]"
            />
          </svg>
        </span>
      </p>
      {message ? (
        <>
          <span
            aria-hidden="true"
            className="hidden h-11 w-px shrink-0 bg-linear-to-b from-transparent via-[#E9B872]/45 to-transparent @[50rem]/home:block [:root[data-theme=light]_&]:via-[#B4610E]/35"
          />
          <p className="max-w-[19rem] text-[0.9375rem] leading-[1.45] text-balance text-slate-300 @[50rem]/home:max-w-[17.5rem] @[50rem]/home:text-pretty [:root[data-theme=light]_&]:text-slate-700">
            {message}
          </p>
        </>
      ) : null}
    </div>
  );
}
