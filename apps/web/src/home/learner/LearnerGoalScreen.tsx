import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { ConfettiIcon as Confetti } from "@phosphor-icons/react/Confetti";
import { HandsClappingIcon as HandsClapping } from "@phosphor-icons/react/HandsClapping";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import type { LearningSummaryResponse } from "@veolms/contracts";
import { DEFAULT_DAILY_GOAL_MINUTES } from "@veolms/contracts/learning-goal-defaults";
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { GoalEditorForm, GoalSaveButton } from "./GoalEditorForm";
import { useLaptopWallpaper } from "./laptopWallpaper";
import { useGoalEditor } from "./useGoalEditor";
import {
  describeGoalDay,
  timeLeftParts,
  timeOverGoalParts,
  type GoalStanding,
} from "./learnerGoalFormat";

/**
 * The laptop's screen is laid out at 800 by 530 and then drawn far smaller
 * (see `HeroLaptopScreen`), so every size here is in that screen's own
 * pixels and looks oversized in the source.
 *
 * How much smaller depends on the hero. Beside the copy (a page 50rem or
 * wider) the laptop is drawn at about half size. In the band a narrower
 * page gives the picture, down to a phone, it is drawn at about a quarter:
 * there the sheet keeps to the goal and its bar, set larger.
 *
 * The screen is a wallpaper with a sheet of frosted glass risen from its
 * bottom edge, and the day's goal on the sheet. It is always a dark one,
 * whatever the theme. Progress is drawn in the wallpaper's own accent: the
 * one picked for a wallpaper that comes with the app, or the one taken from
 * a learner's own picture (see `laptopWallpaperAccent`). Until a picture's
 * colour is known the theme's accent is used, held to a lightness that
 * reads on a dark screen (several day palettes have an accent that is
 * nearly black).
 *
 * The words are in that colour too (`--goal-ink`), lifted to a bright tint
 * of it (high lightness, the hue kept) that stands out on the dark sheet,
 * so the screen is of a piece with its wallpaper: warm over a sunset, cool
 * over blue. They were plain white.
 * The quieter words are the same ink, let through a little less.
 */
const screenClasses = [
  "relative size-full overflow-hidden bg-[#070b1c] text-(--goal-ink)",
  "[--goal-accent:color-mix(in_srgb,var(--accent)_60%,white)]",
  "supports-[color:oklch(from_white_l_c_h)]:[--goal-accent:oklch(from_var(--accent)_max(l,0.76)_c_h)]",
  "[--goal-ink:color-mix(in_srgb,var(--goal-accent)_55%,white)]",
  "supports-[color:oklch(from_white_l_c_h)]:[--goal-ink:oklch(from_var(--goal-accent)_max(l,0.92)_min(c,0.11)_h)]",
].join(" ");

/** A wallpaper that loads within this long of being put up was held already. */
const HELD_WALLPAPER_LOAD_MS = 150;

/**
 * The wallpaper. It fades in once it has arrived rather than appearing in
 * strips, and the screen's own dark ground shows until then. One the browser
 * already holds is shown as soon as it is there, without the fade: the fade
 * gave the picture a layer of its own for its length, and when it ended and
 * the picture went back into the laptop's screen, a phone drew the screen
 * without it for a frame (seen each time a lesson was minimized over the
 * home page, which draws the page anew behind the shrinking video).
 */
function LaptopWallpaper({ src }: { src: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const shownAtRef = useRef(0);
  const [loadedSrc, setLoadedSrc] = useState<string>();
  const [heldSrc, setHeldSrc] = useState<string>();
  // A picture the browser already holds has loaded before this can listen.
  // Read before the first paint, so it is shown at once.
  useLayoutEffect(() => {
    shownAtRef.current = performance.now();
    if (!imageRef.current?.complete) return;
    setHeldSrc(src);
    setLoadedSrc(src);
  }, [src]);
  return (
    <img
      ref={imageRef}
      key={src}
      src={src}
      alt=""
      decoding="async"
      draggable={false}
      onLoad={() => {
        if (performance.now() - shownAtRef.current < HELD_WALLPAPER_LOAD_MS) {
          setHeldSrc(src);
        }
        setLoadedSrc(src);
      }}
      // Lifted a little: the laptop's screen is dimmed to sit in the
      // picture (see `HeroLaptopScreen`), which dulls a wallpaper.
      className={`absolute inset-0 size-full object-cover brightness-115 saturate-125 ${
        heldSrc === src
          ? ""
          : "transition-opacity duration-500 motion-reduce:transition-none"
      } ${loadedSrc === src ? "opacity-100" : "opacity-0"}`}
    />
  );
}

/**
 * The screen: the learner's wallpaper, and the sheet over its lower part.
 * The sheet blurs the wallpaper behind it as well as darkening it, so the
 * picture's own lines and edges do not run through the words.
 */
function LaptopScreen({
  busy,
  children,
}: {
  busy?: boolean;
  children: ReactNode;
}) {
  const wallpaper = useLaptopWallpaper();
  return (
    <div
      role="group"
      aria-label="Your learning goals"
      aria-busy={busy}
      className={screenClasses}
      style={
        wallpaper.accent
          ? ({ "--goal-accent": wallpaper.accent } as CSSProperties)
          : undefined
      }
    >
      <LaptopWallpaper src={wallpaper.src} />
      <div className="group/sheet absolute inset-x-0 bottom-0 rounded-t-[44px] bg-[#0b0d16]/55 px-11 pt-9 pb-10 shadow-[inset_0_1.5px_0_rgb(255_255_255/0.16)] backdrop-blur-2xl @[50rem]/home:pt-8 @[50rem]/home:pb-9">
        {children}
      </div>
    </div>
  );
}

/**
 * One of the three figures along the sheet's foot. They are set as the
 * phone's goal card sets them (see `LearnerGoalCard`): one weight, near
 * white, each with an icon in its own colour (blue, amber, green), rather
 * than in the wallpaper's ink.
 */
function GoalStat({
  icon,
  amount,
  label,
  className = "text-white/90",
}: {
  icon: ReactNode;
  amount?: string;
  label: string;
  className?: string;
}) {
  return (
    <p
      className={`flex items-center gap-2.5 text-[36px] leading-none font-normal whitespace-nowrap @[50rem]/home:text-[29px] ${className}`}
    >
      {icon}
      <span>{amount ? `${amount} ${label}` : label}</span>
    </p>
  );
}

const statIconClasses = "size-11 shrink-0 @[50rem]/home:size-9";

/**
 * The picture after the sheet's first line once the goal is met. It hops
 * twice as it arrives and comes to rest where it stands (the half turn ends
 * the bounce on the ground rather than in the air).
 */
const celebrationIconClasses =
  "size-13 shrink-0 text-amber-300 motion-safe:animate-bounce motion-safe:[animation-iteration-count:2.5] @[50rem]/home:size-11";

/**
 * The sheet's first line. It names the goal until the goal is met, then
 * says so with applause. Once the learner has gone well past it the line
 * is praise and nothing else: the figures under it say by how much.
 */
function GoalHeading({ standing }: { standing: GoalStanding }) {
  return (
    <p className="flex items-center gap-3.5 text-[44px] leading-none font-semibold whitespace-nowrap text-(--goal-ink) @[50rem]/home:gap-3 @[50rem]/home:text-[36px]">
      {standing === "under" ? "Today's goal" : null}
      {standing === "completed" ? (
        <>
          Today&apos;s goal completed
          <HandsClapping
            weight="fill"
            aria-hidden="true"
            className={celebrationIconClasses}
          />
        </>
      ) : null}
      {standing === "beyond" ? (
        <>
          Awesome work today!
          <Confetti
            weight="fill"
            aria-hidden="true"
            className={celebrationIconClasses}
          />
        </>
      ) : null}
    </p>
  );
}

/**
 * The middle figure along the sheet's foot: the time left of the goal,
 * which is none once it is met; and past it, the time added.
 */
function GoalOutcomeStat({
  standing,
  todaySeconds,
  goalMinutes,
}: {
  standing: GoalStanding;
  todaySeconds: number;
  goalMinutes: number;
}) {
  if (standing === "beyond") {
    const over = timeOverGoalParts(todaySeconds, goalMinutes);
    return (
      <GoalStat
        icon={
          <Lightning
            weight="fill"
            aria-hidden="true"
            className={`${statIconClasses} text-amber-400`}
          />
        }
        amount={over.amount}
        label={over.label}
      />
    );
  }
  const left =
    standing === "under"
      ? timeLeftParts(todaySeconds, goalMinutes)
      : { amount: "0", label: "min left" };
  return (
    <GoalStat
      icon={
        <Clock
          weight="fill"
          aria-hidden="true"
          className={`${statIconClasses} text-amber-400`}
        />
      }
      amount={left.amount}
      label={left.label}
    />
  );
}

/**
 * What the laptop in the learner's hero shows: a wallpaper, and on a sheet
 * over it today's learning against the daily goal: the minutes, a bar, and
 * three figures under it (lessons finished today, time left, the share
 * done).
 *
 * Meeting the goal changes the sheet: its first line says the goal is
 * completed, with applause, and no time is left. Going well past it
 * changes it again: the line is praise, the bar becomes two, the goal and
 * after it the extra in green, and the figures are the time added and the
 * share of the goal (past 100).
 *
 * Every learner has a goal (an hour a day until they choose their own), so
 * there is no screen without one. Changing it is the pencil at the sheet's
 * corner, which shows when the pointer is over the sheet; where there is no
 * pointer to hover with, the whole sheet takes the press instead. It opens
 * the goal for editing right there, in place of its heading and figures,
 * and becomes the tick that saves it (see `useGoalEditor`).
 */
export function LearnerGoalScreen({
  summary,
  isLoading,
}: {
  summary: LearningSummaryResponse | undefined;
  isLoading: boolean;
}) {
  // An API that predates the default goal answers with none; the figures
  // are worked out here either way, so the two cannot disagree.
  const goalMinutes = summary?.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES;
  const editor = useGoalEditor(goalMinutes);
  if (!summary) {
    return (
      <LaptopScreen busy={isLoading}>
        {isLoading ? (
          <div role="status">
            <span className="block h-9 w-56 animate-pulse rounded-full bg-white/14 motion-reduce:animate-none" />
            <span className="mt-5 block h-24 w-96 animate-pulse rounded-3xl bg-white/14 motion-reduce:animate-none" />
            <span className="mt-8 block h-10 animate-pulse rounded-full bg-white/14 motion-reduce:animate-none @[50rem]/home:mt-6 @[50rem]/home:h-7" />
            <span className="mt-8 block h-10 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
            <span className="sr-only">Loading your learning goals</span>
          </div>
        ) : (
          <div role="status" className="flex items-center gap-6 py-6">
            <Target
              aria-hidden="true"
              className="size-20 text-(--goal-ink)/80"
            />
            <p className="grid gap-3 leading-none">
              <strong className="text-[44px] font-bold @[50rem]/home:text-[40px]">
                Learning goals
              </strong>
              <span className="text-[34px] font-medium text-(--goal-ink)/90 @[50rem]/home:text-[30px]">
                Unavailable right now
              </span>
            </p>
          </div>
        )}
      </LaptopScreen>
    );
  }

  const { today, percent, standing, barShare } = describeGoalDay(
    summary.todaySeconds,
    goalMinutes,
  );
  const beyond = standing === "beyond";
  // Not sent by an API that predates it; the figure is then left out.
  const lessons: number | undefined = summary.todayCompletions;

  return (
    <LaptopScreen>
      {editor.editing ? (
        // In the pencil's place while the goal is edited, and always shown.
        <GoalSaveButton
          editor={editor}
          className="absolute top-4 right-7 grid size-16 place-items-center rounded-full bg-white text-black hover:bg-white/85 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
          iconClassName="size-9"
        />
      ) : (
        <button
          type="button"
          onClick={editor.open}
          aria-label="Edit your daily goal"
          title="Edit your daily goal"
          // Shown while the pointer is over the sheet, and whenever it has
          // the keyboard's focus. Without a pointer that can hover (a phone,
          // a tablet) it is always there, and its `after` layer makes the
          // whole sheet the target (the sheet's blur makes it what a fixed
          // layer is held to): drawn that small, the pencil alone is too
          // little to press.
          className="absolute top-6 right-7 grid size-18 cursor-pointer place-items-center rounded-full bg-white/14 text-white opacity-0 transition-[opacity,background-color] duration-150 group-hover/sheet:opacity-100 hover:bg-white/26 focus-visible:opacity-100 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none [@media(hover:none)]:opacity-100 [@media(hover:none)]:after:fixed [@media(hover:none)]:after:inset-0"
        >
          <PencilSimple weight="bold" aria-hidden="true" className="size-9" />
        </button>
      )}

      {editor.editing ? (
        <GoalEditorForm editor={editor} variant="laptop" />
      ) : (
        <>
          <GoalHeading standing={standing} />
          <p className="mt-4 flex items-baseline leading-none whitespace-nowrap @[50rem]/home:mt-3">
            <strong className="text-[128px] font-extrabold tracking-[-0.03em] @[50rem]/home:text-[104px]">
              {today.done}
            </strong>
            <span className="ml-5 text-[66px] font-semibold text-(--goal-ink)/90 @[50rem]/home:text-[56px]">
              / {today.goal} {today.unit}
            </span>
          </p>
        </>
      )}

      <div
        role="progressbar"
        aria-label="Today's goal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        aria-valuetext={`${today.done} of ${today.goal} ${today.unit}`}
        className="mt-8 flex h-10 gap-2 overflow-hidden rounded-full bg-white/16 @[50rem]/home:mt-6 @[50rem]/home:h-7 @[50rem]/home:gap-1.5"
      >
        <span
          style={{ width: `${barShare}%` }}
          // Past the goal the two parts are each rounded at both ends, with
          // the track between them; the glow would fill that space.
          className={`h-full shrink-0 rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--goal-accent)_78%,white),var(--goal-accent))] transition-[width] duration-700 ease-out motion-reduce:transition-none ${
            beyond
              ? ""
              : "shadow-[0_0_18px_color-mix(in_srgb,var(--goal-accent)_55%,transparent)]"
          }`}
        />
        {beyond ? (
          <span
            data-goal-extra=""
            className="h-full min-w-0 flex-1 rounded-full bg-[linear-gradient(90deg,#4ade80,#86efac)]"
          />
        ) : null}
      </div>

      {/* At every size: in the band a narrower page gives the picture they
          are set larger, as the rest of the sheet is. */}
      <div
        data-goal-stats=""
        className="mt-8 flex items-center justify-between gap-4"
      >
        {typeof lessons === "number" ? (
          <GoalStat
            icon={
              <BookOpen
                weight="fill"
                aria-hidden="true"
                // The same blue in every theme, as on the phone's card.
                className={`${statIconClasses} text-[#5b82ff]`}
              />
            }
            amount={String(lessons)}
            label={lessons === 1 ? "lesson" : "lessons"}
          />
        ) : null}
        <GoalOutcomeStat
          standing={standing}
          todaySeconds={summary.todaySeconds}
          goalMinutes={goalMinutes}
        />
        <GoalStat
          icon={
            <CheckCircle
              weight="fill"
              aria-hidden="true"
              className={`${statIconClasses} text-emerald-500`}
            />
          }
          amount={`${beyond ? percent : Math.min(100, percent)}%`}
          label={beyond ? "of goal" : "complete"}
        />
      </div>
    </LaptopScreen>
  );
}
