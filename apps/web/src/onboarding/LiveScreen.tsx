import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { CodeIcon as Code } from "@phosphor-icons/react/Code";
import { GearIcon as Gear } from "@phosphor-icons/react/Gear";
import { HouseIcon as House } from "@phosphor-icons/react/House";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { StackIcon as Stack } from "@phosphor-icons/react/Stack";
import { TargetIcon as Target } from "@phosphor-icons/react/Target";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { WhatsappLogoIcon as WhatsappLogo } from "@phosphor-icons/react/WhatsappLogo";
import type { CSSProperties, ReactNode, Ref } from "react";
import { Button } from "../components/Button";
import { cn } from "../lib/utils";
import { AcademyInitials, StageDock, StageQuestion } from "./StagePieces";

/**
 * "… is live.": the academy's address with a live dot, its name swept by
 * light, and a preview of its storefront, which the light lands on before
 * it fades in.
 */

/** What the preview shows until the academy has courses of its own. */
const PREVIEW_COURSES = [
  { title: "Your first course", meta: "12 lessons", price: "₹499" },
  { title: "Weekend workshop", meta: "Live, 2 hours", price: "₹1,299" },
  { title: "Starter guide", meta: "6 lessons", price: "Free" },
] as const;

/** The academy app's own navigation, with its own icon colours. */
const NAV = [
  { label: "Home", Icon: House, tone: "text-sky-400" },
  { label: "Courses", Icon: BookOpen, tone: "text-pink-400" },
  { label: "Discussions", Icon: ChatCircleDots, tone: "text-emerald-400" },
  { label: "Chats", Icon: ChatsCircle, tone: "text-teal-400" },
] as const;

/** The four promises under a new academy's courses. */
const PROMISES = [
  {
    title: "In-depth",
    line: "Go beyond the basics.",
    Icon: BookOpen,
    tone: "bg-sky-500/15 text-sky-400",
  },
  {
    title: "Practical",
    line: "Hands-on exercises.",
    Icon: Code,
    tone: "bg-violet-500/15 text-violet-400",
  },
  {
    title: "Foundations",
    line: "Build solid concepts.",
    Icon: Stack,
    tone: "bg-emerald-500/15 text-emerald-400",
  },
  {
    title: "Confidence",
    line: "Build real projects.",
    Icon: Target,
    tone: "bg-amber-500/15 text-amber-400",
  },
] as const;

/** A course's picture in the preview: the accent, kept quiet, over a dot grid. */
function PreviewThumb({
  tone,
  wide = false,
  children,
}: {
  tone: number;
  /** A shorter picture, for the course cards. */
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden",
        wide ? "aspect-[3/1]" : "aspect-video",
      )}
      style={{
        background: `radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text) 14%, transparent) 1px, transparent 0) 0 0 / 14px 14px, linear-gradient(${135 + tone * 40}deg, color-mix(in srgb, var(--accent) ${34 - tone * 8}%, var(--surface)), color-mix(in srgb, var(--accent) 6%, var(--canvas)))`,
      }}
    >
      {children}
    </div>
  );
}

const tileClasses = "rounded-[10px] bg-(--card-surface)";

/**
 * A new academy's app opens in Ocean Blue, dark (the app's own palette,
 * styles/themes/dark/ocean.css), so the preview wears exactly those
 * colours, whatever the sign-up stage around it uses.
 */
const ACADEMY_APP_COLOURS = {
  "--canvas": "#12151a",
  "--header": "#161a20",
  "--surface": "#1e242d",
  "--card-surface": "#282f39",
  "--selected": "#293b58",
  "--text": "#f4f8ff",
  "--muted": "#a6b9d4",
  "--accent": "#7193ff",
  "--on-accent": "#07102a",
} as CSSProperties;

/**
 * The academy as its students will see it: the VeoLMS app with its
 * sidebar (a tab bar on a phone), the home page's welcome, its courses
 * and its four promises.
 */
function Storefront({ name, host }: { name: string; host: string }) {
  const [subdomain, ...rest] = host.split(".");
  return (
    <div
      data-stage-browser
      className="relative flex min-h-0 w-full max-w-330 flex-col overflow-hidden rounded-[18px] bg-(--canvas) shadow-[0_50px_120px_-40px_color-mix(in_srgb,var(--accent)_35%,#000),0_0_0_1px_color-mix(in_srgb,var(--text)_11%,transparent),inset_0_1px_0_rgb(255_255_255/.06)]"
      style={ACADEMY_APP_COLOURS}
    >
      <div
        data-stage-bar
        className="flex h-10 shrink-0 items-center gap-3 border-b border-[color-mix(in_srgb,var(--text)_7%,transparent)] bg-(--header) px-3.5"
      >
        <span className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <i
              key={dot}
              className="size-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_16%,transparent)]"
            />
          ))}
        </span>
        <div className="mx-auto flex h-6.5 max-w-110 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-2.5 text-[12.5px] font-semibold whitespace-nowrap">
          <LockSimple
            size={12}
            weight="bold"
            className="shrink-0 text-(--success)"
            aria-hidden="true"
          />
          <span className="truncate">
            {subdomain}
            <b className="font-medium text-(--muted)">.{rest.join(".")}</b>
          </span>
        </div>
        <span className="w-12" aria-hidden="true" />
      </div>

      <div className="@container/sf min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 gap-3 overflow-hidden p-3 text-(--text) @max-[640px]/sf:flex-col @max-[640px]/sf:gap-0 @max-[640px]/sf:p-0">
          {/* Sidebar */}
          <aside
            data-stage-head
            className="flex w-46 shrink-0 flex-col gap-1.5 @max-[640px]/sf:hidden"
          >
            <div
              data-stage-brand
              className="flex items-center gap-2 px-2 pt-1.5 pb-3 text-[15px] font-extrabold tracking-[-0.02em]"
            >
              <AcademyInitials name={name} size={26} />
              <span className="truncate">{name}</span>
            </div>
            {NAV.map(({ label, Icon, tone }, index) => (
              <span
                key={label}
                className={cn(
                  "flex h-9.5 items-center gap-2.5 px-3 text-[13px] font-semibold",
                  tileClasses,
                  index === 0 &&
                    "bg-(--selected) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_28%,transparent)]",
                )}
              >
                <Icon
                  size={17}
                  weight={index === 0 ? "fill" : "regular"}
                  className={tone}
                  aria-hidden="true"
                />
                {label}
              </span>
            ))}
            <div className="mt-auto grid gap-1.5">
              <span
                data-stage-signin
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2",
                  tileClasses,
                )}
              >
                <UserCircle
                  size={24}
                  className="text-(--muted)"
                  aria-hidden="true"
                />
                <span className="grid text-[12px] leading-tight">
                  <b>Sign in</b>
                  <span className="text-(--muted)">Help and more</span>
                </span>
              </span>
              <span className="grid grid-cols-3 gap-1.5" aria-hidden="true">
                {(
                  [
                    [Palette, "text-orange-400"],
                    [Bell, "text-amber-400"],
                    [Gear, "text-violet-400"],
                  ] as const
                ).map(([Icon, tone], index) => (
                  <span
                    key={index}
                    className={cn("grid h-8 place-items-center", tileClasses)}
                  >
                    <Icon size={15} className={tone} />
                  </span>
                ))}
              </span>
            </div>
          </aside>

          {/* Home page */}
          <div className="min-w-0 flex-1 overflow-hidden rounded-[14px] bg-(--surface) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)] @max-[640px]/sf:rounded-none">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,300px)] items-center gap-6 bg-[radial-gradient(90%_120%_at_85%_0%,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_60%)] px-6 pt-6 pb-5 @max-[640px]/sf:grid-cols-1 @max-[640px]/sf:gap-4 @max-[640px]/sf:px-4 @max-[640px]/sf:pt-5">
              <div className="grid justify-items-start gap-2.5">
                <span className="text-[10.5px] font-bold tracking-[0.2em] text-(--muted) uppercase">
                  Welcome to {name}
                </span>
                <h3
                  data-stage-hero
                  className="m-0 text-[clamp(22px,4.2cqw,38px)] leading-[1.05] font-extrabold tracking-[-0.035em]"
                >
                  Learn in depth.
                  <span className="block text-(--accent)">
                    Build with confidence.
                  </span>
                </h3>
                <span className="mt-1.5 inline-flex h-8.5 items-center gap-1.5 rounded-lg bg-(--accent) px-3.5 text-[12.5px] font-bold text-(--on-accent)">
                  Explore courses
                  <ArrowRight size={13} weight="bold" aria-hidden="true" />
                </span>
              </div>
              <div className="overflow-hidden rounded-xl shadow-[0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent),0_20px_40px_-24px_rgb(0_0_0/.8)]">
                <PreviewThumb tone={0}>
                  <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--canvas)_70%,transparent)] text-(--text) backdrop-blur-sm">
                    <Play size={16} weight="fill" aria-hidden="true" />
                  </span>
                </PreviewThumb>
              </div>
            </div>

            <div className="px-6 pb-5 @max-[640px]/sf:px-4">
              <h4 className="m-0 text-[15px] font-extrabold">
                Popular courses
              </h4>
              <p className="m-0 mb-3 text-xs text-(--muted)">
                Most loved by our learners.
              </p>
              <div className="grid grid-cols-3 gap-3 @max-[640px]/sf:grid-cols-2">
                {PREVIEW_COURSES.map((course, index) => (
                  <div
                    key={course.title}
                    data-stage-course
                    className={cn(
                      "overflow-hidden rounded-xl bg-(--card-surface)",
                      index === 2 && "@max-[640px]/sf:hidden",
                    )}
                  >
                    <PreviewThumb tone={index} wide />
                    <div className="grid gap-0.5 px-3 pt-2 pb-2.5 text-[11.5px] text-(--muted)">
                      <b className="truncate text-[12.5px] text-(--text)">
                        {course.title}
                      </b>
                      <span className="flex justify-between gap-2">
                        {course.meta}
                        <b className="text-(--text)">{course.price}</b>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2.5 @max-[820px]/sf:grid-cols-2 @max-[640px]/sf:hidden">
                {PROMISES.map(({ title, line, Icon, tone }) => (
                  <div
                    key={title}
                    className={cn(
                      "flex items-center gap-2.5 p-2.5",
                      tileClasses,
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        tone,
                      )}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="grid min-w-0 text-[11px] leading-tight text-(--muted)">
                      <b className="text-[12px] text-(--text)">{title}</b>
                      <span className="truncate">{line}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* The phone's tab bar */}
          <nav
            aria-hidden="true"
            className="hidden shrink-0 grid-cols-5 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--header) py-1.5 @max-[640px]/sf:grid"
          >
            {[
              ...NAV,
              { label: "You", Icon: UserCircle, tone: "text-(--muted)" },
            ].map(({ label, Icon, tone }, index) => (
              <span
                key={label}
                className={cn(
                  "grid justify-items-center gap-0.5 text-[10px] font-semibold",
                  index === 0 ? "text-(--accent)" : "text-(--muted)",
                )}
              >
                <Icon
                  size={18}
                  weight={index === 0 ? "fill" : "regular"}
                  className={index === 0 ? "" : tone}
                />
                {label}
              </span>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

export function LiveScreen({
  questionRef,
  liveboxRef,
  name,
  host,
  openedOn,
  shown,
  entering,
  dashboardRef,
  onEnter,
  onCopy,
  onShare,
  shareLabel,
  onReplay,
}: {
  questionRef: Ref<HTMLDivElement>;
  liveboxRef: Ref<HTMLDivElement>;
  name: string;
  host: string;
  openedOn: string;
  /** The storefront fades in once the light has landed on it. */
  shown: boolean;
  entering: boolean;
  dashboardRef: Ref<HTMLButtonElement>;
  onEnter: () => void;
  onCopy: () => void;
  onShare: () => void;
  shareLabel: "whatsapp" | "share";
  onReplay: () => void;
}) {
  return (
    <>
      <StageQuestion
        ref={questionRef}
        eyebrow={
          <span className="inline-flex h-8.5 items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-3.5 text-sm font-bold tracking-normal text-(--text) normal-case">
            <i
              aria-hidden="true"
              className="size-2 rounded-full bg-(--success) shadow-[0_0_0_4px_color-mix(in_srgb,var(--success)_22%,transparent)] animate-[stage-ping_1.6s_ease-out_infinite] motion-reduce:animate-none"
            />
            {host}
          </span>
        }
        title={`${name} is live.`}
        // Gradient text with a text shadow drew hollow letters; a drop shadow
        // keeps the glow off the stars without hiding the fill.
        titleClassName="[text-shadow:none] drop-shadow-[0_2px_18px_var(--canvas)] bg-[linear-gradient(100deg,var(--text)_35%,var(--accent)_50%,var(--text)_65%)] bg-size-[300%_100%] bg-clip-text text-transparent animate-[stage-rise_.9s_var(--stage-ease)_both,stage-sweep_2.2s_.4s_var(--stage-ease)_both] motion-reduce:bg-none motion-reduce:text-(--text) [-webkit-background-clip:text]"
      >
        Opened {openedOn}. Your first student could arrive today.
      </StageQuestion>
      <div className="relative z-1 min-h-30 flex-1">
        <div
          ref={liveboxRef}
          aria-label={`A preview of ${name}'s storefront`}
          role="img"
          className={cn(
            "absolute inset-x-[clamp(10px,2.5cqw,40px)] inset-y-1.5 flex justify-center transition-[opacity,transform] duration-1100 ease-(--stage-ease) @max-[700px]:inset-x-2.5 @max-[700px]:inset-y-1",
            shown ? "scale-100 opacity-100" : "scale-[.97] opacity-0",
          )}
        >
          <Storefront name={name} host={host} />
        </div>
      </div>
      <StageDock className="flex! w-[min(820px,calc(100%-32px))]! items-center gap-2! p-2! @max-[700px]:w-[calc(100%-20px)]! @max-[700px]:flex-wrap">
        <div className="flex h-11.5 min-w-0 flex-1 items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] pr-1 pl-3.5 @max-[700px]:basis-full">
          <LockSimple
            size={14}
            weight="bold"
            className="shrink-0 text-(--success)"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {host}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-0 bg-transparent px-3 text-[13px] font-semibold text-(--text-secondary) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            <Copy size={15} aria-hidden="true" />
            Copy
          </button>
        </div>
        <div className="flex shrink-0 items-center">
          <DockAction onClick={onShare} label="Share">
            {shareLabel === "whatsapp" ? (
              <WhatsappLogo size={16} aria-hidden="true" />
            ) : (
              <ShareNetwork size={16} aria-hidden="true" />
            )}
          </DockAction>
          <DockAction onClick={onReplay} label="Replay">
            <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
          </DockAction>
        </div>
        <Button
          ref={dashboardRef}
          onClick={onEnter}
          disabled={entering}
          aria-busy={entering}
          className="h-11.5 rounded-xl! px-5 text-[15px]! font-bold! whitespace-nowrap @max-[700px]:flex-1"
        >
          Enter my dashboard
          {entering ? (
            <CircleNotch
              size={16}
              weight="bold"
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          )}
        </Button>
      </StageDock>
    </>
  );
}

/** A quiet text button in the live screen's action bar. */
function DockAction({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11.5 cursor-pointer items-center gap-2 rounded-xl border-0 bg-transparent px-3.5 @max-[700px]:w-11.5 @max-[700px]:justify-center @max-[700px]:px-0 text-sm font-semibold text-(--text-secondary) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
    >
      {children}
      <span className="@max-[700px]:sr-only">{label}</span>
    </button>
  );
}
