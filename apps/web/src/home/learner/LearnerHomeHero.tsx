import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useDailyQuote } from "../../services/quotes";
import { HeroDesk } from "../guest/HeroDesk";
import { LearnerHeroClock } from "./LearnerHeroClock";
import { LearnerPhoneBackdrop } from "./LearnerPhoneBackdrop";
import {
  copyOnDeskClasses,
  heroClockClasses,
  heroCopyBoxClasses,
  heroFadeClasses,
  heroGreetingBoxClasses,
  heroGreetingClasses,
  heroNameClasses,
  heroQuoteBoxClasses,
  heroQuoteClasses,
  heroSizeClasses,
  pictureBandClasses,
  picturePlacementClasses,
} from "./learnerHeroLayout";
import {
  LearnerNameSkeleton,
  LearnerQuoteSkeleton,
} from "./LearnerHomeSkeleton";

/**
 * The line the hero leaves the learner with when the quote of the day
 * cannot be loaded.
 */
const fallbackQuote = {
  text: "The beautiful thing about learning is that nobody can take it away from you.",
  author: "B.B. King",
};

/**
 * The author stands at the right end of the column, which is where a quote
 * that fills its lines ends. A short quote is set in balanced lines that end
 * well short of that, and the author would be left out on its own; so it is
 * drawn in until its dash starts where the longest line of the quote ends.
 * CSS cannot size anything to lines set that way, hence the measuring.
 */
function useAuthorBesideQuote(text: string) {
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const captionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const quote = quoteRef.current;
    const caption = captionRef.current;
    if (!quote || !caption) return;

    const place = () => {
      const lines = document.createRange();
      lines.selectNodeContents(quote);
      const left = quote.getBoundingClientRect().left;
      let quoteEnd = 0;
      for (const line of lines.getClientRects()) {
        quoteEnd = Math.max(quoteEnd, line.right - left);
      }
      const author = document.createRange();
      author.selectNodeContents(caption);
      const spare =
        caption.clientWidth - quoteEnd - author.getBoundingClientRect().width;
      caption.style.paddingRight =
        quoteEnd > 0 && spare > 0 ? `${Math.floor(spare)}px` : "";
      // A quote that fits on one line is a thin thing; its author stands a
      // little further under it than under a quote of several lines.
      const lineHeight = parseFloat(getComputedStyle(quote).lineHeight);
      const oneLine =
        lineHeight > 0 &&
        quote.getBoundingClientRect().height < lineHeight * 1.5;
      caption.style.marginTop = oneLine ? "0.75rem" : "";
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(quote);
    // The serif face arrives after the first paint and changes the lines.
    void document.fonts.ready.then(place);
    return () => observer.disconnect();
  }, [text]);

  return { quoteRef, captionRef };
}

/**
 * The hero of an enrolled learner's home: a greeting, what to do next, the
 * course to do it in, and their learning goals on the laptop in the picture.
 *
 * A page 50rem or wider lays the copy over the picture's empty left side,
 * as the guest hero does. The picture is held by its right side (see
 * `picturePlacementClasses`), so the desk keeps its size and place there
 * however wide the hero is. The
 * copy is the date and time, the greeting on one line, a quote, and the
 * course to carry on with as a thin row, evenly spaced and centred in the
 * hero's height (see `copyOnDeskClasses`).
 *
 * The copy's box ends a picture's height in from the hero's right edge,
 * and the greeting is cut off there rather than wrapped, so that it stays
 * one line. The laptop's lid begins `--picture-shift` further on, which is
 * the room between the course's row and the laptop.
 *
 * Narrower pages (a tablet held upright, a phone) stack them: the same
 * copy, and the picture in a band of its own below it.
 *
 * A phone has no band and no laptop. The picture is a glow behind the copy
 * (see `LearnerPhoneBackdrop`), and the goals have a card of their own
 * between the quote and the course (`goalCard`). The lamp is not to be
 * seen there: the hero's top right corner is its switch instead, and the
 * corner's glow is its light.
 */
export function LearnerHomeHero({
  timeGreeting,
  firstName,
  namePending,
  resumeRow,
  goalCard,
  laptopScreen,
}: {
  /** "Good evening", by the hour. */
  timeGreeting: string;
  /** The learner's first name; it may be empty. */
  firstName: string;
  /** The session has not said yet who the learner is. */
  namePending: boolean;
  /**
   * The course to carry on with (see `LearnerResumeRow`), or what stands in
   * for it until the learner's courses are known.
   */
  resumeRow: ReactNode;
  /** Today's goal as a card, for a phone (see `LearnerGoalCard`). */
  goalCard: ReactNode;
  /** What the laptop in the picture shows (see `HeroDesk`). */
  laptopScreen: ReactNode;
}) {
  const quoteQuery = useDailyQuote();
  const quote = quoteQuery.data ?? fallbackQuote;
  // Until the day's quote has answered, its place is held (see
  // `LearnerQuoteSkeleton`) and there is no author to stand beside it.
  const quotePending = quoteQuery.isPending;
  const { quoteRef, captionRef } = useAuthorBesideQuote(
    quotePending ? "" : quote.text,
  );
  return (
    <HeroDesk
      labelledBy="learner-home-hero-title"
      className={heroSizeClasses}
      lampCornerOnPhone
      fadeClassName={heroFadeClasses}
      picturePosition={picturePlacementClasses}
      laptopScreen={laptopScreen}
    >
      {(pictures) => (
        <div data-learner-home-hero="" className={heroCopyBoxClasses}>
          <LearnerPhoneBackdrop />
          {/* Like the box around it, this one takes no pointer itself. */}
          <div
            className={`pointer-events-none! *:pointer-events-auto ${copyOnDeskClasses}`}
          >
            <div className={heroGreetingBoxClasses}>
              <div className="min-w-0">
                <LearnerHeroClock className={heroClockClasses} />
                <h1
                  id="learner-home-hero-title"
                  className={heroGreetingClasses}
                >
                  {firstName ? (
                    <>
                      {timeGreeting},{" "}
                      <span className={heroNameClasses}>{firstName}.</span>
                    </>
                  ) : namePending ? (
                    <>
                      {timeGreeting}, <LearnerNameSkeleton />
                    </>
                  ) : (
                    `${timeGreeting}.`
                  )}
                </h1>
              </div>

              {quotePending ? (
                <LearnerQuoteSkeleton />
              ) : (
                <figure className={heroQuoteBoxClasses}>
                  <blockquote
                    ref={quoteRef}
                    className={`${heroQuoteClasses} text-slate-200 [:root[data-theme=light]_&]:text-slate-700`}
                  >
                    “{quote.text}”
                  </blockquote>
                  <figcaption
                    ref={captionRef}
                    className="mt-1.5 flex items-center justify-end gap-2.5 text-[0.8125rem] leading-4 text-slate-400 max-sm:text-(--muted)! [:root[data-theme=light]_&]:text-slate-600"
                  >
                    <span
                      aria-hidden="true"
                      className="h-px w-6 bg-current/60"
                    />
                    {quote.author}
                  </figcaption>
                </figure>
              )}
            </div>

            {goalCard}
            {resumeRow}
          </div>

          <div className={pictureBandClasses}>{pictures}</div>
        </div>
      )}
    </HeroDesk>
  );
}
