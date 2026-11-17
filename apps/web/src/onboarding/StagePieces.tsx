import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { SpeakerHighIcon as SpeakerHigh } from "@phosphor-icons/react/SpeakerHigh";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/utils";
import { initialsOf } from "./academyNames";

/**
 * The sign-up stage's own pieces: its top bar, the big question, the
 * frosted dock that holds each step's controls, the launch button and the
 * academy's initials. Fields, buttons, code boxes and the agreement tick
 * are the app's own (LoginCardParts, Button, OtpCodeInput, Checkbox).
 */

/** Rises into place as a screen appears. */
export const stageRiseClasses =
  "animate-[stage-rise_.9s_var(--stage-ease)_both] motion-reduce:animate-none";

/** The stage's focus ring, on its own controls. */
export const stageFocusClasses =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

/** A quiet text button in the stage's corners (Sound, Save and exit, Skip). */
export const stageGhostClasses = cn(
  "inline-flex h-8.5 items-center gap-1.5 rounded-[9px] border-0 bg-transparent px-3 text-[13px]! font-semibold! text-(--muted) transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) disabled:opacity-50",
  stageFocusClasses,
);

/** The VeoLMS mark: a placeholder "V" until the logo is designed. */
export function VeoMark() {
  return (
    <span
      className="inline-flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.03em] text-(--text)"
      aria-label="VeoLMS"
      role="img"
    >
      <span className="grid size-6 place-items-center rounded-[7px] bg-(--text) text-(--canvas)">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="size-3.25"
        >
          <path d="M3.2 4.5h4.1l4.7 10.6 4.7-10.6h4.1L13.9 20.2h-3.8z" />
        </svg>
      </span>
      <span aria-hidden="true">
        Veo<b className="font-extrabold text-(--muted)">LMS</b>
      </span>
    </span>
  );
}

export function StageTopBar({
  progress,
  soundOn,
  onToggleSound,
  onSaveAndExit,
  saving = false,
  hidden = false,
}: {
  /** How far along, 0 to 100. */
  progress: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onSaveAndExit?: (() => void) | undefined;
  saving?: boolean;
  hidden?: boolean;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 z-3 h-0.5 bg-(--accent) shadow-[0_0_14px_var(--accent)] transition-[width,background-color] duration-800 ease-(--stage-ease)"
        style={{ width: `${progress}%` }}
      />
      <header
        className={cn(
          "relative z-2 flex min-h-14.5 items-center gap-3 px-5 pt-[max(14px,env(safe-area-inset-top,0px))] @max-[700px]:min-h-12.5 @max-[700px]:px-3 @max-[700px]:pt-3",
          hidden && stageLeaveClasses,
        )}
      >
        <VeoMark />
        <span className="flex-1" />
        <button
          type="button"
          className={stageGhostClasses}
          aria-pressed={soundOn}
          aria-label="Sound"
          onClick={onToggleSound}
        >
          {soundOn ? (
            <SpeakerHigh size={16} aria-hidden="true" />
          ) : (
            <SpeakerSlash size={16} aria-hidden="true" />
          )}
          <span className="@max-[700px]:hidden">Sound</span>
        </button>
        {onSaveAndExit ? (
          <button
            type="button"
            className={stageGhostClasses}
            onClick={onSaveAndExit}
            disabled={saving}
          >
            <SignOut size={16} aria-hidden="true" />
            <span className="@max-[700px]:hidden">Save and exit</span>
          </button>
        ) : null}
      </header>
    </>
  );
}

/** What the stage's chrome does as the launch begins: it fades away. */
export const stageLeaveClasses =
  "pointer-events-none -translate-y-2.5 opacity-0 blur-[6px] transition-[opacity,transform,filter] duration-500";

/** The big question at the top of every screen. */
export function StageQuestion({
  eyebrow,
  title,
  children,
  ref,
  titleClassName,
  hidden = false,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
  titleClassName?: string;
  hidden?: boolean;
}) {
  const shadow = "[text-shadow:0_2px_18px_var(--canvas),0_0_4px_var(--canvas)]";
  return (
    <div
      ref={ref}
      className={cn(
        "relative z-2 grid justify-items-center gap-2.5 px-5 pt-[2vh] text-center @max-[700px]:gap-2 @max-[700px]:pt-[1vh]",
        hidden && stageLeaveClasses,
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            "m-0 text-xs font-extrabold tracking-[0.16em] text-(--accent-ink,var(--accent)) uppercase",
            stageRiseClasses,
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h1
        tabIndex={-1}
        data-stage-heading
        className={cn(
          "m-0 max-w-[18ch] text-[clamp(30px,5.4cqw,68px)] leading-none font-extrabold tracking-[-0.05em] text-balance outline-none @max-[700px]:text-[clamp(26px,8.4cqw,36px)]",
          shadow,
          stageRiseClasses,
          "[animation-delay:.08s]",
          titleClassName,
        )}
      >
        {title}
      </h1>
      {children ? (
        <p
          className={cn(
            "m-0 max-w-[52ch] text-[clamp(14px,1.5cqw,17px)] leading-normal text-pretty text-(--muted)",
            shadow,
            stageRiseClasses,
            "[animation-delay:.16s]",
          )}
        >
          {children}
        </p>
      ) : null}
    </div>
  );
}

/** The frosted glass panel at the foot of each screen. */
export function StageDock({
  children,
  className,
  hidden = false,
  as: Element = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  hidden?: boolean;
  as?: "div" | "form";
} & Record<string, unknown>) {
  return (
    <Element
      {...rest}
      className={cn(
        "relative z-2 mx-auto mb-[max(22px,env(safe-area-inset-bottom,0px))] grid w-[min(560px,calc(100%-32px))] gap-3.5 rounded-[22px] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-5 shadow-[inset_0_1px_0_rgb(255_255_255/.07),0_0_0_1px_color-mix(in_srgb,var(--text)_9%,transparent),0_30px_70px_-30px_rgb(0_0_0/.7)] backdrop-blur-[22px] backdrop-saturate-[1.3] [:root[data-theme=light]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/.8),0_0_0_1px_color-mix(in_srgb,var(--text)_8%,transparent),0_30px_60px_-30px_rgb(15_23_42/.35)]",
        "animate-[stage-rise_1s_.18s_var(--stage-ease)_both] motion-reduce:animate-none",
        "@max-[700px]:mb-[max(10px,env(safe-area-inset-bottom,0px))] @max-[700px]:w-[calc(100%-20px)] @max-[700px]:rounded-[20px] @max-[700px]:p-4",
        hidden && stageLeaveClasses,
        className,
      )}
    >
      {children}
    </Element>
  );
}

/** The big, breathing accent button: "Start your academy", "Launch …". */
export function LaunchButton({
  children,
  className,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      ref={ref}
      {...props}
      className={cn(
        "relative inline-flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-[14px] border-0 bg-(--accent) text-lg! font-extrabold! tracking-[-0.01em] text-(--on-accent) transition-colors hover:bg-(--accent-hover) disabled:animate-none disabled:opacity-50 @max-[700px]:h-14.5 @max-[700px]:text-base!",
        "animate-[stage-breathe_2.4s_ease-in-out_infinite] motion-reduce:animate-none",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[stage-sheen_3s_1s_ease-in-out_infinite] before:bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/.35)_50%,transparent_70%)] before:content-[''] motion-reduce:before:hidden",
        stageFocusClasses,
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The academy's initials on its colour, until it has a logo. */
export function AcademyInitials({
  name,
  size,
  style,
}: {
  name: string;
  size: number;
  style?: { background: string; color: string };
}) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center overflow-hidden bg-(--accent) font-extrabold text-(--on-accent)"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        fontSize: Math.round(size * 0.38),
        ...style,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A short message at the foot of the stage. */
export function StageToast({
  message,
}: {
  message: { text: string; tone: "ok" | "error"; id: number } | null;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute bottom-6 left-1/2 z-60 w-max max-w-[calc(100%-32px)] -translate-x-1/2"
    >
      {message ? (
        <div
          key={message.id}
          className="flex items-center gap-2.5 rounded-xl bg-(--surface-strong) px-3.5 py-2.75 text-[13.5px] font-semibold text-(--text) shadow-[0_16px_34px_rgb(0_0_0/.4)] animate-[stage-rise_.3s_var(--stage-ease)] motion-reduce:animate-none"
        >
          {message.tone === "ok" ? (
            <CheckCircle
              size={18}
              weight="fill"
              className="shrink-0 text-(--success)"
              aria-hidden="true"
            />
          ) : (
            <WarningCircle
              size={18}
              weight="fill"
              className="shrink-0 text-(--danger)"
              aria-hidden="true"
            />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}
