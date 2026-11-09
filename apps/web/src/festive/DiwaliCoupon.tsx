import { useEffect, useRef, useState } from "react";

const COPIED_MS = 1800;

const copyWordClasses = {
  /** In the sidebar the word shows only where its box has room for it. */
  container: "hidden [@container_diwali_(min-width:12.5rem)]:inline",
  always: "inline",
} as const;

/**
 * The festive coupon: the code on a ticket (notches cut at its two ends)
 * that copies with a press, and the note under it on one line, centred,
 * running past the ticket's edges rather than wrapping where it is narrow.
 * Shown in the sidebar and in the phone's menu drawer.
 */
export function DiwaliCoupon({
  code,
  note,
  copyWord = "always",
  className = "",
}: {
  code: string;
  note: string;
  copyWord?: keyof typeof copyWordClasses;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  const copy = () => {
    void navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(
      () => setCopied(false),
      COPIED_MS,
    );
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy coupon code ${code}`}
        className="group/coupon flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-dashed border-[#E9B872]/55 bg-[#E9B872]/6 px-3.5 text-left transition-colors duration-150 [mask:radial-gradient(circle_at_0_50%,transparent_7px,black_7.5px)_left/51%_100%_no-repeat,radial-gradient(circle_at_100%_50%,transparent_7px,black_7.5px)_right/51%_100%_no-repeat] hover:border-[#E9B872]/85 hover:bg-[#E9B872]/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E9B872] [:root[data-theme=light]_&]:border-[#B4610E]/45 [:root[data-theme=light]_&]:bg-[#B4610E]/6"
      >
        <span className="flex min-w-0 flex-1 flex-col pl-1">
          {/* "Coupon code", or "Code" where both words do not fit on one
              line: listed in reverse and laid out right to left, so
              "Coupon" is the word that wraps, onto a line that is clipped
              away. */}
          <span className="flex h-2.5 flex-row-reverse flex-wrap justify-end gap-x-[0.5em] overflow-hidden text-[0.625rem] leading-none font-semibold tracking-[0.18em] text-[#C9A877] uppercase [:root[data-theme=light]_&]:text-[#8A5A1E]">
            <span>Code</span>
            <span>Coupon</span>
          </span>
          <span className="mt-1 truncate font-mono text-[0.9375rem] leading-tight font-semibold tracking-[0.1em] text-[#FFE2A8] [:root[data-theme=light]_&]:text-[#7C3A0A]">
            {code}
          </span>
        </span>
        {/* Copying turns the icon into a tick; the word stays. */}
        <span className="inline-flex shrink-0 items-center gap-1.5 pr-1 text-[0.78rem] font-semibold text-[#E9B872] [:root[data-theme=light]_&]:text-[#A3520B]">
          {copied ? (
            <svg
              viewBox="0 0 24 24"
              className="size-3.5 text-[#9be7b0] [:root[data-theme=light]_&]:text-emerald-700"
              aria-hidden="true"
            >
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
              <rect
                x="8"
                y="8"
                width="12"
                height="12"
                rx="2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          )}
          <span className={copyWordClasses[copyWord]}>Copy</span>
          <span aria-live="polite" className="sr-only">
            {copied ? "Copied" : ""}
          </span>
        </span>
      </button>
      {note ? (
        <p className="-mx-3 mt-2.5 flex justify-center text-[0.8125rem] leading-snug font-semibold tracking-[0.01em] whitespace-nowrap text-[#F2C27A] [:root[data-theme=light]_&]:text-[#A3520B]">
          {note}
        </p>
      ) : null}
    </div>
  );
}
