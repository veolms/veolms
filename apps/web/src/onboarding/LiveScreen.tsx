import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { ShareNetworkIcon as ShareNetwork } from "@phosphor-icons/react/ShareNetwork";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { WhatsappLogoIcon as WhatsappLogo } from "@phosphor-icons/react/WhatsappLogo";
import type { Ref } from "react";
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
  ["Your first course", "₹499"],
  ["Workshop recording", "₹1,299"],
  ["Starter guide", "Free"],
] as const;

function Storefront({ name, host }: { name: string; host: string }) {
  const [subdomain, ...rest] = host.split(".");
  return (
    <div
      data-stage-browser
      className="relative flex min-h-0 w-full max-w-245 flex-col overflow-hidden rounded-2xl bg-(--surface) shadow-[0_40px_100px_-30px_color-mix(in_srgb,var(--accent)_45%,#000),0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)]"
    >
      <div
        data-stage-bar
        className="flex h-10 shrink-0 items-center gap-3 bg-(--header) px-3.5"
      >
        <span className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <i
              key={dot}
              className="size-2.5 rounded-full bg-[color-mix(in_srgb,var(--text)_16%,transparent)]"
            />
          ))}
        </span>
        <div className="mx-auto flex h-6.5 max-w-100 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-2.5 text-[12.5px] font-semibold whitespace-nowrap">
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
      </div>
      <div className="@container/sf min-h-0 flex-1 overflow-auto bg-(--canvas) text-(--text)">
        <div
          data-stage-head
          className="flex items-center gap-4.5 bg-(--header) px-5.5 py-3.5 @max-[520px]/sf:px-3.5"
        >
          <div
            data-stage-brand
            className="flex min-w-0 items-center gap-2.5 text-[15px] font-extrabold tracking-[-0.02em]"
          >
            <AcademyInitials name={name} size={30} />
            <span className="truncate">{name}</span>
          </div>
          <nav className="ml-auto flex gap-4 text-[13px] font-semibold text-(--muted) @max-[520px]/sf:hidden">
            <span>Courses</span>
            <span>Workshops</span>
          </nav>
          <span
            data-stage-signin
            className="inline-flex h-8 items-center rounded-lg bg-(--accent) px-3 text-[12.5px] font-bold text-(--on-accent) @max-[520px]/sf:ml-auto"
          >
            Sign in
          </span>
        </div>
        <div className="grid justify-items-start gap-2.5 bg-[linear-gradient(180deg,var(--header),var(--canvas))] px-5.5 pt-8.5 pb-6.5 @max-[520px]/sf:px-3.5">
          <p className="m-0 text-[11.5px] font-extrabold tracking-[0.09em] text-(--accent-ink,var(--accent)) uppercase">
            Online academy
          </p>
          <h3
            data-stage-hero
            className="m-0 max-w-[18ch] text-[clamp(22px,5.5cqw,40px)] leading-[1.06] font-extrabold tracking-[-0.04em]"
          >
            Learn with {name}
          </h3>
          <p className="m-0 text-sm text-(--muted)">
            Courses, workshops and live classes
          </p>
        </div>
        <div className="px-5.5 pt-1.5 pb-6 @max-[520px]/sf:px-3.5">
          <h4 className="m-0 mb-3 text-[15px] font-extrabold">Courses</h4>
          <div className="grid grid-cols-3 gap-3.5 @max-[520px]/sf:grid-cols-2">
            {PREVIEW_COURSES.map(([title, price], index) => (
              <div
                key={title}
                data-stage-course
                className={cn(
                  "overflow-hidden rounded-[14px] bg-(--surface) shadow-[inset_0_1px_0_rgb(255_255_255/.06),0_10px_22px_-14px_rgb(0_0_0/.45)]",
                  index === 2 && "@max-[520px]/sf:hidden",
                )}
              >
                <div className="relative grid aspect-video place-items-center bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_45%,var(--canvas)))] text-(--on-accent)">
                  {index === 0 ? (
                    <span className="absolute top-2 left-2 inline-flex h-5.5 items-center rounded-full bg-[color-mix(in_srgb,var(--canvas)_70%,transparent)] px-2 text-[11.5px] font-bold text-(--text)">
                      Sample
                    </span>
                  ) : null}
                  <Sparkle size={32} aria-hidden="true" />
                </div>
                <div className="grid gap-0.75 px-3 pt-2.5 pb-3 text-xs text-(--muted)">
                  <b className="text-[13px] text-(--text)">{title}</b>
                  <span>{name}</span>
                  <span className="font-extrabold text-(--text)">{price}</span>
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
            "absolute inset-x-[clamp(12px,6cqw,90px)] inset-y-1.5 flex justify-center transition-[opacity,transform] duration-1100 ease-(--stage-ease) @max-[700px]:inset-x-2.5 @max-[700px]:inset-y-1",
            shown ? "scale-100 opacity-100" : "scale-[.97] opacity-0",
          )}
        >
          <Storefront name={name} host={host} />
        </div>
      </div>
      <StageDock className="flex! w-auto! flex-wrap justify-center gap-2 rounded-[18px]! p-2.5!">
        <Button
          ref={dashboardRef}
          onClick={onEnter}
          disabled={entering}
          aria-busy={entering}
          className="h-11.5 px-5 text-[15px]!"
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
        <Button variant="quiet" className="h-11.5" onClick={onCopy}>
          <Copy size={16} aria-hidden="true" />
          Copy link
        </Button>
        <Button variant="quiet" className="h-11.5" onClick={onShare}>
          {shareLabel === "whatsapp" ? (
            <WhatsappLogo size={16} aria-hidden="true" />
          ) : (
            <ShareNetwork size={16} aria-hidden="true" />
          )}
          Share
        </Button>
        <Button variant="quiet" className="h-11.5" onClick={onReplay}>
          <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
          Replay
        </Button>
      </StageDock>
    </>
  );
}
