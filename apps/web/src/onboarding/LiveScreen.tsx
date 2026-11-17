import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { WhatsappLogoIcon as WhatsappLogo } from "@phosphor-icons/react/WhatsappLogo";
import type { ReactNode, Ref } from "react";
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
  {
    kind: "Course",
    title: "Your first course",
    meta: "12 lessons",
    price: "₹499",
  },
  {
    kind: "Workshop",
    title: "Weekend workshop",
    meta: "Live, 2 hours",
    price: "₹1,299",
  },
  { kind: "Guide", title: "Starter guide", meta: "6 lessons", price: "Free" },
] as const;

const NAV = ["Courses", "Workshops", "Live classes"] as const;

/** A course's picture in the preview: the accent, kept quiet, over a dot grid. */
function PreviewThumb({
  tone,
  children,
}: {
  tone: number;
  children?: ReactNode;
}) {
  return (
    <div
      className="relative grid aspect-video place-items-center overflow-hidden"
      style={{
        background: `radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text) 14%, transparent) 1px, transparent 0) 0 0 / 14px 14px, linear-gradient(${135 + tone * 40}deg, color-mix(in srgb, var(--accent) ${34 - tone * 8}%, var(--surface)), color-mix(in srgb, var(--accent) 6%, var(--canvas)))`,
      }}
    >
      {children}
    </div>
  );
}

function Storefront({ name, host }: { name: string; host: string }) {
  const [subdomain, ...rest] = host.split(".");
  const [featured] = PREVIEW_COURSES;
  return (
    <div
      data-stage-browser
      className="relative flex min-h-0 w-full max-w-300 flex-col overflow-hidden rounded-[18px] bg-(--surface) shadow-[0_50px_120px_-40px_color-mix(in_srgb,var(--accent)_35%,#000),0_0_0_1px_color-mix(in_srgb,var(--text)_11%,transparent),inset_0_1px_0_rgb(255_255_255/.06)]"
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
      <div className="@container/sf min-h-0 flex-1 overflow-hidden bg-(--canvas) text-(--text)">
        <div
          data-stage-head
          className="flex items-center gap-6 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] px-7 py-3.5 @max-[640px]/sf:px-4"
        >
          <div
            data-stage-brand
            className="flex min-w-0 items-center gap-2.5 text-[15px] font-extrabold tracking-[-0.02em]"
          >
            <AcademyInitials name={name} size={30} />
            <span className="truncate">{name}</span>
          </div>
          <nav className="flex gap-5 text-[13px] font-semibold text-(--muted) @max-[640px]/sf:hidden">
            {NAV.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </nav>
          <span
            data-stage-signin
            className="ml-auto inline-flex h-8.5 items-center rounded-lg bg-(--accent) px-3.5 text-[12.5px] font-bold text-(--on-accent)"
          >
            Sign in
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,380px)] items-center gap-10 px-7 pt-7 pb-6 @max-[640px]/sf:grid-cols-1 @max-[640px]/sf:gap-5 @max-[640px]/sf:px-4 @max-[640px]/sf:pt-5">
          <div className="grid justify-items-start gap-3">
            <span className="inline-flex h-6.5 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2.5 text-[11.5px] font-bold text-(--accent)">
              <i
                className="size-1.5 rounded-full bg-(--accent)"
                aria-hidden="true"
              />
              Admissions open
            </span>
            <h3
              data-stage-hero
              className="m-0 max-w-[16ch] text-[clamp(24px,5cqw,44px)] leading-[1.04] font-extrabold tracking-[-0.04em]"
            >
              Learn with {name}
            </h3>
            <p className="m-0 max-w-[40ch] text-[13.5px] leading-relaxed text-(--muted)">
              Courses, workshops and live classes, with lifetime access and a
              certificate when you finish.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="inline-flex h-9 items-center rounded-lg bg-(--accent) px-4 text-[13px] font-bold text-(--on-accent)">
                Browse courses
              </span>
              <span className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_14%,transparent)]">
                <Play size={12} weight="fill" aria-hidden="true" />
                Free lesson
              </span>
            </div>
          </div>
          <div
            data-stage-course
            className="overflow-hidden rounded-[14px] bg-(--surface) shadow-[0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent),0_24px_50px_-28px_rgb(0_0_0/.8)] @max-[640px]/sf:hidden"
          >
            <PreviewThumb tone={0}>
              <span className="grid size-12 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_30px_color-mix(in_srgb,var(--accent)_45%,transparent)]">
                <Play size={18} weight="fill" aria-hidden="true" />
              </span>
            </PreviewThumb>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="grid min-w-0 gap-0.5">
                <b className="truncate text-[13.5px]">{featured.title}</b>
                <span className="truncate text-xs text-(--muted)">
                  {featured.meta}, by {name}
                </span>
              </div>
              <span className="ml-auto text-[13.5px] font-extrabold">
                {featured.price}
              </span>
            </div>
          </div>
        </div>

        <div className="px-7 pb-7 @max-[640px]/sf:px-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h4 className="m-0 text-sm font-extrabold">Popular right now</h4>
            <span className="text-xs font-semibold text-(--muted)">
              See all
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3.5 @max-[640px]/sf:grid-cols-1 @max-[640px]/sf:gap-2.5">
            {PREVIEW_COURSES.map((course, index) => (
              <div
                key={course.title}
                data-stage-course
                className={cn(
                  "flex items-center gap-3 rounded-xl bg-(--surface) p-2.5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--text)_7%,transparent)]",
                  index === 2 && "@max-[640px]/sf:hidden",
                )}
              >
                <div className="w-18 shrink-0 overflow-hidden rounded-lg">
                  <PreviewThumb tone={index} />
                </div>
                <div className="grid min-w-0 gap-0.5 text-xs text-(--muted)">
                  <span className="text-[10.5px] font-bold tracking-[0.06em] text-(--accent) uppercase">
                    {course.kind}
                  </span>
                  <b className="truncate text-[12.5px] text-(--text)">
                    {course.title}
                  </b>
                  <span>
                    {course.meta},{" "}
                    <b className="text-(--text)">{course.price}</b>
                  </span>
                </div>
              </div>
            ))}
          </div>
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
            "absolute inset-x-[clamp(12px,4cqw,64px)] inset-y-1.5 flex justify-center transition-[opacity,transform] duration-1100 ease-(--stage-ease) @max-[700px]:inset-x-2.5 @max-[700px]:inset-y-1",
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
