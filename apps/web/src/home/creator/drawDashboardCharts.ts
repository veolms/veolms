import type { DashboardRevenueOverview } from "@veolms/contracts";
import {
  type ActivityBuckets,
  REVENUE_GRID_RATIOS,
  ACTIVITY_GRID_RATIOS,
  getRevenuePlotBounds,
  getActivityPlotBounds,
  getActivityBarPosition,
  formatRevenueTooltipDate,
  getLocalCalendarDateKey,
  type ActivityDayGroup,
  getActivityDayLabelX,
  selectActivityDayLabels,
} from "./dashboardChartGeometry";

function drawHorizontalChartGrid({
  context,
  left,
  right,
  top,
  bottom,
  ratios,
  gridColor,
  gridOpacity,
  baselineOpacity,
  devicePixelRatio,
}: {
  context: CanvasRenderingContext2D;
  left: number;
  right: number;
  top: number;
  bottom: number;
  ratios: readonly number[];
  gridColor: string;
  gridOpacity: number;
  baselineOpacity: number;
  devicePixelRatio: number;
}) {
  const ratio = Math.max(1, devicePixelRatio);
  context.save();
  context.strokeStyle = gridColor;
  context.lineWidth = 1 / ratio;
  context.lineCap = "butt";
  ratios.forEach((level) => {
    const y = bottom - level * (bottom - top);
    const alignedY = (Math.round(y * ratio) + 0.5) / ratio;
    context.globalAlpha = level === 0 ? baselineOpacity : gridOpacity;
    context.beginPath();
    context.moveTo(left, alignedY);
    context.lineTo(right, alignedY);
    context.stroke();
  });
  context.restore();
}

export function drawRevenueChart({
  context,
  width,
  height,
  revenueTrend,
  revenueCurrency,
  revenueStatus,
  activeIndex,
  progress = 1,
  accent,
  muted,
  danger,
  gridColor,
  gridOpacity,
  baselineGridOpacity,
  surface,
  devicePixelRatio,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  revenueTrend: DashboardRevenueOverview["trend"];
  revenueCurrency: string;
  revenueStatus?: "loading" | "empty" | "error";
  activeIndex: number | null;
  progress?: number;
  accent: string;
  muted: string;
  danger: string;
  gridColor: string;
  gridOpacity: number;
  baselineGridOpacity: number;
  surface: string;
  devicePixelRatio: number;
}) {
  context.clearRect(0, 0, width, height);
  context.font = "10px Manrope, sans-serif";

  const { left, right, top, bottom } = getRevenuePlotBounds(width, height);

  if (revenueStatus === "loading") {
    const skeletonValues = [0.72, 0.58, 0.66, 0.42, 0.52, 0.3, 0.44];
    const skeletonX = (index: number) =>
      skeletonValues.length === 1
        ? (left + right) / 2
        : left + (index / (skeletonValues.length - 1)) * (right - left);
    const skeletonY = (value: number) => bottom - value * (bottom - top);

    drawHorizontalChartGrid({
      context,
      left,
      right,
      top,
      bottom,
      ratios: REVENUE_GRID_RATIOS,
      gridColor,
      gridOpacity,
      baselineOpacity: baselineGridOpacity,
      devicePixelRatio,
    });
    context.save();
    context.globalAlpha = 0.28;
    context.strokeStyle = muted;
    context.lineWidth = 2;
    context.setLineDash([4, 5]);
    context.beginPath();
    skeletonValues.forEach((value, index) =>
      index
        ? context.lineTo(skeletonX(index), skeletonY(value))
        : context.moveTo(skeletonX(index), skeletonY(value)),
    );
    context.stroke();
    context.restore();
    context.globalAlpha = 0.72;
    context.fillStyle = muted;
    context.textAlign = "center";
    context.fillText("Loading revenue data…", width / 2, height / 2 + 22);
    context.globalAlpha = 1;
    context.setLineDash([]);
    return;
  }

  if (revenueTrend.length === 0) {
    context.fillStyle = revenueStatus === "error" ? danger : muted;
    context.textAlign = "center";
    context.fillText(
      revenueStatus === "error"
        ? "Unable to load revenue data."
        : "No revenue data for this period.",
      width / 2,
      height / 2 - 3,
    );
    context.globalAlpha = 0.72;
    context.fillStyle = muted;
    context.font = "9px Manrope, sans-serif";
    context.fillText(
      revenueStatus === "error"
        ? "Revenue could not be displayed right now."
        : "Try another range to explore activity.",
      width / 2,
      height / 2 + 14,
    );
    context.globalAlpha = 1;
    return;
  }

  const values = revenueTrend.map((point) => point.value);
  const maxValue = Math.max(...values, 0);
  const scaleMax = maxValue > 0 ? Math.ceil(maxValue / 4) * 4 : 1;
  const x = (index: number) =>
    values.length === 1
      ? (left + right) / 2
      : left + (index / (values.length - 1)) * (right - left);
  const y = (value: number) => bottom - (value / scaleMax) * (bottom - top);
  const animatedY = (value: number) => bottom - (bottom - y(value)) * progress;

  drawHorizontalChartGrid({
    context,
    left,
    right,
    top,
    bottom,
    ratios: REVENUE_GRID_RATIOS,
    gridColor,
    gridOpacity,
    baselineOpacity: baselineGridOpacity,
    devicePixelRatio,
  });
  context.beginPath();
  values.forEach((value, index) =>
    index
      ? context.lineTo(x(index), animatedY(value))
      : context.moveTo(x(index), animatedY(value)),
  );
  context.lineTo(right, bottom);
  context.lineTo(left, bottom);
  context.closePath();
  context.fillStyle = accent;
  context.globalAlpha = 0.18;
  context.fill();
  context.globalAlpha = 1;
  context.beginPath();
  values.forEach((value, index) =>
    index
      ? context.lineTo(x(index), animatedY(value))
      : context.moveTo(x(index), animatedY(value)),
  );
  context.strokeStyle = accent;
  context.lineWidth = 2.25;
  context.stroke();

  if (
    activeIndex !== null &&
    activeIndex < values.length &&
    progress >= 0.999
  ) {
    context.save();
    context.strokeStyle = accent;
    context.globalAlpha = 0.26;
    context.lineWidth = 1;
    context.setLineDash([3, 4]);
    context.beginPath();
    context.moveTo(x(activeIndex), top);
    context.lineTo(x(activeIndex), bottom);
    context.stroke();
    context.restore();
  }

  if (revenueTrend.length <= 31) {
    values.forEach((value, index) => {
      context.beginPath();
      context.arc(x(index), animatedY(value), 2.5, 0, Math.PI * 2);
      context.fillStyle = accent;
      context.fill();
    });
  }
  context.fillStyle = muted;
  context.globalAlpha = 0.78;
  context.textAlign = "right";
  [1, 0.8, 0.6, 0.4, 0.2, 0].forEach((ratio) => {
    const mark = scaleMax * ratio;
    context.fillText(
      new Intl.NumberFormat(revenueCurrency === "INR" ? "en-IN" : "en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(mark),
      left - 6,
      y(mark) + 3,
    );
  });
  context.globalAlpha = 1;
  const isNarrowRevenueChart = width <= 640;
  const labelCount = Math.min(
    isNarrowRevenueChart
      ? Math.min(6, Math.max(3, Math.floor((right - left) / 56)))
      : revenueTrend.length > 180
        ? 6
        : 7,
    revenueTrend.length,
  );
  const dateLabels = Array.from({ length: labelCount }, (_, labelIndex) => {
    const index =
      labelCount === 1
        ? 0
        : Math.round(
            (labelIndex * (revenueTrend.length - 1)) / (labelCount - 1),
          );
    return [
      index,
      formatRevenueTooltipDate(revenueTrend[index]!.date),
    ] as const;
  });
  context.globalAlpha = 0.84;
  dateLabels.forEach(([index, dateLabel], labelIndex) => {
    context.textAlign =
      labelIndex === 0
        ? "left"
        : labelIndex === dateLabels.length - 1
          ? "right"
          : "center";
    context.fillText(dateLabel, x(index), height - 5);
  });
  context.globalAlpha = 1;
  context.save();
  context.shadowColor = accent;
  context.shadowBlur = 9;
  context.beginPath();
  context.arc(
    x(values.length - 1),
    animatedY(values.at(-1)!),
    3.4,
    0,
    Math.PI * 2,
  );
  context.fillStyle = accent;
  context.fill();
  context.restore();

  if (
    activeIndex !== null &&
    activeIndex < values.length &&
    progress >= 0.999
  ) {
    context.save();
    context.shadowColor = accent;
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(
      x(activeIndex),
      animatedY(values[activeIndex]!),
      4.5,
      0,
      Math.PI * 2,
    );
    context.fillStyle = accent;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = 2;
    context.strokeStyle = surface;
    context.stroke();
    context.restore();
  }
  context.globalAlpha = 1;
  context.setLineDash([]);
}

export function drawActivityChart({
  context,
  width,
  height,
  activityBuckets,
  activityStatus,
  activeIndex,
  progress,
  accent,
  muted,
  gridColor,
  gridOpacity,
  baselineGridOpacity,
  devicePixelRatio,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  activityBuckets: ActivityBuckets;
  activityStatus?: "loading" | "empty" | "error";
  activeIndex: number | null;
  progress: number;
  accent: string;
  muted: string;
  gridColor: string;
  gridOpacity: number;
  baselineGridOpacity: number;
  devicePixelRatio: number;
}) {
  context.clearRect(0, 0, width, height);
  context.font = "11px Manrope, sans-serif";

  if (activityBuckets.length === 0) {
    context.fillStyle = muted;
    context.textAlign = "center";
    context.fillText(
      activityStatus === "loading"
        ? "Loading enrollment activity…"
        : activityStatus === "error"
          ? "Unable to load enrollment activity."
          : "No enrollment activity for this period.",
      width / 2,
      height / 2,
    );
    return;
  }

  const { left, right, top, bottom } = getActivityPlotBounds(width, height);
  const values = activityBuckets.map((bucket) => bucket.value);
  const maxValue = Math.max(...values, 0);
  const max = maxValue > 0 ? Math.ceil(maxValue / 4) * 4 : 1;

  drawHorizontalChartGrid({
    context,
    left,
    right,
    top,
    bottom,
    ratios: ACTIVITY_GRID_RATIOS,
    gridColor,
    gridOpacity,
    baselineOpacity: baselineGridOpacity,
    devicePixelRatio,
  });

  values.forEach((value, index) => {
    const bar = getActivityBarPosition(
      index,
      value,
      values.length,
      max,
      width,
      height,
    );
    const animatedHeight = bar.finalHeight * progress;
    const isActive = activeIndex === index && progress >= 0.999;

    context.save();
    context.fillStyle = accent;
    context.globalAlpha = isActive ? 1 : 0.86;
    if (isActive) {
      context.shadowColor = accent;
      context.shadowBlur = 6;
    }
    context.beginPath();
    context.roundRect(
      bar.x,
      bar.baseline - animatedHeight,
      bar.width,
      animatedHeight,
      3,
    );
    context.fill();
    context.restore();
  });

  context.fillStyle = muted;
  context.textAlign = "right";
  [1, 0.75, 0.5, 0.25, 0].forEach((ratio) => {
    const mark = max * ratio;
    context.fillText(
      String(Math.round(mark)),
      left - 5,
      bottom - (mark / max) * (bottom - top) + 3,
    );
  });

  const dayGroups: ActivityDayGroup[] = [];
  const dayFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  activityBuckets.forEach((bucket, index) => {
    const value = new Date(bucket.start);
    const dateKey = getLocalCalendarDateKey(value);
    const lastGroup = dayGroups.at(-1);
    if (lastGroup?.dateKey === dateKey) {
      lastGroup.lastIndex = index;
      return;
    }
    dayGroups.push({
      dateKey,
      firstIndex: index,
      lastIndex: index,
      label: dayFormatter.format(value),
    });
  });

  const gap = (right - left) / values.length;
  const dateLabels = selectActivityDayLabels(
    context,
    dayGroups,
    left,
    right,
    gap,
  );

  context.globalAlpha = 0.84;
  dateLabels.forEach((group) => {
    context.textAlign = "center";
    context.fillText(
      group.label,
      getActivityDayLabelX(group, left, right),
      height - 5,
    );
  });
  context.globalAlpha = 1;
}
