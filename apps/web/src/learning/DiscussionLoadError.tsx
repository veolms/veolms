import { ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";

/**
 * What the lesson's discussion shows when its list could not be loaded: what
 * happened in plain words, and a button to try again.
 */
export function DiscussionLoadError({
  subject,
  testId,
  onRetry,
  retrying = false,
}: {
  /** What failed to load, as it reads in a sentence: "the discussion". */
  subject: "the discussion" | "your notes";
  testId: string;
  onRetry?: () => void;
  /**
   * The list is being asked for again. The message stays where it is, with
   * its button busy, rather than giving way to the loading placeholders: a
   * shorter block there pulled the list's scroll up, which the phone's
   * bottom menu took for the learner scrolling up and came back.
   */
  retrying?: boolean;
}) {
  return (
    // It fills the room under the lesson's header when there is room, and is
    // never squeezed below its own height when there is not (a long
    // description opened above it): squeezed, its words spilled up over the
    // filters and the list had nothing left to scroll.
    <div
      className="flex flex-1 shrink-0 flex-col items-center justify-center px-4 py-12 text-center"
      data-testid={testId}
      role="alert"
    >
      <span
        className="mb-3 grid size-12 place-items-center rounded-full bg-rose-500/12 text-rose-400 [:root[data-theme=light]_&]:text-rose-600"
        aria-hidden="true"
      >
        <WarningCircle size={26} weight="fill" />
      </span>
      <p className="font-semibold text-(--text)">
        We couldn&rsquo;t load {subject}
      </p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-(--muted)">
        Something went wrong on our side or with your connection.
      </p>
      {onRetry ? (
        <Button
          motion="static"
          // The margin is the phone's bottom menu and some room above it.
          className="mt-4 scroll-mb-28"
          onClick={(event) => {
            // A button pressed while partly under the bottom menu is
            // brought clear of it, so its answer can be seen.
            event.currentTarget.scrollIntoView({
              block: "nearest",
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            });
            onRetry();
          }}
          disabled={retrying}
          aria-busy={retrying}
        >
          {retrying ? (
            <LoadingSpinnerIcon size={17} />
          ) : (
            <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
          )}
          <span className="font-semibold">
            {retrying ? "Trying again…" : "Try again"}
          </span>
        </Button>
      ) : null}
    </div>
  );
}
