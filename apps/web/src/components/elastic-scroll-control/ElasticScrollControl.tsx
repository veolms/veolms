import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { forwardRef, useImperativeHandle } from "react";
import type { CSSProperties, RefObject } from "react";
import { cn } from "../../lib/utils";
import {
  ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE,
  ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS,
} from "./elasticScrollControlModel";
import { useElasticScrollControl } from "./useElasticScrollControl";

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
  const control = useElasticScrollControl({
    scrollportRef,
    contentRevision,
    disabled,
  });
  const label = scrollAreaLabel.trim() || "content";
  const actionLabel = label.toLowerCase();
  const normalizedBottomClearance =
    typeof bottomClearance === "number"
      ? `${bottomClearance}px`
      : bottomClearance;
  const spring = "linear(0, 0.62 28%, 0.9 44%, 1.04 58%, 0.985 72%, 1 88%)";

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
      data-dragging={control.mode === "drag" ? "" : undefined}
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
        className="elastic-scroll-control__progress-puck pointer-events-none absolute -top-1 left-1/2 z-2 size-12 rounded-full bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_94%,var(--canvas))] shadow-[inset_0_1px_0_color-mix(in_srgb,white_8%,transparent),0_7px_18px_color-mix(in_srgb,var(--canvas)_34%,transparent)] motion-reduce:transition-none"
        style={{
          transform: `translate(-50%, ${-control.dragOffset}px)`,
          transition:
            control.mode === "drag"
              ? "none"
              : "transform 520ms var(--elastic-scroll-control-spring)",
        }}
        aria-hidden="true"
      >
        <svg
          className="absolute inset-0 size-full -rotate-90 overflow-visible"
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
        <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--accent)_68%,var(--text))]" />
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
        className="pointer-events-none absolute -top-43 left-1/2 z-1 h-96 w-1 origin-center rounded-full bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--accent)_88%,var(--surface)),color-mix(in_srgb,var(--accent)_44%,transparent)_50%,color-mix(in_srgb,var(--accent)_88%,var(--surface)))] shadow-[0_4px_12px_color-mix(in_srgb,var(--accent-shadow)_26%,transparent)] motion-reduce:transition-none"
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
          "elastic-scroll-control__button pointer-events-auto relative z-10 inline-flex size-10 flex-none touch-none cursor-pointer items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--elastic-scroll-control-border)_88%,var(--accent)_12%)] bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_94%,var(--accent)_6%)] p-0 text-[color-mix(in_srgb,var(--text)_68%,var(--muted)_32%)] shadow-[inset_0_1px_0_color-mix(in_srgb,white_8%,transparent),0_6px_18px_color-mix(in_srgb,var(--canvas)_38%,transparent)] select-none hover:bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_76%,var(--accent)_24%)] hover:text-(--accent-contrast,#fff) hover:shadow-[inset_0_1px_0_color-mix(in_srgb,white_16%,transparent),0_10px_28px_color-mix(in_srgb,var(--canvas)_56%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) motion-reduce:transition-none",
          control.mode !== "idle" &&
            "bg-[color-mix(in_srgb,var(--surface-strong,var(--surface))_68%,var(--accent)_32%)] text-(--accent-contrast,#fff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_18%,transparent),0_8px_24px_color-mix(in_srgb,var(--accent-shadow)_28%,transparent)]",
          buttonClassName,
        )}
        data-direction={control.direction}
        data-scroll-mode={control.mode}
        data-drag-distance={Math.round(Math.abs(control.dragOffset))}
        style={{
          transform: `translateY(${control.dragOffset}px)`,
          transition:
            control.mode === "drag"
              ? "color 160ms ease, background-color 160ms ease, box-shadow 160ms ease"
              : "color 160ms ease, background-color 160ms ease, box-shadow 160ms ease, transform 520ms var(--elastic-scroll-control-spring)",
        }}
        aria-controls={ariaControls}
        aria-label={
          control.mode === "drag"
            ? `Scrolling ${actionLabel} ${control.direction} — release to stop`
            : control.mode === "edge"
              ? `Stop ${actionLabel} scrolling`
              : control.direction === "down"
                ? `Scroll ${actionLabel} to bottom`
                : `Scroll ${actionLabel} to top`
        }
        title={
          control.mode === "drag"
            ? `Release to stop — ${Math.round(control.dragIntensity * 100)}% speed`
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
        <ArrowUp
          className={cn(
            "elastic-scroll-control__icon transition-transform duration-180 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            control.direction === "down" && "rotate-180",
          )}
          size={20}
          weight="bold"
          aria-hidden="true"
        />
      </button>
    </div>
  );
});
