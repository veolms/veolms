import { forwardRef, useImperativeHandle } from "react";
import type { CSSProperties, RefObject } from "react";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { cn } from "../../lib/utils";
import { ElasticScrollGlyph } from "./ElasticScrollIcon";
import {
  ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE,
  ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS,
} from "./elasticScrollControlModel";
import { useElasticScrollControl } from "./useElasticScrollControl";
import { useElasticScrollPreferences } from "./useElasticScrollPreferences";

export interface ElasticScrollControlProps {
  scrollportRef: RefObject<HTMLElement | null>;
  ariaControls?: string;
  scrollAreaLabel?: string;
  contentRevision?: string | number;
  className?: string;
  buttonClassName?: string;
  bottomClearance?: number | string;
  borderColor?: string;
  disabled?: boolean;
}

type ElasticScrollControlStyle = CSSProperties & {
  "--elastic-scroll-control-spring": string;
  "--elastic-scroll-control-bottom-clearance": string;
  "--elastic-scroll-control-border": string;
};

export interface ElasticScrollControlHandle {
  stop: () => void;
  scrollToStart: () => void;
}

/**
 * A distance-sensitive scroll control for an existing scrollport. Render it
 * inside the scrollport and pass the same ref used by the scrolling element.
 */
export const ElasticScrollControl = forwardRef<
  ElasticScrollControlHandle,
  ElasticScrollControlProps
>(function ElasticScrollControl(
  {
    scrollportRef,
    ariaControls,
    scrollAreaLabel = "content",
    contentRevision = "default",
    className,
    buttonClassName,
    bottomClearance = 268,
    borderColor = "var(--border-strong)",
    disabled = false,
  },
  ref,
) {
  const preferences = useElasticScrollPreferences();
  const control = useElasticScrollControl({
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
      className={cn(
        "elastic-scroll-control pointer-events-none sticky top-[calc(100%-var(--elastic-scroll-control-bottom-clearance))] z-30 flex h-0 flex-none justify-center",
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
          "--elastic-scroll-control-spring": spring,
          "--elastic-scroll-control-bottom-clearance":
            normalizedBottomClearance,
          "--elastic-scroll-control-border": borderColor,
          transition: control.visible
            ? "visibility 0s linear 0s, opacity 280ms ease, transform 280ms cubic-bezier(0.16, 1, 0.3, 1)"
            : "visibility 0s linear 280ms, opacity 280ms ease, transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
        } as ElasticScrollControlStyle
      }
      aria-hidden={!control.visible}
    >
      <span
        className={cn(
          "elastic-scroll-control__progress-puck pointer-events-none absolute -top-1 left-1/2 z-2 size-12 rounded-full transition-[translate] duration-160 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          hasDepth
            ? "border border-[color-mix(in_srgb,var(--elastic-scroll-control-border)_82%,var(--text)_18%)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong,var(--surface))_88%,white)_0%,color-mix(in_srgb,var(--surface)_76%,var(--canvas))_44%,var(--canvas)_100%)] shadow-[inset_0_3px_6px_color-mix(in_srgb,black_58%,transparent),inset_0_-1px_0_color-mix(in_srgb,white_9%,transparent),0_1px_0_color-mix(in_srgb,white_8%,transparent),0_5px_12px_color-mix(in_srgb,var(--canvas)_28%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_94%,var(--canvas))] shadow-[inset_0_1px_0_color-mix(in_srgb,white_8%,transparent),0_7px_18px_color-mix(in_srgb,var(--canvas)_34%,transparent)]",
        )}
        style={{
          transform: `translate(-50%, ${-control.dragOffset}px)`,
          translate: `0 ${puckFeedbackOffset}px`,
          transition:
            control.mode === "drag"
              ? "translate 160ms cubic-bezier(0.16, 1, 0.3, 1)"
              : "transform 520ms var(--elastic-scroll-control-spring), translate 160ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        aria-hidden="true"
      >
        {hasDepth && (
          <span className="absolute inset-1 rounded-full border border-[color-mix(in_srgb,var(--text)_7%,transparent)] bg-[radial-gradient(circle_at_50%_58%,color-mix(in_srgb,var(--surface)_22%,var(--canvas))_0%,var(--canvas)_72%,color-mix(in_srgb,var(--surface)_14%,var(--canvas))_100%)] shadow-[inset_0_5px_9px_color-mix(in_srgb,black_54%,transparent),inset_0_-1px_1px_color-mix(in_srgb,white_7%,transparent)]" />
        )}
        <svg
          className="absolute inset-0 z-2 size-full -rotate-90 overflow-visible"
          viewBox="0 0 40 40"
        >
          <circle
            cx="20"
            cy="20"
            r={ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS}
            fill="none"
            stroke="color-mix(in srgb, var(--elastic-scroll-control-border) 76%, var(--surface))"
            strokeWidth="2.5"
          />
          <circle
            ref={control.progressRingRef}
            className="elastic-scroll-control__progress-ring"
            cx="20"
            cy="20"
            r={ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE}
            strokeDashoffset={ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE}
          />
        </svg>
        {control.lockFeedback ? (
          <span
            className="elastic-scroll-control__lock-icon pointer-events-none absolute inset-0 z-10 inline-flex items-center justify-center text-[color-mix(in_srgb,var(--accent)_78%,white)] drop-shadow-[0_2px_2px_color-mix(in_srgb,var(--canvas)_88%,transparent)]"
            data-lock-feedback={control.lockFeedback}
          >
            <Lock size={20} weight="fill" />
          </span>
        ) : (
          <span
            className={cn(
              "elastic-scroll-control__status-dot absolute top-1/2 left-1/2 z-3 -translate-x-1/2 -translate-y-1/2 rounded-full",
              hasDepth
                ? "size-2 border border-[color-mix(in_srgb,var(--canvas)_76%,var(--accent))] bg-[color-mix(in_srgb,var(--accent)_76%,var(--text))] shadow-[0_0_0_2px_color-mix(in_srgb,var(--canvas)_88%,transparent),0_0_8px_color-mix(in_srgb,var(--accent-shadow)_76%,transparent),inset_0_1px_1px_color-mix(in_srgb,white_28%,transparent)]"
                : "size-1.5 bg-[color-mix(in_srgb,var(--accent)_68%,var(--text))]",
            )}
          />
        )}
      </span>
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
        className="elastic-scroll-control__connector pointer-events-none absolute -top-43 left-1/2 z-1 h-96 w-1 origin-center rounded-full bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--accent)_88%,var(--surface)),color-mix(in_srgb,var(--accent)_44%,transparent)_50%,color-mix(in_srgb,var(--accent)_88%,var(--surface)))] shadow-[0_4px_12px_color-mix(in_srgb,var(--accent-shadow)_26%,transparent)] motion-reduce:transition-none"
        data-visible
        style={{
          opacity: control.dragIntensity,
          transform: `translateX(-50%) scaleY(${control.dragIntensity})`,
          transition:
            control.mode === "drag"
              ? "none"
              : "opacity 180ms ease, transform 520ms var(--elastic-scroll-control-spring)",
        }}
        aria-hidden="true"
      />
      <button
        type="button"
        data-fixed-radius
        className={cn(
          "elastic-scroll-control__button pointer-events-auto relative z-10 isolate inline-flex size-10 flex-none touch-none cursor-pointer items-center justify-center rounded-full p-0 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) motion-reduce:transition-none",
          hasDepth
            ? "border border-[color-mix(in_srgb,var(--elastic-scroll-control-border)_72%,var(--text)_28%)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong,var(--surface))_88%,white)_0%,color-mix(in_srgb,var(--surface-strong,var(--surface))_84%,var(--accent))_48%,color-mix(in_srgb,var(--surface-strong,var(--surface))_80%,var(--canvas))_100%)] text-[color-mix(in_srgb,var(--text)_76%,var(--muted)_24%)] shadow-[inset_0_1px_0_color-mix(in_srgb,white_28%,transparent),inset_0_-2px_3px_color-mix(in_srgb,var(--canvas)_52%,transparent),0_2px_0_color-mix(in_srgb,var(--canvas)_72%,var(--accent)),0_8px_18px_color-mix(in_srgb,black_42%,transparent),0_14px_28px_color-mix(in_srgb,var(--accent-shadow)_20%,transparent)] hover:bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong,var(--surface))_82%,white)_0%,color-mix(in_srgb,var(--surface-strong,var(--surface))_66%,var(--accent))_52%,color-mix(in_srgb,var(--surface-strong,var(--surface))_72%,var(--canvas))_100%)] hover:text-(--accent-contrast,#fff) hover:shadow-[inset_0_1px_0_color-mix(in_srgb,white_34%,transparent),inset_0_-2px_3px_color-mix(in_srgb,var(--canvas)_46%,transparent),0_3px_0_color-mix(in_srgb,var(--canvas)_68%,var(--accent)),0_12px_24px_color-mix(in_srgb,black_52%,transparent),0_18px_34px_color-mix(in_srgb,var(--accent-shadow)_30%,transparent)]"
            : "border border-[color-mix(in_srgb,var(--elastic-scroll-control-border)_88%,var(--accent)_12%)] bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_94%,var(--accent)_6%)] text-[color-mix(in_srgb,var(--text)_68%,var(--muted)_32%)] shadow-[inset_0_1px_0_color-mix(in_srgb,white_8%,transparent),0_6px_18px_color-mix(in_srgb,var(--canvas)_38%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_76%,var(--accent)_24%)] hover:text-(--accent-contrast,#fff) hover:shadow-[inset_0_1px_0_color-mix(in_srgb,white_16%,transparent),0_10px_28px_color-mix(in_srgb,var(--canvas)_56%,transparent)]",
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
              : "color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 520ms var(--elastic-scroll-control-spring), translate 160ms cubic-bezier(0.16, 1, 0.3, 1)",
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
        {hasDepth && (
          <span
            className="pointer-events-none absolute inset-1 rounded-full border border-[color-mix(in_srgb,white_9%,transparent)] bg-[radial-gradient(circle_at_36%_24%,color-mix(in_srgb,white_20%,transparent)_0%,transparent_52%)] shadow-[inset_0_1px_0_color-mix(in_srgb,white_18%,transparent),inset_0_-2px_3px_color-mix(in_srgb,var(--canvas)_34%,transparent)]"
            aria-hidden="true"
          />
        )}
        <ElasticScrollGlyph
          icon={preferences.icon}
          className={cn(
            "elastic-scroll-control__icon relative z-10 motion-reduce:transition-none",
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
