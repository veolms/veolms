import type {
  DashboardRevenueOverview,
  DashboardLearningActivity,
} from "@veolms/contracts";

export interface RevenuePlotBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RevenuePointPosition {
  x: number;
  y: number;
}

export interface ActiveRevenuePoint extends RevenuePointPosition {
  index: number;
  width: number;
  height: number;
  trend: DashboardRevenueOverview["trend"];
}

export type ActivityBuckets =
  DashboardLearningActivity["enrollmentActivity"]["buckets"];

export interface ActiveActivityPoint extends RevenuePointPosition {
  index: number;
  width: number;
  height: number;
  buckets: ActivityBuckets;
}

export const REVENUE_GRID_RATIOS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
export const ACTIVITY_GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;

export function getRevenuePlotBounds(
  width: number,
  height: number,
): RevenuePlotBounds {
  const isNarrowRevenueChart = width <= 640;
  const left = isNarrowRevenueChart
    ? width < 360
      ? 30
      : 34
    : width < 360
      ? 34
      : 42;
  const right =
    width -
    (isNarrowRevenueChart ? (width < 360 ? 12 : 14) : width < 360 ? 14 : 16);

  return { left, right, top: 22, bottom: height - 33 };
}

export function getActivityPlotBounds(
  width: number,
  height: number,
): RevenuePlotBounds {
  return {
    left: width < 360 ? 26 : 30,
    right: width - 10,
    top: 14,
    bottom: height - 25,
  };
}

export function getActivityBarPosition(
  index: number,
  value: number,
  count: number,
  max: number,
  width: number,
  height: number,
) {
  const { left, right, bottom, top } = getActivityPlotBounds(width, height);
  const gap = (right - left) / count;
  const barWidth = Math.max(3, gap * 0.46);
  const x = left + index * gap + gap * 0.22;
  const finalHeight = (value / max) * (bottom - top);

  return {
    x,
    centerX: left + (index + 0.5) * gap,
    finalHeight,
    y: bottom - finalHeight,
    width: barWidth,
    baseline: bottom,
  };
}

export function getRevenuePointPosition(
  index: number,
  values: readonly number[],
  width: number,
  height: number,
): RevenuePointPosition {
  const { left, right, top, bottom } = getRevenuePlotBounds(width, height);
  const maxValue = Math.max(...values, 0);
  const scaleMax = maxValue > 0 ? Math.ceil(maxValue / 4) * 4 : 1;
  const x =
    values.length === 1
      ? (left + right) / 2
      : left + (index / (values.length - 1)) * (right - left);
  const y = bottom - ((values[index] ?? 0) / scaleMax) * (bottom - top);

  return { x, y };
}

export function formatRevenueTooltipDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function getRevenueTooltipPosition(
  point: ActiveRevenuePoint,
): RevenuePointPosition {
  const tooltipWidth = Math.min(150, Math.max(112, point.width * 0.42));
  const tooltipHeight = 46;
  const gap = 8;
  const left =
    point.x > point.width - tooltipWidth - 24
      ? point.x - tooltipWidth - gap
      : point.x + gap;
  const top = point.y - tooltipHeight - gap;

  return {
    x: Math.max(8, Math.min(left, point.width - tooltipWidth - 8)),
    y: Math.max(
      8,
      Math.min(
        top >= 8 ? top : point.y + gap,
        point.height - tooltipHeight - 8,
      ),
    ),
  };
}

export function getActivityTooltipPosition(
  point: ActiveActivityPoint,
): RevenuePointPosition {
  const tooltipWidth = Math.min(164, Math.max(136, point.width * 0.48));
  const tooltipHeight = 62;
  const gap = 8;
  const left =
    point.x > point.width - tooltipWidth - 24
      ? point.x - tooltipWidth - gap
      : point.x + gap;
  const top = point.y - tooltipHeight - gap;

  return {
    x: Math.max(8, Math.min(left, point.width - tooltipWidth - 8)),
    y: Math.max(
      8,
      Math.min(
        top >= 8 ? top : point.y + gap,
        point.height - tooltipHeight - 8,
      ),
    ),
  };
}

export function formatActivityTooltipDate(date: string) {
  const value = new Date(date);
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  const timeText = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  const startDate = dateFormatter.format(value);
  const endDate = dateFormatter.format(end);

  return {
    date: startDate === endDate ? startDate : `${startDate}–${endDate}`,
    range: `${timeText.format(value)}–${timeText.format(end)}`,
  };
}

export function getLocalCalendarDateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

export interface ActivityDayGroup {
  dateKey: string;
  firstIndex: number;
  lastIndex: number;
  label: string;
}

interface ActivityDayLabel extends ActivityDayGroup {
  centerX: number;
  width: number;
}

export function getActivityDayLabelX(
  label: ActivityDayLabel,
  left: number,
  right: number,
) {
  const minimum = left + label.width / 2;
  const maximum = right - label.width / 2;
  return Math.max(minimum, Math.min(label.centerX, maximum));
}

function activityDayLabelsFit(
  labels: readonly ActivityDayLabel[],
  left: number,
  right: number,
) {
  return labels.every((label, index) => {
    const x = getActivityDayLabelX(label, left, right);
    if (index === 0) return true;

    const previous = labels[index - 1]!;
    const previousX = getActivityDayLabelX(previous, left, right);
    return x - previousX >= (previous.width + label.width) / 2 + 6;
  });
}

export function selectActivityDayLabels(
  context: CanvasRenderingContext2D,
  dayGroups: readonly ActivityDayGroup[],
  left: number,
  right: number,
  gap: number,
) {
  const labels = dayGroups.map((group) => ({
    ...group,
    centerX: left + ((group.firstIndex + group.lastIndex + 1) / 2) * gap,
    width: context.measureText(group.label).width,
  }));

  if (labels.length <= 2 || activityDayLabelsFit(labels, left, right)) {
    return labels;
  }

  for (let labelCount = labels.length - 1; labelCount >= 2; labelCount -= 1) {
    const candidate = Array.from(
      { length: labelCount },
      (_, labelIndex) =>
        labels[
          Math.round((labelIndex * (labels.length - 1)) / (labelCount - 1))
        ]!,
    );
    if (activityDayLabelsFit(candidate, left, right)) {
      return candidate;
    }
  }

  return [labels[0]!, labels.at(-1)!];
}
