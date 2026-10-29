import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type {
  DashboardRevenueOverview,
  DashboardLearningActivity,
} from "@veolms/contracts";
import { formatDashboardChartCurrency } from "./dashboardFormat";
import {
  type RevenuePlotBounds,
  type RevenuePointPosition,
  type ActiveRevenuePoint,
  type ActivityBuckets,
  type ActiveActivityPoint,
  getRevenuePlotBounds,
  getActivityPlotBounds,
  getActivityBarPosition,
  getRevenuePointPosition,
  formatRevenueTooltipDate,
  getRevenueTooltipPosition,
  getActivityTooltipPosition,
  formatActivityTooltipDate,
} from "./dashboardChartGeometry";
import { drawRevenueChart, drawActivityChart } from "./drawDashboardCharts";

interface DataCanvasProps {
  kind: "revenue" | "activity";
  label: string;
  themeKey?: string;
  revenueTrend?: DashboardRevenueOverview["trend"];
  revenueCurrency?: string;
  revenueStatus?: "loading" | "empty" | "error";
  activityBuckets?: DashboardLearningActivity["enrollmentActivity"]["buckets"];
  activityStatus?: "loading" | "empty" | "error";
}

const EMPTY_REVENUE_TREND: DashboardRevenueOverview["trend"] = [];
const EMPTY_ACTIVITY_BUCKETS: DashboardLearningActivity["enrollmentActivity"]["buckets"] =
  [];

export function DataCanvas({
  kind,
  label,
  themeKey = "default",
  revenueTrend = EMPTY_REVENUE_TREND,
  revenueCurrency = "INR",
  revenueStatus,
  activityBuckets = EMPTY_ACTIVITY_BUCKETS,
  activityStatus,
}: DataCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousRevenueTrendRef = useRef<
    DashboardRevenueOverview["trend"] | null
  >(null);
  const previousActivityBucketsRef = useRef<ActivityBuckets | null>(null);
  const activeRevenueIndexRef = useRef<number | null>(null);
  const activeActivityIndexRef = useRef<number | null>(null);
  const renderRevenueRef = useRef<(() => void) | null>(null);
  const renderActivityRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const activityAnimationFrameRef = useRef<number | null>(null);
  const animationRunningRef = useRef(false);
  const activityAnimationRunningRef = useRef(false);
  const [activeRevenuePoint, setActiveRevenuePoint] =
    useState<ActiveRevenuePoint | null>(null);
  const [activeActivityPoint, setActiveActivityPoint] =
    useState<ActiveActivityPoint | null>(null);
  const [isRangeTransitioning, setIsRangeTransitioning] = useState(false);

  activeRevenueIndexRef.current =
    activeRevenuePoint?.trend === revenueTrend
      ? activeRevenuePoint.index
      : null;
  activeActivityIndexRef.current =
    activeActivityPoint?.buckets === activityBuckets
      ? activeActivityPoint.index
      : null;

  const handleRevenuePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (kind !== "revenue" || revenueTrend.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const plot = getRevenuePlotBounds(bounds.width, bounds.height);
    const values = revenueTrend.map((point) => point.value);
    const pointerX = Math.max(
      plot.left,
      Math.min(plot.right, event.clientX - bounds.left),
    );
    const index =
      values.length === 1
        ? 0
        : Math.max(
            0,
            Math.min(
              values.length - 1,
              Math.round(
                ((pointerX - plot.left) / (plot.right - plot.left)) *
                  (values.length - 1),
              ),
            ),
          );
    const point = getRevenuePointPosition(
      index,
      values,
      bounds.width,
      bounds.height,
    );

    setActiveRevenuePoint((current) =>
      current?.index === index && current.trend === revenueTrend
        ? current
        : {
            index,
            x: point.x,
            y: point.y,
            width: bounds.width,
            height: bounds.height,
            trend: revenueTrend,
          },
    );
  };

  const handleRevenuePointerLeave = () => {
    setActiveRevenuePoint(null);
  };

  const handleActivityPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (
      kind !== "activity" ||
      activityBuckets.length === 0 ||
      activityAnimationRunningRef.current
    ) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const { left, right } = getActivityPlotBounds(bounds.width, bounds.height);
    const pointerX = Math.max(
      left,
      Math.min(right, event.clientX - bounds.left),
    );
    const gap = (right - left) / activityBuckets.length;
    const index = Math.max(
      0,
      Math.min(activityBuckets.length - 1, Math.floor((pointerX - left) / gap)),
    );
    const values = activityBuckets.map((bucket) => bucket.value);
    const maxValue = Math.max(...values, 0);
    const max = maxValue > 0 ? Math.ceil(maxValue / 4) * 4 : 1;
    const bar = getActivityBarPosition(
      index,
      activityBuckets[index]!.value,
      activityBuckets.length,
      max,
      bounds.width,
      bounds.height,
    );

    setActiveActivityPoint((current) =>
      current?.index === index && current.buckets === activityBuckets
        ? current
        : {
            index,
            x: bar.centerX,
            y: bar.y,
            width: bounds.width,
            height: bounds.height,
            buckets: activityBuckets,
          },
    );
  };

  const handleActivityPointerLeave = () => {
    setActiveActivityPoint(null);
  };

  useEffect(() => {
    if (kind === "revenue" && !animationRunningRef.current) {
      renderRevenueRef.current?.();
    }
  }, [activeRevenuePoint?.index, activeRevenuePoint?.trend, kind]);

  useEffect(() => {
    if (kind === "activity" && !activityAnimationRunningRef.current) {
      renderActivityRef.current?.();
    }
  }, [activeActivityPoint?.index, activeActivityPoint?.buckets, kind]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resizeCanvas = (target: HTMLCanvasElement, ratio: number) => {
      const context = target.getContext("2d")!;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      return context;
    };

    let resizeTimer: number | null = null;
    let hasRendered = false;

    const renderAtCurrentSize = () => {
      if (kind === "revenue" && animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        animationRunningRef.current = false;
      }
      if (kind === "activity" && activityAnimationFrameRef.current !== null) {
        cancelAnimationFrame(activityAnimationFrameRef.current);
        activityAnimationFrameRef.current = null;
        activityAnimationRunningRef.current = false;
      }
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      const width = bounds.width;
      const height = bounds.height;
      const rootStyles = getComputedStyle(document.documentElement);
      const accent =
        rootStyles.getPropertyValue("--accent").trim() || "#8b68ff";
      const muted = rootStyles.getPropertyValue("--muted").trim() || "#919592";
      const danger =
        rootStyles.getPropertyValue("--danger").trim() || "#fb7185";
      const track = rootStyles.getPropertyValue("--track").trim() || "#202324";
      const isDarkTheme = document.documentElement.dataset.theme !== "light";
      const gridColor = isDarkTheme ? muted : track;
      const gridOpacity = isDarkTheme ? 0.24 : 0.72;
      const baselineGridOpacity = isDarkTheme ? 0.32 : 0.9;
      const surface =
        rootStyles.getPropertyValue("--card-surface").trim() ||
        rootStyles.getPropertyValue("--surface").trim() ||
        "#ffffff";

      if (kind === "revenue") {
        const context = resizeCanvas(canvas, ratio);
        const previousTrend = previousRevenueTrendRef.current;
        const drawFrame = (
          trend: DashboardRevenueOverview["trend"],
          status: "loading" | "empty" | "error" | undefined,
          progress: number,
        ) => {
          drawRevenueChart({
            context,
            width,
            height,
            revenueTrend: trend,
            revenueCurrency,
            revenueStatus: status,
            activeIndex: animationRunningRef.current
              ? null
              : activeRevenueIndexRef.current,
            progress,
            accent,
            muted,
            danger,
            gridColor,
            gridOpacity,
            baselineGridOpacity,
            surface,
            devicePixelRatio: ratio,
          });
        };

        renderRevenueRef.current = () => {
          const currentBounds = canvas.getBoundingClientRect();
          const currentRatio = window.devicePixelRatio || 1;
          canvas.width = Math.max(
            1,
            Math.floor(currentBounds.width * currentRatio),
          );
          canvas.height = Math.max(
            1,
            Math.floor(currentBounds.height * currentRatio),
          );
          const currentContext = resizeCanvas(canvas, currentRatio);
          drawRevenueChart({
            context: currentContext,
            width: currentBounds.width,
            height: currentBounds.height,
            revenueTrend,
            revenueCurrency,
            revenueStatus,
            activeIndex: activeRevenueIndexRef.current,
            progress: 1,
            accent,
            muted,
            danger,
            gridColor,
            gridOpacity,
            baselineGridOpacity,
            surface,
            devicePixelRatio: currentRatio,
          });
        };

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const hasPreviousData = Boolean(previousTrend?.length);
        const hasNextData = revenueTrend.length > 0;
        const shouldTransition =
          previousTrend !== null &&
          previousTrend !== revenueTrend &&
          (hasPreviousData || hasNextData) &&
          !reducedMotion;

        if (!shouldTransition) {
          animationRunningRef.current = false;
          setIsRangeTransitioning(false);
          drawFrame(revenueTrend, revenueStatus, 1);
          previousRevenueTrendRef.current = revenueTrend;
        } else {
          if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          animationRunningRef.current = true;
          setActiveRevenuePoint(null);
          setIsRangeTransitioning(true);
          previousRevenueTrendRef.current = revenueTrend;
          const downDuration = hasPreviousData ? 170 : 0;
          const upDuration = hasNextData ? 220 : 0;
          const start = performance.now();
          const ease = (value: number) => 1 - (1 - value) ** 3;

          const animate = (now: number) => {
            const elapsed = now - start;
            if (hasPreviousData && elapsed < downDuration) {
              drawFrame(
                previousTrend!,
                undefined,
                1 - ease(elapsed / downDuration),
              );
            } else if (!hasNextData) {
              drawFrame(revenueTrend, revenueStatus, 1);
            } else {
              const upElapsed = Math.max(0, elapsed - downDuration);
              drawFrame(
                revenueTrend,
                revenueStatus,
                Math.min(1, ease(upElapsed / upDuration)),
              );
            }

            const complete = elapsed >= downDuration + upDuration;
            if (complete) {
              animationRunningRef.current = false;
              animationFrameRef.current = null;
              setIsRangeTransitioning(false);
              renderRevenueRef.current?.();
            } else {
              animationFrameRef.current = requestAnimationFrame(animate);
            }
          };

          animationFrameRef.current = requestAnimationFrame(animate);
        }
      } else {
        setIsRangeTransitioning(false);
        const context = resizeCanvas(canvas, ratio);
        const previousBuckets = previousActivityBucketsRef.current;
        const drawFrame = (progress: number) => {
          drawActivityChart({
            context,
            width,
            height,
            activityBuckets,
            activityStatus,
            activeIndex: activityAnimationRunningRef.current
              ? null
              : activeActivityIndexRef.current,
            progress,
            accent,
            muted,
            gridColor,
            gridOpacity,
            baselineGridOpacity,
            devicePixelRatio: ratio,
          });
        };

        renderActivityRef.current = () => {
          const currentBounds = canvas.getBoundingClientRect();
          const currentRatio = window.devicePixelRatio || 1;
          canvas.width = Math.max(
            1,
            Math.floor(currentBounds.width * currentRatio),
          );
          canvas.height = Math.max(
            1,
            Math.floor(currentBounds.height * currentRatio),
          );
          const currentContext = resizeCanvas(canvas, currentRatio);
          drawActivityChart({
            context: currentContext,
            width: currentBounds.width,
            height: currentBounds.height,
            activityBuckets,
            activityStatus,
            activeIndex: activeActivityIndexRef.current,
            progress: 1,
            accent,
            muted,
            gridColor,
            gridOpacity,
            baselineGridOpacity,
            devicePixelRatio: currentRatio,
          });
        };

        const reducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const shouldAnimate =
          activityBuckets.length > 0 &&
          previousBuckets !== activityBuckets &&
          (!previousBuckets || previousBuckets.length === 0) &&
          !reducedMotion;

        if (!shouldAnimate) {
          activityAnimationRunningRef.current = false;
          drawFrame(1);
          previousActivityBucketsRef.current = activityBuckets;
        } else {
          if (activityAnimationFrameRef.current !== null) {
            cancelAnimationFrame(activityAnimationFrameRef.current);
          }
          activityAnimationRunningRef.current = true;
          setActiveActivityPoint(null);
          previousActivityBucketsRef.current = activityBuckets;
          const duration = 280;
          const start = performance.now();
          const ease = (value: number) => 1 - (1 - value) ** 3;

          const animate = (now: number) => {
            const progress = Math.min(1, ease((now - start) / duration));
            drawFrame(progress);
            if (progress >= 1) {
              activityAnimationRunningRef.current = false;
              activityAnimationFrameRef.current = null;
              renderActivityRef.current?.();
            } else {
              activityAnimationFrameRef.current =
                requestAnimationFrame(animate);
            }
          };

          activityAnimationFrameRef.current = requestAnimationFrame(animate);
        }
      }
    };

    const observer = new ResizeObserver(() => {
      if (!hasRendered) {
        hasRendered = true;
        renderAtCurrentSize();
        return;
      }

      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        renderAtCurrentSize();
      }, 90);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = null;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = null;
      animationRunningRef.current = false;
      if (activityAnimationFrameRef.current !== null) {
        cancelAnimationFrame(activityAnimationFrameRef.current);
      }
      activityAnimationFrameRef.current = null;
      activityAnimationRunningRef.current = false;
      renderRevenueRef.current = null;
      renderActivityRef.current = null;
      setIsRangeTransitioning(false);
    };
  }, [
    activityBuckets,
    activityStatus,
    kind,
    revenueCurrency,
    revenueStatus,
    revenueTrend,
    themeKey,
  ]);

  const isActiveRevenuePoint =
    kind === "revenue" &&
    !isRangeTransitioning &&
    activeRevenuePoint?.trend === revenueTrend;
  const tooltipPosition = isActiveRevenuePoint
    ? getRevenueTooltipPosition(activeRevenuePoint)
    : null;
  const tooltipData = isActiveRevenuePoint
    ? revenueTrend[activeRevenuePoint.index]
    : undefined;
  const isActiveActivityPoint =
    kind === "activity" &&
    !activityAnimationRunningRef.current &&
    activeActivityPoint?.buckets === activityBuckets;
  const activityTooltipPosition = isActiveActivityPoint
    ? getActivityTooltipPosition(activeActivityPoint)
    : null;
  const activityTooltipData = isActiveActivityPoint
    ? activityBuckets[activeActivityPoint.index]
    : undefined;
  const activityTooltipDate = activityTooltipData
    ? formatActivityTooltipDate(activityTooltipData.start)
    : null;

  return (
    <div
      className={`creator-chart-canvas-wrap ${
        kind === "revenue"
          ? "creator-chart-canvas-wrap--revenue"
          : kind === "activity"
            ? "creator-chart-canvas-wrap--activity"
            : ""
      }`}
      onPointerDown={
        kind === "revenue"
          ? handleRevenuePointerMove
          : kind === "activity"
            ? handleActivityPointerMove
            : undefined
      }
      onPointerMove={
        kind === "revenue"
          ? handleRevenuePointerMove
          : kind === "activity"
            ? handleActivityPointerMove
            : undefined
      }
      onPointerLeave={
        kind === "revenue"
          ? handleRevenuePointerLeave
          : kind === "activity"
            ? handleActivityPointerLeave
            : undefined
      }
      onPointerCancel={
        kind === "revenue"
          ? handleRevenuePointerLeave
          : kind === "activity"
            ? handleActivityPointerLeave
            : undefined
      }
    >
      <canvas
        ref={canvasRef}
        className="creator-chart-canvas"
        role="img"
        aria-label={label}
      />
      {tooltipData && tooltipPosition && (
        <div
          className="creator-chart-tooltip"
          role="tooltip"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
          }}
        >
          <span>{formatRevenueTooltipDate(tooltipData.date)}</span>
          <strong>
            {formatDashboardChartCurrency(tooltipData.value, revenueCurrency)}
          </strong>
        </div>
      )}
      {activityTooltipData &&
        activityTooltipDate &&
        activityTooltipPosition && (
          <div
            className="creator-chart-tooltip"
            role="tooltip"
            style={{
              left: `${activityTooltipPosition.x}px`,
              top: `${activityTooltipPosition.y}px`,
            }}
          >
            <span>{activityTooltipDate.date}</span>
            <span>{activityTooltipDate.range}</span>
            <strong>
              {activityTooltipData.value}{" "}
              {activityTooltipData.value === 1 ? "enrollment" : "enrollments"}
            </strong>
          </div>
        )}
    </div>
  );
}
