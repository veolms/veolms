import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { CloudSlash } from "@phosphor-icons/react/CloudSlash";
import { Button } from "../../components/Button";
import { quietButtonClasses } from "./overviewStyles";

/**
 * Shown in place of the course page when the course could not be fetched
 * (a dropped connection, a server that did not answer). It is not the "not
 * found" page: the course exists, and nothing of the learner's is lost, so
 * it says so, and offers the two things that help: another try, and the way
 * back.
 */
export function CourseLoadError({
  onRetry,
  onBack,
  backLabel = "Back to courses",
}: {
  onRetry: () => void;
  /** Left out where there is nowhere to go back to. */
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="mx-auto box-border flex min-h-[min(26rem,70vh)] w-full max-w-275 flex-col items-center justify-center gap-5 px-6 py-10 text-center text-(--text)"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent-ink,var(--accent))"
      >
        <CloudSlash size={30} weight="duotone" />
      </span>

      <div className="flex max-w-md flex-col gap-2">
        <h2 className="m-0 text-[1.35rem] leading-tight font-bold tracking-[-0.02em]">
          We couldn&rsquo;t open this course just now
        </h2>
        <p className="m-0 text-[0.95rem] leading-relaxed text-(--muted)">
          It&rsquo;s most likely a brief hiccup with the connection. Your course
          and your progress are safe, so give it another go in a moment.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <Button motion="static" className="h-11! px-5!" onClick={onRetry}>
          <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
          <span>Try again</span>
        </Button>
        {onBack ? (
          <button type="button" className={quietButtonClasses} onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
