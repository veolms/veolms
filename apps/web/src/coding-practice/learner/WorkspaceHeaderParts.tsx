import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CloudCheckIcon as CloudCheck } from "@phosphor-icons/react/CloudCheck";
import { CloudSlashIcon as CloudSlash } from "@phosphor-icons/react/CloudSlash";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { KeyboardIcon as Keyboard } from "@phosphor-icons/react/Keyboard";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { PauseIcon as Pause } from "@phosphor-icons/react/Pause";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { TimerIcon as Timer } from "@phosphor-icons/react/Timer";
import { FOCUS_RING, IconAction, MONO } from "../shared/ui";
import { clock, type PracticeTimer } from "./usePracticeTimer";

export type SaveStatus = "saved" | "saving" | "unsaved" | "offline";

/** "Saved" as LeetCode's editor says it: the code is safe. */
export function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const text =
    status === "saving"
      ? "Saving…"
      : status === "unsaved"
        ? "Editing"
        : status === "offline"
          ? "Saved on this device"
          : "Saved";
  return (
    <span
      role="status"
      title={
        status === "offline"
          ? "We could not reach the server. Your code is safe on this device and will be sent later."
          : undefined
      }
      className="hidden items-center gap-1 text-xs font-medium text-(--muted) @3xl:inline-flex"
    >
      {status === "offline" ? (
        <CloudSlash size={14} weight="bold" aria-hidden="true" />
      ) : (
        <CloudCheck size={14} weight="bold" aria-hidden="true" />
      )}
      {text}
    </span>
  );
}

/**
 * The question's timer: a stopwatch, or a countdown for a timed round.
 * Before the learner starts it waits (a press starts it, so do typing and
 * Run); then a press opens its menu: pause or go on, start again, hide.
 */
export function TimerControl({ timer }: { timer: PracticeTimer }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const shown =
    timer.remaining !== null
      ? clock(Math.max(timer.remaining, 0))
      : clock(timer.seconds);
  const warn = timer.remaining !== null && timer.remaining <= 300;
  return (
    <div ref={box} className="relative flex items-center">
      {timer.hidden ? (
        <IconAction label="Show the timer" onClick={timer.toggleHidden}>
          <Timer size={16} weight="bold" aria-hidden="true" />
        </IconAction>
      ) : (
        <button
          type="button"
          onClick={() =>
            timer.started ? setOpen((value) => !value) : timer.resume()
          }
          title={
            timer.started
              ? undefined
              : "The timer starts when you start typing. Press to start it now."
          }
          aria-label={
            timer.started
              ? `Timer ${shown}${timer.running ? "" : ", paused"}. Options`
              : `Timer ${shown}, not started. Start the timer`
          }
          aria-expanded={timer.started ? open : undefined}
          className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[0.8125rem]! font-semibold! tabular-nums ${MONO} ${FOCUS_RING} ${
            timer.timeUp
              ? "bg-[color-mix(in_srgb,var(--code-fail)_14%,transparent)] text-(--code-fail)"
              : warn
                ? "text-(--code-warn)"
                : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
          }`}
        >
          <Timer size={15} weight="bold" aria-hidden="true" />
          {timer.timeUp ? "Time's up" : shown}
          {timer.running ? null : timer.started ? (
            <Pause size={12} weight="fill" aria-hidden="true" />
          ) : (
            <Play size={12} weight="fill" aria-hidden="true" />
          )}
        </button>
      )}
      {open ? (
        <div
          role="menu"
          className="absolute top-10 right-0 z-30 grid min-w-44 gap-0.5 rounded-xl bg-(--surface) p-1.5 shadow-xl ring-1 ring-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        >
          {(
            [
              timer.running
                ? {
                    label: "Pause",
                    icon: <Pause size={15} weight="fill" />,
                    action: timer.pause,
                  }
                : {
                    label: "Go on",
                    icon: <Play size={15} weight="fill" />,
                    action: timer.resume,
                  },
              {
                label: "Start again",
                icon: <ArrowCounterClockwise size={15} weight="bold" />,
                action: timer.reset,
              },
              {
                label: "Hide",
                icon: <EyeSlash size={15} weight="bold" />,
                action: timer.toggleHidden,
              },
            ] satisfies { label: string; icon: ReactNode; action: () => void }[]
          ).map(({ label, icon, action }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                action();
                setOpen(false);
              }}
              className={`flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-sm! font-medium! text-(--text) hover:bg-(--hover) ${FOCUS_RING}`}
            >
              <span aria-hidden="true" className="text-(--text-secondary)">
                {icon}
              </span>
              {label}
            </button>
          ))}
          {timer.limit !== null ? (
            <p className="px-2.5 pt-1 pb-1.5 text-xs text-(--muted)">
              Round of {Math.round(timer.limit / 60)} minutes ·{" "}
              {clock(timer.seconds)} so far
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface QuestionNavigation {
  /** "3 / 12" */
  position: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onOpenList: () => void;
}

/** Problem list, previous and next, as LeetCode's top bar. */
export function QuestionNavigator({ nav }: { nav: QuestionNavigation }) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={nav.onOpenList}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[0.8125rem]! font-semibold! text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) ${FOCUS_RING}`}
      >
        <ListBullets size={16} weight="bold" aria-hidden="true" />
        <span className="@max-3xl:sr-only">Questions</span>
        <span className="text-xs font-normal text-(--muted) tabular-nums @max-xl:hidden">
          {nav.position}
        </span>
      </button>
      <IconAction
        label="Previous question"
        disabled={!nav.onPrevious}
        onClick={() => nav.onPrevious?.()}
      >
        <CaretLeft size={15} weight="bold" aria-hidden="true" />
      </IconAction>
      <IconAction
        label="Next question"
        disabled={!nav.onNext}
        onClick={() => nav.onNext?.()}
      >
        <CaretRight size={15} weight="bold" aria-hidden="true" />
      </IconAction>
    </div>
  );
}

const SHORTCUTS: readonly (readonly [string, string])[] = [
  ["Ctrl + '", "Run the examples"],
  ["Ctrl + Enter", "Submit"],
  ["Ctrl + F / Ctrl + H", "Find / replace"],
  ["Ctrl + D", "Select the next match (another cursor)"],
  ["Ctrl + Shift + L", "Select every match"],
  ["Alt + click", "Add a cursor"],
  ["Alt + drag", "Box selection"],
  ["Ctrl + /", "Comment / uncomment lines"],
  ["Shift + Alt + A", "Block comment"],
  ["Alt + ↑ / ↓", "Move the line up / down"],
  ["Shift + Alt + ↑ / ↓", "Copy the line up / down"],
  ["Ctrl + Shift + K", "Delete the line"],
  ["Ctrl + L", "Select the line"],
  ["Ctrl + ] / Ctrl + [", "Indent / outdent"],
  ["Ctrl + G", "Go to line"],
  ["Ctrl + Shift + [ / ]", "Fold / unfold"],
  ["Ctrl + Space", "Suggestions"],
  ["Ctrl + Z / Ctrl + Shift + Z", "Undo / redo"],
  ["Esc, then Tab", "Leave the editor"],
];

/** VS Code's editing keys work in the editor; this lists them (⌘ on a Mac). */
export function ShortcutsButton() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={box} className="relative @max-2xl:hidden">
      <IconAction
        label="Keyboard shortcuts"
        onClick={() => setOpen((value) => !value)}
      >
        <Keyboard size={16} weight="bold" aria-hidden="true" />
      </IconAction>
      {open ? (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="absolute top-10 right-0 z-30 w-80 rounded-xl bg-(--surface) p-3 shadow-xl ring-1 ring-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        >
          <p className="mb-2 text-xs text-(--muted)">
            The editor uses VS Code&apos;s keys. On a Mac, Ctrl is ⌘ and Alt is
            ⌥.
          </p>
          <dl className="grid max-h-80 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 overflow-y-auto text-xs">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt
                  className={`font-semibold whitespace-nowrap text-(--text) ${MONO}`}
                >
                  {keys}
                </dt>
                <dd className="text-(--text-secondary)">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
