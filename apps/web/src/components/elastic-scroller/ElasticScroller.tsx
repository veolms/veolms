import { forwardRef, useImperativeHandle } from "react";
import type { CSSProperties, RefObject } from "react";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { clsx } from "clsx";
import { ElasticScrollerGlyph } from "./ElasticScrollerIcon";
import { useElasticScroller } from "./useElasticScroller";
import { useElasticScrollerPreferences } from "./useElasticScrollerPreferences";
import {
  ElasticScrollerSocket,
  elasticScrollerButtonSurface,
} from "./ElasticScrollerVisual";

export interface ElasticScrollerProps {
  scrollportRef: RefObject<HTMLElement | null>;
  ariaControls?: string;
  scrollAreaLabel?: string;
  contentRevision?: string | number;
  className?: string;
  buttonClassName?: string;
  bottomClearance?: number | string;
  disabled?: boolean;
}

type ElasticScrollerStyle = CSSProperties & {
  "--elastic-scroller-spring": string;
  "--elastic-scroller-bottom-clearance": string;
};

export interface ElasticScrollerHandle {
  stop: () => void;
  scrollToStart: () => void;
}

/**
 * A distance-sensitive scroller for an existing scrollport. Render it
 * inside the scrollport and pass the same ref used by the scrolling element.
 */
export const ElasticScroller = forwardRef<
  ElasticScrollerHandle,
  ElasticScrollerProps
>(function ElasticScroller(
  {
    scrollportRef,
    ariaControls,
    scrollAreaLabel = "content",
    contentRevision = "default",
    className,
    buttonClassName,
    bottomClearance = 268,
    disabled = false,
  },
  ref,
) {
  const preferences = useElasticScrollerPreferences();
  const control = useElasticScroller({
    scrollportRef,
    contentRevision,
    lockSide: preferences.lockSide,
    unlockSide: preferences.unlockSide,
    disabled,
  });
  const hasDepth = preferences.appearance === "3d";
  const label = scrollAreaLabel.trim() || "content";
  const actionLabel = label.toLowerCase();
  const normalizedBottomClearance =
    typeof bottomClearance === "number"
      ? `${bottomClearance}px`
      : bottomClearance;
  const spring = "linear(0, 0.62 28%, 0.9 44%, 1.04 58%, 0.985 72%, 1 88%)";
  const speedPercentage = Math.round(control.dragIntensity * 100);
  const endpointFeedback =
    control.mode === "drag" && control.lockArmed
      ? "lock"
      : control.mode === "drag" && control.isLocked && control.unlockArmed
        ? "unlock"
        : null;
  const dragDirection =
    control.dragOffset === 0
      ? control.direction === "down"
        ? 1
        : -1
      : Math.sign(control.dragOffset);
  const endpointFeedbackDistance =
    endpointFeedback === "lock" ? -4 : endpointFeedback === "unlock" ? 4 : 0;
  const buttonFeedbackOffset = dragDirection * endpointFeedbackDistance;
  const puckFeedbackOffset = -buttonFeedbackOffset;

  const { scrollToStart, stop } = control;
  useImperativeHandle(
    ref,
    () => ({
      stop: () => {
        stop();
      },
      scrollToStart,
    }),
    [scrollToStart, stop],
  );

  if (disabled) return null;

  return (
    <div
      className={clsx(
        "elastic-scroller pointer-events-none sticky top-[calc(100%-var(--elastic-scroller-bottom-clearance))] z-30 flex h-0 flex-none justify-center",
        control.visible
          ? "visible translate-y-0 opacity-100"
          : control.direction === "down"
            ? "invisible translate-y-1.5 opacity-0"
            : "invisible -translate-y-1.5 opacity-0",
        "motion-reduce:transition-none",
        className,
      )}
      data-direction={control.direction}
      data-appearance={preferences.appearance}
      data-dragging={control.mode === "drag" ? "" : undefined}
      data-locked={control.isLocked ? "" : undefined}
      data-lock-feedback={control.lockFeedback ?? undefined}
      data-endpoint-feedback={endpointFeedback ?? undefined}
      data-visible={control.visible ? "" : undefined}
      data-base-ui-swipe-ignore
      data-learning-swipe-ignore
      data-sidebar-swipe-ignore
      data-tab-swipe-ignore
      style={
        {
          "--elastic-scroller-spring": spring,
          "--elastic-scroller-bottom-clearance": normalizedBottomClearance,
          transition: control.visible
            ? "visibility 0s linear 0s, opacity 280ms ease, transform 280ms cubic-bezier(0.16, 1, 0.3, 1)"
            : "visibility 0s linear 280ms, opacity 280ms ease, transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        } as ElasticScrollerStyle
      }
      aria-hidden={!control.visible}
    >
      <ElasticScrollerSocket
        appearance={preferences.appearance}
        className="elastic-scroller__progress-puck pointer-events-none absolute -top-1 left-1/2 z-2 transition-[translate] duration-160 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{
          transform: `translate(-50%, ${-control.dragOffset}px)`,
          translate: `0 ${puckFeedbackOffset}px`,
          transition:
            control.mode === "drag"
              ? "translate 160ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "transform 520ms var(--elastic-scroller-spring), translate 160ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        progressRingRef={control.progressRingRef}
        showStatusDot={!control.lockFeedback}
      >
        {control.lockFeedback ? (
          <span
            className="elastic-scroller__lock-icon pointer-events-none absolute inset-0 z-10 inline-flex items-center justify-center text-[color-mix(in_srgb,var(--accent)_78%,white)] drop-shadow-[0_2px_2px_color-mix(in_srgb,var(--canvas)_88%,transparent)]"
            data-lock-feedback={control.lockFeedback}
          >
            <Lock size={20} weight="fill" />
          </span>
        ) : null}
      </ElasticScrollerSocket>
      <span
        ref={control.progressValueRef}
        className="sr-only"
        role="progressbar"
        aria-label={`${label} scroll position`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        aria-valuetext="0% scrolled"
      />
      <span
        className="elastic-scroller__connector pointer-events-none absolute -top-43 left-1/2 z-1 h-96 w-1 origin-center rounded-full bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--accent)_88%,var(--surface)),color-mix(in_srgb,var(--accent)_44%,transparent)_50%,color-mix(in_srgb,var(--accent)_88%,var(--surface)))] shadow-[0_4px_12px_color-mix(in_srgb,var(--accent-shadow)_26%,transparent)] motion-reduce:transition-none"
        data-visible
        style={{
          opacity: control.dragIntensity,
          transform: `translateX(-50%) scaleY(${control.dragIntensity})`,
          transition:
            control.mode === "drag"
              ? "none"
              : "opacity 180ms ease, transform 520ms var(--elastic-scroller-spring)",
        }}
        aria-hidden="true"
      />
      <button
        type="button"
        data-fixed-radius
        className={clsx(
          "elastic-scroller__button pointer-events-auto relative z-10 isolate inline-flex size-10 flex-none touch-none cursor-pointer items-center justify-center rounded-full border p-0 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) motion-reduce:transition-none",
          elasticScrollerButtonSurface(preferences.appearance),
          hasDepth
            ? "text-(--text) hover:bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong)_82%,white),color-mix(in_srgb,var(--surface-strong)_66%,var(--accent)))] hover:text-(--accent-contrast,#fff)"
            : "text-[color-mix(in_srgb,var(--text)_68%,var(--muted)_32%)] hover:bg-[color-mix(in_srgb,var(--surface-strong)_76%,var(--accent)_24%)] hover:text-(--accent-contrast,#fff)",
          control.mode !== "idle" &&
            (hasDepth
              ? "bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong,var(--surface))_72%,white)_0%,color-mix(in_srgb,var(--surface-strong,var(--surface))_56%,var(--accent))_54%,color-mix(in_srgb,var(--accent)_38%,var(--canvas))_100%)] text-(--accent-contrast,#fff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_34%,transparent),inset_0_-2px_3px_color-mix(in_srgb,var(--canvas)_42%,transparent),0_3px_0_color-mix(in_srgb,var(--canvas)_62%,var(--accent)),0_10px_24px_color-mix(in_srgb,black_48%,transparent),0_18px_34px_color-mix(in_srgb,var(--accent-shadow)_38%,transparent)]"
              : "bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_68%,var(--accent)_32%)] text-(--accent-contrast,#fff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_18%,transparent),0_8px_24px_color-mix(in_srgb,var(--accent-shadow)_28%,transparent)]"),
          buttonClassName,
        )}
        data-direction={control.direction}
        data-appearance={preferences.appearance}
        data-icon={preferences.icon}
        data-icon-animation={String(preferences.animateIcon)}
        data-lock-side={preferences.lockSide}
        data-unlock-side={preferences.unlockSide}
        data-lock-state={
          control.isLocked ? "locked" : (control.lockFeedback ?? "idle")
        }
        data-scroll-mode={control.mode}
        data-drag-distance={Math.round(Math.abs(control.dragOffset))}
        data-drag-inline-distance={Math.round(control.dragInlineOffset)}
        style={{
          transform: `translateY(${control.dragOffset}px)`,
          translate: `0 ${buttonFeedbackOffset}px`,
          transition:
            control.mode === "drag"
              ? "color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, translate 160ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 520ms var(--elastic-scroller-spring), translate 160ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-controls={ariaControls}
        aria-label={
          control.mode === "drag"
            ? control.isLocked
              ? control.unlockArmed
                ? `Unlock ${actionLabel} scrolling — release to stop`
                : `Adjust locked ${actionLabel} scrolling — drag ${preferences.unlockSide} to unlock`
              : control.lockFeedback === "closed"
                ? `Lock ${actionLabel} scrolling — release to continue`
                : `Scrolling ${actionLabel} ${control.direction} — drag ${preferences.lockSide} to lock or release to stop`
            : control.mode === "locked"
              ? `${label} scrolling locked ${control.direction} at ${speedPercentage}% speed — drag ${preferences.unlockSide} to unlock`
              : control.mode === "edge"
                ? `Stop ${actionLabel} scrolling`
                : control.direction === "down"
                  ? `Scroll ${actionLabel} to bottom`
                  : `Scroll ${actionLabel} to top`
        }
        title={
          control.mode === "drag"
            ? control.isLocked
              ? control.unlockArmed
                ? "Release to unlock"
                : `Drag ${preferences.unlockSide} to unlock · Move up or down to change speed`
              : control.lockFeedback === "closed"
                ? `Release to lock at ${speedPercentage}% speed`
                : `Drag ${preferences.lockSide} to lock · ${speedPercentage}% speed`
            : control.mode === "locked"
              ? `Locked at ${speedPercentage}% speed · Drag ${preferences.unlockSide} to unlock`
              : control.mode === "edge"
                ? "Stop scrolling"
                : control.direction === "down"
                  ? "Drag up or down — farther scrolls faster. Click to scroll to bottom"
                  : "Drag up or down — farther scrolls faster. Click to scroll to top"
        }
        tabIndex={control.visible ? 0 : -1}
        onClick={control.handleClick}
        onPointerDown={control.handlePointerDown}
        onPointerMove={control.handlePointerMove}
        onPointerUp={control.handlePointerFinish}
        onPointerCancel={control.handlePointerCancel}
      >
        <ElasticScrollerGlyph
          icon={preferences.icon}
          className={clsx(
            "elastic-scroller__icon relative z-10 motion-reduce:transition-none",
            hasDepth &&
              "drop-shadow-[0_2px_1px_color-mix(in_srgb,var(--canvas)_74%,transparent)]",
            preferences.animateIcon
              ? "transition-transform duration-180 ease-[cubic-bezier(0.16,1,0.3,1)]"
              : "transition-none",
            control.direction === "down" && "rotate-180",
          )}
          size={20}
        />
      </button>
    </div>
  );
});
