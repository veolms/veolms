import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { classNames } from "../utils/classNames";
import type { VideoEngineError } from "../core/errors";
import type { VideoSource } from "../core/types";
import { useState, type ReactNode } from "react";

export function VideoPlayerCloseButton({
  icon,
  onClose,
}: {
  icon: ReactNode;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Close video player"
      title="Close video player"
      className="absolute right-2 top-2 z-30 inline-flex size-9 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      onClick={onClose}
    >
      {icon}
    </button>
  );
}

export interface VideoPlayerNoticeAction {
  label: string;
  icon?: ReactNode;
  /** Larger and bolder where there is room: the one thing the notice asks. */
  prominent?: boolean;
  /** Shown but not pressable (a report on its way, or sent). */
  disabled?: boolean;
  onSelect: () => void;
}

export interface VideoPlayerNoticeProps {
  title: string;
  /** Drawn above the title, and only where there is room for it. */
  icon?: ReactNode;
  /**
   * A smaller drawing of the icon, for room that is too short for the icon
   * itself but can still carry something. Without it that room has no icon.
   */
  smallIcon?: ReactNode;
  action?: VideoPlayerNoticeAction;
  /**
   * A second, lesser action beside the first (reporting the problem): an
   * outlined button, so the first stays the one the eye goes to.
   */
  secondaryAction?: VideoPlayerNoticeAction;
  /** Drawn behind the message, filling the box: a picture, a wash. */
  background?: ReactNode;
  /** For the layer the background is on (its place among the host's layers). */
  backgroundClassName?: string;
  /**
   * For the room the message is centred and sized in. A host with controls
   * along the box's edges insets it here (`top-12!`), so the message is laid
   * out in what is left between them and never under them; it can also be
   * raised above those controls, apart from the background.
   */
  contentClassName?: string;
  className?: string;
  role?: "alert" | "status";
}

/**
 * One line saying why a player has nothing to show, and the action that may
 * put it right. It is sized by the room it is given, not by the screen: the
 * same player is a full-width video on one page and a window a few lines
 * tall on the next, so the queries below are on that room's height (the
 * whole box, unless the host insets it, see `contentClassName`).
 *
 * - The action is there at every size.
 * - It is always in the middle of the box, both ways.
 * - In a short box the type and the action are smaller.
 * - A small player keeps controls in its top corners (close, expand). The
 *   text is held to the width between them, so in a narrow box it goes onto
 *   a second line instead of running under a button or being pushed down.
 * - The icon joins only in room tall enough for all three; in a little less,
 *   its smaller drawing does, and in less than that there is none.
 * - In a box as tall as a desktop's player the line is set as a heading.
 *
 * The notice takes no pointer events, so what lies under it (a mini player's
 * tap-to-expand surface) still gets them. Only the action does.
 */
export function VideoPlayerNotice({
  action,
  background,
  backgroundClassName,
  className,
  contentClassName,
  icon,
  role,
  secondaryAction,
  smallIcon,
  title,
}: VideoPlayerNoticeProps) {
  return (
    <div
      className={classNames("pointer-events-none absolute inset-0", className)}
      role={role}
      data-video-player-notice=""
    >
      {background ? (
        <div className={classNames("absolute inset-0", backgroundClassName)}>
          {background}
        </div>
      ) : null}
      <div
        className={classNames(
          "absolute inset-0 grid place-items-center [container-type:size]",
          contentClassName,
        )}
        data-video-player-notice-content=""
      >
        <div className="grid size-full place-items-center p-2 text-center text-white [@container_(min-height:10.5rem)]:p-4 [@container_(min-height:15rem)]:p-6">
          {/* 5.5rem: a 2.25rem corner control and its 0.5rem inset, each side. */}
          <div className="flex max-w-[min(24rem,calc(100cqw-5.5rem))] flex-col items-center gap-1.5 [@container_(min-height:10.5rem)]:gap-2.5 [@container_(min-height:15rem)]:gap-4">
            {smallIcon ? (
              <span className="hidden [@container_(min-height:7.5rem)_and_(max-height:14.99rem)]:block">
                {smallIcon}
              </span>
            ) : null}
            {icon ? (
              <span className="hidden [@container_(min-height:15rem)]:block">
                {icon}
              </span>
            ) : null}
            <h2 className="text-sm leading-tight font-semibold text-balance [@container_(min-height:10.5rem)]:text-base [@container_(min-height:20rem)]:text-2xl [@container_(min-height:20rem)]:font-bold [@container_(min-height:20rem)]:tracking-[-0.01em]">
              {title}
            </h2>
            {action || secondaryAction ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {action ? (
                  <NoticeButton action={action} variant="primary" />
                ) : null}
                {secondaryAction ? (
                  <NoticeButton action={secondaryAction} variant="outline" />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One of a notice's actions: the filled one, or the outlined lesser one. */
function NoticeButton({
  action,
  variant,
}: {
  action: VideoPlayerNoticeAction;
  variant: "primary" | "outline";
}) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      className={classNames(
        "pointer-events-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default [@container_(min-height:10.5rem)]:min-h-10 [@container_(min-height:10.5rem)]:gap-2 [@container_(min-height:10.5rem)]:px-4 [@container_(min-height:10.5rem)]:py-2 [@container_(min-height:10.5rem)]:text-sm",
        variant === "primary"
          ? "bg-white text-black hover:bg-white/85"
          : "border border-white/50 bg-black/35 text-white backdrop-blur-sm hover:border-white/80 hover:bg-white/15 disabled:hover:border-white/50 disabled:hover:bg-black/35",
        action.prominent &&
          "[@container_(min-height:15rem)]:min-h-12 [@container_(min-height:15rem)]:px-6 [@container_(min-height:15rem)]:text-base! [@container_(min-height:15rem)]:font-bold!",
      )}
      onClick={action.onSelect}
    >
      {action.icon ? (
        <span className="grid size-3.5 place-items-center [@container_(min-height:10.5rem)]:size-4.5 [&>svg]:size-full">
          {action.icon}
        </span>
      ) : null}
      {action.label}
    </button>
  );
}

/**
 * Reporting the error to the host's team, from the notice. `send` gathers
 * and sends what the team needs (the page, a screenshot, the requests) and
 * resolves with a short reference to show (a ticket number), or rejects.
 */
export interface PlayerErrorReport {
  send: (error: VideoEngineError) => Promise<string | null>;
  icon?: ReactNode;
  /** Shown once the report is sent. */
  sentIcon?: ReactNode;
}

type ReportState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; reference: string | null }
  | { kind: "failed" };

/** The report action for `error`; a new error starts it over. */
function useReportAction(
  report: PlayerErrorReport | undefined,
  error: VideoEngineError | null,
): VideoPlayerNoticeAction | undefined {
  // Kept with the error it is about: another error reads as not reported.
  const [entry, setEntry] = useState<{
    error: VideoEngineError | null;
    state: ReportState;
  }>({ error: null, state: { kind: "idle" } });
  if (!report || !error) return undefined;
  const state: ReportState =
    entry.error === error ? entry.state : { kind: "idle" };
  switch (state.kind) {
    case "sending":
      return {
        label: "Sending report…",
        icon: report.icon,
        disabled: true,
        onSelect: () => {},
      };
    case "sent":
      return {
        label: state.reference ? `Reported · ${state.reference}` : "Reported",
        icon: report.sentIcon ?? report.icon,
        disabled: true,
        onSelect: () => {},
      };
    default:
      return {
        label: state.kind === "failed" ? "Not sent · Report again" : "Report",
        icon: report.icon,
        onSelect: () => {
          const reported = error;
          const settle = (next: ReportState) =>
            setEntry((current) =>
              current.error === reported
                ? { error: reported, state: next }
                : current,
            );
          setEntry({ error: reported, state: { kind: "sending" } });
          report.send(reported).then(
            (reference) => settle({ kind: "sent", reference }),
            () => settle({ kind: "failed" }),
          );
        },
      };
  }
}

export interface PlayerErrorNoticeProps {
  /** Drawn behind the message (see `VideoPlayerNotice`). */
  background?: ReactNode;
  /** Replaces the warning sign above the message with a picture of the host's. */
  icon?: ReactNode;
  /** See `VideoPlayerNotice`. */
  smallIcon?: ReactNode;
  backgroundClassName?: string;
  contentClassName?: string;
  className?: string;
  /**
   * Dims and blurs what is behind the message. Left off where the player's
   * controls stay in use around the message and must be seen clearly.
   */
  backdrop?: boolean;
  /**
   * The source the player was asked to play. Retrying falls back to it when
   * the failure happened before the engine had taken a source on.
   */
  source?: VideoSource;
  /** Adds a Report button beside Try again (see `PlayerErrorReport`). */
  report?: PlayerErrorReport;
}

/**
 * The playback error as a layer, with nothing of its own in the corners: for
 * controls that keep theirs on top of it (a mini player's expand and close).
 * A player with no such controls uses `ErrorOverlay`, which adds a way out.
 */
export function PlayerErrorNotice({
  backdrop = true,
  background,
  backgroundClassName,
  className,
  contentClassName,
  icon,
  smallIcon,
  source,
  report,
}: PlayerErrorNoticeProps) {
  const controller = usePlayerController();
  const error = usePlayerState(({ media }) => media.error);
  const loadedSource = usePlayerState(({ media }) => media.source);
  const { retry: RetryIcon, warning: WarningIcon } = usePlayerTheme().icons;
  const reportAction = useReportAction(report, error);
  if (!error) return null;

  return (
    <VideoPlayerNotice
      role="alert"
      background={background}
      backgroundClassName={backgroundClassName}
      contentClassName={contentClassName}
      smallIcon={smallIcon}
      className={classNames(
        backdrop && "bg-black/75 backdrop-blur-sm",
        className,
      )}
      title="Something went wrong"
      icon={icon ?? <WarningIcon size={42} active className="text-amber-300" />}
      // Offered for every error, not only the ones the engine marks as
      // recoverable: a failure it could not classify is often transient,
      // and a retry costs the viewer nothing.
      action={
        loadedSource || source
          ? {
              label: "Try again",
              icon: <RetryIcon size={18} />,
              onSelect: () => {
                const attempt = loadedSource
                  ? controller.reload()
                  : source
                    ? controller.load({ source })
                    : Promise.resolve();
                void attempt.catch(() => undefined);
              },
            }
          : undefined
      }
      secondaryAction={reportAction}
    />
  );
}

export interface ErrorOverlayProps {
  onClose?: () => void;
  /**
   * The source the player was asked to play. Retrying falls back to it when
   * the failure happened before the engine had taken a source on.
   */
  source?: VideoSource;
}

export function ErrorOverlay({ onClose, source }: ErrorOverlayProps) {
  const errored = usePlayerState(({ media }) => media.error !== null);
  const { close: CloseIcon } = usePlayerTheme().icons;
  if (!errored) return null;

  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden rounded-[inherit]"
      data-video-player-error-overlay=""
    >
      <PlayerErrorNotice source={source} />
      {onClose ? (
        <VideoPlayerCloseButton
          icon={<CloseIcon size={20} />}
          onClose={onClose}
        />
      ) : null}
    </div>
  );
}
