import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PointerEvent, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  DashboardRange,
  DashboardRevenueOverview,
  DashboardSummaryResponse,
  DashboardYourCourse,
} from "@veolms/contracts";
import { ArrowDownRightIcon as ArrowDownRight } from "@phosphor-icons/react/ArrowDownRight";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/ChartBar";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { ChatCircleDotsIcon as ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { PlusCircleIcon as PlusCircle } from "@phosphor-icons/react/PlusCircle";
import { PulseIcon as Pulse } from "@phosphor-icons/react/Pulse";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import type { Icon } from "@phosphor-icons/react";
import { createPortal } from "react-dom";
import { handleRovingTabKeyDown } from "./accessibility/rovingTabFocus";
import { analyticsKeys, useDashboard } from "./services/analytics";
import { enrollmentKeys, useRecentEnrollments } from "./services/enrollments";
import {
  learningInteractionKeys,
  useDashboardRecentDiscussions,
} from "./services/learning-interactions";
import { adaptDiscussionWorkspaceItem } from "./workspace/discussions-workspace.adapter";
import {
  DashboardDiscussionCardSkeletons,
  DashboardDiscussionRetryContent,
} from "./workspace/DashboardDiscussionPreview";
import { formatRelativeTime } from "./learning/learning-notes.adapter";
import { CourseThumbnailPlaceholder } from "./courses/CourseThumbnailPlaceholder";
import { useAuthStore } from "./store/auth.store";
import { DiscussionWorkspaceCard } from "./workspace/DiscussionsWorkspace";
import "./styles/features/creator-dashboard.css";
import "./styles/features/dashboard-discussion-preview.css";

type ActivityRow = readonly [
  label: string,
  value: string,
  icon: Icon,
  tone: string,
];
interface DashboardPanelProps {
  className?: string;
  icon: Icon;
  title: string;
  action?: string;
  onAction?: () => void;
  infoLabel?: string;
  infoTitle?: string;
  infoDescription?: ReactNode;
  children: ReactNode;
}

type InfoPopoverPlacement = "top" | "left" | "bottom";

interface DataCanvasProps {
  kind: "revenue" | "activity";
  label: string;
  themeKey?: string;
  revenueTrend?: DashboardRevenueOverview["trend"];
  revenueCurrency?: string;
  revenueStatus?: "loading" | "empty" | "error";
  activityBuckets?: DashboardSummaryResponse["learningActivity"]["enrollmentActivity"]["buckets"];
  activityStatus?: "loading" | "empty" | "error";
}

const EMPTY_REVENUE_TREND: DashboardRevenueOverview["trend"] = [];
const EMPTY_ACTIVITY_BUCKETS: DashboardSummaryResponse["learningActivity"]["enrollmentActivity"]["buckets"] =
  [];
const CREATOR_DASHBOARD_ENROLLMENT_LIMIT = 10;

function getCreatorDashboardRefreshQueryKeys(range: DashboardRange) {
  return [
    analyticsKeys.dashboard(range),
    learningInteractionKeys.dashboardRecentDiscussions(),
    enrollmentKeys.recent(CREATOR_DASHBOARD_ENROLLMENT_LIMIT),
  ] as const;
}

interface NavigateProps {
  onNavigatePage?: (page: string) => void;
}

interface CreatorDashboardProps extends NavigateProps {
  academyTheme?: string;
  resolvedTheme?: "light" | "dark";
}

function Trend({
  value,
  negative = false,
  neutral = false,
}: {
  value: string;
  negative?: boolean;
  neutral?: boolean;
}) {
  const Icon = negative ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`creator-trend ${negative ? "is-negative" : ""} ${
        neutral ? "is-neutral" : ""
      }`}
    >
      {!neutral && <Icon size={14} weight="bold" />} {value}
    </span>
  );
}

function getDashboardGreeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

function DashboardMetricComparison({
  changePercent,
  changeValue,
  context,
  unavailable,
}: {
  changePercent?: number | null;
  changeValue?: string;
  context: string;
  unavailable: boolean;
}) {
  if (unavailable) {
    return (
      <>
        <Trend value="—" neutral />
        <span className="creator-kpi-context">{context}</span>
      </>
    );
  }

  if (changeValue !== undefined) {
    return (
      <>
        <Trend value={changeValue} neutral={changeValue === "+0"} />
        <span className="creator-kpi-context">{context}</span>
      </>
    );
  }

  if (changePercent === null || changePercent === undefined) {
    return (
      <>
        <Trend value="No comparison" neutral />
        <span className="creator-kpi-context">{context}</span>
      </>
    );
  }

  return (
    <>
      <Trend
        value={`${Math.abs(changePercent).toFixed(1)}%`}
        negative={changePercent < 0}
        neutral={changePercent === 0}
      />
      <span className="creator-kpi-context">{context}</span>
    </>
  );
}

function RevenueMetricTrend({
  changePercent,
  refunds = false,
  unavailable = false,
}: {
  changePercent: number | null;
  refunds?: boolean;
  unavailable?: boolean;
}) {
  if (unavailable) {
    return <span className="creator-trend is-neutral">—</span>;
  }

  if (changePercent === null) {
    return <span className="creator-trend is-neutral">No comparison</span>;
  }

  const isNeutral = changePercent === 0;
  const isNegative = refunds ? changePercent > 0 : changePercent < 0;
  const Icon = changePercent < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <span
      className={`creator-trend ${isNegative ? "is-negative" : ""} ${
        isNeutral ? "is-neutral" : ""
      }`}
    >
      <Icon size={14} weight="bold" /> {Math.abs(changePercent).toFixed(1)}%
    </span>
  );
}

function EnrollmentActivityComparison({
  changePercent,
  unavailable,
}: {
  changePercent: number | null;
  unavailable: boolean;
}) {
  if (unavailable) {
    return (
      <span className="creator-activity-comparison is-neutral">
        <strong className="creator-activity-comparison-value">
          No comparison
        </strong>
        <small className="creator-activity-comparison-context">
          vs previous 7 days
        </small>
      </span>
    );
  }
  if (changePercent === null) {
    return (
      <span className="creator-activity-comparison is-neutral">
        <strong className="creator-activity-comparison-value">
          No comparison
        </strong>
        <small className="creator-activity-comparison-context">
          vs previous 7 days
        </small>
      </span>
    );
  }

  if (changePercent === 0) {
    return (
      <span className="creator-activity-comparison is-neutral">
        <strong className="creator-activity-comparison-value">0%</strong>
        <small className="creator-activity-comparison-context">
          vs previous 7 days
        </small>
      </span>
    );
  }

  const isNegative = changePercent < 0;
  const Icon = isNegative ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`creator-activity-comparison ${
        isNegative ? "is-negative" : ""
      }`}
    >
      <strong className="creator-activity-comparison-value">
        <Icon size={13} weight="bold" />
        {formatEnrollmentComparisonPercent(Math.abs(changePercent))}
        {isNegative ? " fewer enrollments" : " more enrollments"}
      </strong>
      <small className="creator-activity-comparison-context">
        vs previous 7 days
      </small>
    </span>
  );
}

function formatDashboardCurrency(value: number, currency: string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDashboardNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatDashboardPercent(value: number) {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value)}%`;
}

function formatEnrollmentComparisonPercent(value: number) {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

interface DashboardInfoPopoverProps {
  className?: string;
  infoLabel: string;
  infoTitle: string;
  infoDescription: ReactNode;
  portal?: boolean;
}

function DashboardInfoPopover({
  className = "",
  infoLabel,
  infoTitle,
  infoDescription,
  portal = false,
}: DashboardInfoPopoverProps) {
  const infoPopoverId = useId();
  const infoControlRef = useRef<HTMLDivElement>(null);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const infoPopoverRef = useRef<HTMLDivElement>(null);
  const [isInfoPinned, setIsInfoPinned] = useState(false);
  const [isInfoHovered, setIsInfoHovered] = useState(false);
  const [isInfoFocused, setIsInfoFocused] = useState(false);
  const [isInfoDismissed, setIsInfoDismissed] = useState(false);
  const [infoPopoverPlacement, setInfoPopoverPlacement] =
    useState<InfoPopoverPlacement>("top");
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInfoOpen =
    !isInfoDismissed && (isInfoPinned || isInfoHovered || isInfoFocused);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const scheduleHoverClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      setIsInfoHovered(false);
      closeTimeoutRef.current = null;
    }, 160);
  };

  useLayoutEffect(() => {
    if (!isInfoOpen) return undefined;

    const updateInfoPopoverPlacement = () => {
      const buttonBounds = infoButtonRef.current?.getBoundingClientRect();
      const popoverBounds = infoPopoverRef.current?.getBoundingClientRect();
      if (!buttonBounds || !popoverBounds) return;

      const collisionPadding = 12;
      const sideOffset = 8;
      const fitsAbove =
        buttonBounds.top - popoverBounds.height - sideOffset >=
        collisionPadding;
      const fitsLeft =
        buttonBounds.left - popoverBounds.width - sideOffset >=
        collisionPadding;
      const nextPlacement: InfoPopoverPlacement = fitsAbove
        ? "top"
        : fitsLeft
          ? "left"
          : "bottom";

      if (!portal) {
        setInfoPopoverPlacement((current) =>
          current === nextPlacement ? current : nextPlacement,
        );
        return;
      }

      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const section = infoControlRef.current?.closest(
        ".creator-dashboard-panel",
      );
      const sectionBounds = section?.getBoundingClientRect();
      if (portal && sectionBounds) {
        const sectionPadding = 12;
        const maxSectionLeft = Math.max(
          sectionPadding,
          sectionBounds.width - popoverBounds.width - sectionPadding,
        );
        const maxSectionTop = Math.max(
          sectionPadding,
          sectionBounds.height - popoverBounds.height - sectionPadding,
        );
        const preferredLeft =
          buttonBounds.right - popoverBounds.width - sectionBounds.left;
        const preferredTop =
          buttonBounds.bottom + sideOffset - sectionBounds.top;

        setInfoPopoverPlacement("bottom");
        setPopoverPosition({
          top: Math.min(Math.max(preferredTop, sectionPadding), maxSectionTop),
          left: Math.min(
            Math.max(preferredLeft, sectionPadding),
            maxSectionLeft,
          ),
        });
        return;
      }

      const maxLeft = Math.max(
        collisionPadding,
        viewportWidth - popoverBounds.width - collisionPadding,
      );
      const maxTop = Math.max(
        collisionPadding,
        viewportHeight - popoverBounds.height - collisionPadding,
      );
      const centeredTop = Math.min(
        Math.max(buttonBounds.top, collisionPadding),
        maxTop,
      );
      const centeredLeft = Math.min(
        Math.max(buttonBounds.right - popoverBounds.width, collisionPadding),
        maxLeft,
      );

      setInfoPopoverPlacement(nextPlacement);
      setPopoverPosition(
        nextPlacement === "top"
          ? {
              top:
                Math.max(
                  collisionPadding,
                  buttonBounds.top - popoverBounds.height - sideOffset,
                ) - (sectionBounds?.top ?? 0),
              left: centeredLeft - (sectionBounds?.left ?? 0),
            }
          : nextPlacement === "left"
            ? {
                top: centeredTop - (sectionBounds?.top ?? 0),
                left:
                  Math.max(
                    collisionPadding,
                    buttonBounds.left - popoverBounds.width - sideOffset,
                  ) - (sectionBounds?.left ?? 0),
              }
            : {
                top:
                  Math.min(maxTop, buttonBounds.bottom + sideOffset) -
                  (sectionBounds?.top ?? 0),
                left: centeredLeft - (sectionBounds?.left ?? 0),
              },
      );
    };

    updateInfoPopoverPlacement();
    window.addEventListener("resize", updateInfoPopoverPlacement);
    window.addEventListener("scroll", updateInfoPopoverPlacement, true);
    return () => {
      window.removeEventListener("resize", updateInfoPopoverPlacement);
      window.removeEventListener("scroll", updateInfoPopoverPlacement, true);
    };
  }, [isInfoOpen, portal]);

  useEffect(() => {
    if (!isInfoOpen) return undefined;

    const dismissInfo = () => {
      setIsInfoPinned(false);
      setIsInfoDismissed(true);
      setInfoPopoverPlacement("top");
    };
    const handleOutsidePointerDown = (event: globalThis.PointerEvent) => {
      if (!infoControlRef.current?.contains(event.target as Node)) {
        dismissInfo();
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") dismissInfo();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isInfoOpen]);

  useEffect(() => {
    return () => clearCloseTimeout();
  }, []);

  const handleInfoToggle = () => {
    const nextPinned = !isInfoPinned;
    setIsInfoPinned(nextPinned);
    setIsInfoDismissed(!nextPinned);
    if (nextPinned && !isInfoOpen) setInfoPopoverPlacement("top");
  };

  const portalTarget =
    portal && typeof document !== "undefined"
      ? (infoControlRef.current?.closest(".creator-dashboard-panel") ??
        document.body)
      : null;

  return (
    <div
      ref={infoControlRef}
      className={`creator-panel-info-wrap ${className}`.trim()}
      onMouseEnter={() => {
        clearCloseTimeout();
        setIsInfoHovered(true);
        setIsInfoDismissed(false);
        if (!isInfoOpen) setInfoPopoverPlacement("top");
      }}
      onMouseLeave={() => {
        if (portal && !isInfoPinned && !isInfoFocused) {
          scheduleHoverClose();
        } else {
          setIsInfoHovered(false);
        }
      }}
    >
      <button
        type="button"
        className="creator-panel-info"
        ref={infoButtonRef}
        aria-label={infoLabel}
        aria-controls={infoPopoverId}
        aria-expanded={isInfoOpen}
        aria-describedby={isInfoOpen ? infoPopoverId : undefined}
        onFocus={() => {
          setIsInfoFocused(true);
          setIsInfoDismissed(false);
          if (!isInfoOpen) setInfoPopoverPlacement("top");
        }}
        onBlur={() => setIsInfoFocused(false)}
        onClick={handleInfoToggle}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      {isInfoOpen &&
        (() => {
          const popover = (
            <div
              id={infoPopoverId}
              className={`creator-panel-info-popover${
                portal ? " creator-panel-info-popover--portal" : ""
              }`}
              ref={infoPopoverRef}
              data-placement={infoPopoverPlacement}
              role="tooltip"
              style={
                portal && popoverPosition
                  ? {
                      top: popoverPosition.top,
                      left: popoverPosition.left,
                    }
                  : portal
                    ? { visibility: "hidden" }
                    : undefined
              }
              onMouseEnter={portal ? clearCloseTimeout : undefined}
              onMouseLeave={portal ? scheduleHoverClose : undefined}
            >
              <strong>{infoTitle}</strong>
              <div className="creator-panel-info-content">
                {infoDescription}
              </div>
            </div>
          );

          return portal && portalTarget
            ? createPortal(popover, portalTarget)
            : popover;
        })()}
    </div>
  );
}

function DashboardPanel({
  className = "",
  icon,
  title,
  action,
  onAction,
  infoLabel,
  infoTitle,
  infoDescription,
  children,
}: DashboardPanelProps) {
  const hasInfoPopover = Boolean(infoLabel && infoTitle && infoDescription);
  const HeadingIcon = icon;

  return (
    <section className={`creator-dashboard-panel ${className}`}>
      <header className="creator-panel-heading">
        <h2>
          <HeadingIcon size={18} weight="regular" aria-hidden="true" />
          <span>{title}</span>
        </h2>
        <div className="creator-panel-actions">
          {hasInfoPopover && (
            <DashboardInfoPopover
              infoLabel={infoLabel!}
              infoTitle={infoTitle!}
              infoDescription={infoDescription!}
            />
          )}
          {action && (
            <button
              type="button"
              className="creator-panel-link"
              onClick={onAction}
            >
              {action} <ArrowRight size={16} />
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

interface RevenuePlotBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface RevenuePointPosition {
  x: number;
  y: number;
}

interface ActiveRevenuePoint extends RevenuePointPosition {
  index: number;
  width: number;
  height: number;
  trend: DashboardRevenueOverview["trend"];
}

type ActivityBuckets =
  DashboardSummaryResponse["learningActivity"]["enrollmentActivity"]["buckets"];

interface ActiveActivityPoint extends RevenuePointPosition {
  index: number;
  width: number;
  height: number;
  buckets: ActivityBuckets;
}

const REVENUE_GRID_RATIOS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
const ACTIVITY_GRID_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;

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

function getRevenuePlotBounds(
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

function getActivityPlotBounds(
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

function getActivityBarPosition(
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

function getRevenuePointPosition(
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

function formatRevenueTooltipDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function getRevenueTooltipPosition(
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

function getActivityTooltipPosition(
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

function formatActivityTooltipDate(date: string) {
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

function getLocalCalendarDateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

interface ActivityDayGroup {
  dateKey: string;
  firstIndex: number;
  lastIndex: number;
  label: string;
}

interface ActivityDayLabel extends ActivityDayGroup {
  centerX: number;
  width: number;
}

function getActivityDayLabelX(
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

function selectActivityDayLabels(
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

function drawRevenueChart({
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

function drawActivityChart({
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

function DataCanvas({
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
            {formatDashboardCurrency(tooltipData.value, revenueCurrency)}
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

function RevenuePanel({
  range,
  setRange,
  themeKey,
  revenueOverview,
  isLoading,
  isError,
  isManualRefresh,
}: {
  range: DashboardRange;
  setRange: (range: DashboardRange) => void;
  themeKey: string;
  revenueOverview?: DashboardRevenueOverview;
  isLoading: boolean;
  isError: boolean;
  isManualRefresh: boolean;
}) {
  const currency = revenueOverview?.currency ?? "INR";
  const trend = revenueOverview?.trend ?? [];
  const panelIsLoading = isLoading || isManualRefresh;
  const revenueStatus = panelIsLoading
    ? "loading"
    : isError
      ? "error"
      : trend.length === 0
        ? "empty"
        : undefined;
  const summaryUnavailable = panelIsLoading || isError;

  return (
    <DashboardPanel
      className="creator-revenue-panel"
      icon={ChartLineUp}
      title="Revenue Overview"
      infoLabel="About Revenue Overview"
      infoTitle="Revenue Overview"
      infoDescription={
        <>
          <p>Tracks sales and order activity for the selected time range.</p>
          <ul>
            <li>
              <strong>Revenue chart</strong> — plots net revenue by UTC day for
              the selected 7D, 30D, 3M, or 1Y range.
            </li>
            <li>
              <strong>Gross Sales</strong> — sum of total order amounts for
              paid, partially refunded, or refunded orders before processed
              refunds are subtracted.
            </li>
            <li>
              <strong>Net Revenue</strong> — Gross Sales minus processed refund
              amounts associated with those same orders.
            </li>
            <li>
              <strong>Orders</strong> — count of paid, partially refunded, or
              refunded orders created during the selected range.
            </li>
            <li>
              <strong>Refunds</strong> — count of orders marked partially
              refunded or refunded; this is not a refund amount.
            </li>
            <li>
              <strong>Comparison</strong> — compares the selected range with the
              immediately preceding range of the same length when a prior
              baseline is available.
            </li>
          </ul>
          <p className="creator-panel-info-note">
            Revenue chart dates use UTC day buckets.
          </p>
        </>
      }
    >
      <div className="creator-chart-toolbar">
        <span>
          <i /> Revenue ({currency === "INR" ? "₹" : currency})
        </span>
        <div
          className="creator-range-tabs"
          data-active-range={range}
          role="tablist"
          aria-label="Revenue range"
        >
          <span className="creator-range-tabs-indicator" aria-hidden="true" />
          {(
            [
              ["7d", "7D"],
              ["30d", "30D"],
              ["3m", "3M"],
              ["1y", "1Y"],
            ] as const
          ).map(([option, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={range === option}
              tabIndex={range === option ? 0 : -1}
              className={range === option ? "is-active" : ""}
              key={option}
              onClick={() => setRange(option)}
              onKeyDown={handleRovingTabKeyDown}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="creator-chart creator-chart--revenue">
        <DataCanvas
          kind="revenue"
          themeKey={themeKey}
          label="Revenue trend for the selected period"
          revenueTrend={trend}
          revenueCurrency={currency}
          revenueStatus={revenueStatus}
        />
      </div>
      <div className="creator-revenue-summary">
        <div>
          <span>Gross Sales</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardCurrency(
                  revenueOverview?.grossSales.value ?? 0,
                  currency,
                )}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.grossSales.changePercent ?? null}
            unavailable={summaryUnavailable}
          />
        </div>
        <div>
          <span>Net Revenue</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardCurrency(
                  revenueOverview?.netRevenue.value ?? 0,
                  currency,
                )}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.netRevenue.changePercent ?? null}
            unavailable={summaryUnavailable}
          />
        </div>
        <div>
          <span>Orders</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardNumber(revenueOverview?.orders.value ?? 0)}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.orders.changePercent ?? null}
            unavailable={summaryUnavailable}
          />
        </div>
        <div>
          <span>Refunds</span>
          <strong>
            {summaryUnavailable
              ? "—"
              : formatDashboardNumber(revenueOverview?.refunds.value ?? 0)}
          </strong>
          <RevenueMetricTrend
            changePercent={revenueOverview?.refunds.changePercent ?? null}
            refunds
            unavailable={summaryUnavailable}
          />
        </div>
      </div>
    </DashboardPanel>
  );
}

function LearningActivityPanel({
  themeKey,
  learningActivity,
  isLoading,
  isError,
  isManualRefresh,
}: {
  themeKey: string;
  learningActivity?: DashboardSummaryResponse["learningActivity"];
  isLoading: boolean;
  isError: boolean;
  isManualRefresh: boolean;
}) {
  const panelIsLoading = isLoading || isManualRefresh;
  const summaryUnavailable = panelIsLoading || isError;
  const rows: readonly ActivityRow[] = [
    [
      "Avg. Course Progress",
      summaryUnavailable
        ? "—"
        : formatDashboardPercent(
            learningActivity?.averageCourseProgress.value ?? 0,
          ),
      ChartLineUp,
      "blue",
    ],
    [
      "Course Completion Rate",
      summaryUnavailable
        ? "—"
        : formatDashboardPercent(
            learningActivity?.courseCompletionRate.value ?? 0,
          ),
      CheckCircle,
      "green",
    ],
    [
      "New Enrollments",
      summaryUnavailable
        ? "—"
        : formatDashboardNumber(learningActivity?.newEnrollments.value ?? 0),
      PlusCircle,
      "violet",
    ],
  ];
  const activityBuckets = summaryUnavailable
    ? []
    : (learningActivity?.enrollmentActivity.buckets ?? []);
  const activityStatus = panelIsLoading
    ? "loading"
    : isError
      ? "error"
      : activityBuckets.length === 0
        ? "empty"
        : undefined;
  const activityComparison = learningActivity?.enrollmentActivity;

  return (
    <DashboardPanel
      className="creator-activity-panel"
      icon={Pulse}
      title="Learning Activity"
      infoLabel="About Learning Activity"
      infoTitle="Learning Activity"
      infoDescription={
        <>
          <p>
            Summarizes how learners are progressing and engaging with courses.
          </p>
          <ul>
            <li>
              <strong>Avg. Course Progress</strong> — average stored progress
              across learner-course pairs with progress records.
            </li>
            <li>
              <strong>Course Completion Rate</strong> — percentage of those
              learner-course pairs whose average progress is at least 100%.
            </li>
            <li>
              <strong>New Enrollments</strong> — count of enrollment records
              created during the current 7-day activity window.
            </li>
            <li>
              <strong>Enrollment Activity</strong> — counts enrollment-record
              creation events across the last 7 days in 8-hour buckets.
            </li>
            <li>
              <strong>Previous 7 days comparison</strong> — compares the current
              activity window with the immediately preceding 7-day window when
              comparison data exists.
            </li>
          </ul>
          <p className="creator-panel-info-note">
            Buckets are created from UTC timestamps and displayed in your
            device-local time.
          </p>
        </>
      }
    >
      <div className="creator-activity-list">
        {rows.map(([label, value, Icon, tone]) => (
          <div className="creator-activity-row" key={label}>
            <span className={`creator-icon-circle tone-${tone}`}>
              <Icon size={18} weight="duotone" />
            </span>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="creator-chart-toolbar creator-activity-toolbar">
        <span>
          <i /> Enrollment Activity
        </span>
        <EnrollmentActivityComparison
          changePercent={activityComparison?.changePercent ?? null}
          unavailable={summaryUnavailable}
        />
      </div>
      <div className="creator-chart creator-chart--activity">
        <DataCanvas
          kind="activity"
          themeKey={themeKey}
          label="New enrollments over the last 7 days in local time, using 8-hour buckets"
          activityBuckets={activityBuckets}
          activityStatus={activityStatus}
        />
      </div>
      <p className="creator-activity-meta">
        Last 7 days · 8h buckets · Local time
      </p>
    </DashboardPanel>
  );
}

function CreatorCourseThumbnail({ course }: { course: DashboardYourCourse }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [course.thumbnailUrl]);

  return (
    <span className="creator-course-thumbnail">
      {course.thumbnailUrl && !imageFailed ? (
        <img
          src={course.thumbnailUrl}
          srcSet={course.thumbnailSrcSet
            ?.map((variant) => `${variant.url} ${variant.width}w`)
            .join(", ")}
          sizes="32px"
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <CourseThumbnailPlaceholder className="creator-course-thumbnail-placeholder" />
      )}
    </span>
  );
}

function formatCourseStatus(status: DashboardYourCourse["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getCourseRowDestination(course: DashboardYourCourse) {
  const editStep = course.status === "draft" ? "basics" : "curriculum";
  return `/courses/${encodeURIComponent(course.id)}/edit/${editStep}`;
}

function clampCourseProgress(value: number) {
  return Math.min(100, Math.max(0, value));
}

function DashboardRetryContent({
  title,
  message,
  isRetrying,
  onRetry,
}: {
  title: string;
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <span className="creator-dashboard-state-content">
      <strong>{title}</strong>
      <small>{message}</small>
      <button
        type="button"
        className="creator-dashboard-state-retry"
        onClick={onRetry}
        disabled={isRetrying}
        aria-busy={isRetrying}
      >
        <ArrowClockwise
          size={14}
          aria-hidden="true"
          className={
            isRetrying
              ? "creator-dashboard-state-retry-icon is-retrying"
              : "creator-dashboard-state-retry-icon"
          }
        />
        {isRetrying ? "Retrying…" : "Retry"}
      </button>
    </span>
  );
}

function CreatorCourseProgress({
  value,
  animated,
}: {
  value: number;
  animated: boolean;
}) {
  const target = clampCourseProgress(value);
  const displayedProgressRef = useRef(animated ? 0 : target);
  const [displayedProgress, setDisplayedProgress] = useState(
    displayedProgressRef.current,
  );

  useEffect(() => {
    if (!animated) {
      displayedProgressRef.current = target;
      setDisplayedProgress(target);
      return;
    }

    if (displayedProgressRef.current === target) return;

    const frame = window.requestAnimationFrame(() => {
      displayedProgressRef.current = target;
      setDisplayedProgress(target);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [animated, target]);

  return (
    <i>
      <b
        className={
          animated ? "creator-progress-fill" : "creator-progress-fill--static"
        }
        style={{ width: `${displayedProgress}%` }}
      />
    </i>
  );
}

function CourseTableSkeletonRows() {
  return Array.from({ length: 5 }, (_, index) => (
    <div
      className="creator-table-row creator-course-skeleton-row"
      key={`course-skeleton-${index}`}
      aria-hidden="true"
    >
      <span className="creator-course-cell">
        <span className="creator-course-skeleton-thumbnail" />
        <span className="creator-course-skeleton-title" />
      </span>
      <span>
        <span className="creator-course-skeleton-status" />
      </span>
      <span>
        <span className="creator-course-skeleton-students" />
      </span>
      <span className="creator-progress-cell">
        <span className="creator-course-skeleton-percent" />
        <i className="creator-course-skeleton-track">
          <b />
        </i>
      </span>
    </div>
  ));
}

function CoursesPanel({
  onNavigatePage,
  courses,
  isLoading,
  isError,
  isFetching,
  isManualRefresh,
  onRetry,
}: NavigateProps & {
  courses?: DashboardSummaryResponse["yourCourses"];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isManualRefresh: boolean;
  onRetry: () => void;
}) {
  const courseRows = courses ?? [];
  const hasCourseData = courses !== undefined;
  const showInitialLoading = isManualRefresh || (isLoading && !hasCourseData);
  const showInitialError = isError && !hasCourseData;

  return (
    <DashboardPanel
      className="creator-courses-panel"
      icon={BookOpen}
      title="Your Courses"
      action="Manage courses"
      onAction={() => onNavigatePage?.("courses")}
    >
      <div className="creator-table creator-courses-table">
        <div className="creator-table-head">
          <span>Course</span>
          <span>Status</span>
          <span>Students</span>
          <div className="creator-table-head-label">
            <span>Avg Progress</span>
            <DashboardInfoPopover
              className="creator-table-info-wrap"
              portal
              infoLabel="About average course progress"
              infoTitle="Average Course Progress"
              infoDescription={
                <p>
                  Average of each learner&apos;s stored course-progress records
                  for this course. A missing value means no progress record is
                  available.
                </p>
              }
            />
          </div>
        </div>
        {showInitialLoading ? (
          <div
            className="creator-course-skeleton"
            role="status"
            aria-label="Loading courses"
          >
            <CourseTableSkeletonRows />
          </div>
        ) : showInitialError ? (
          <div className="creator-table-row creator-table-state" role="alert">
            <DashboardRetryContent
              title="Couldn't load courses"
              message="Something went wrong while loading your courses."
              isRetrying={isFetching}
              onRetry={onRetry}
            />
          </div>
        ) : courseRows.length === 0 ? (
          <div className="creator-table-row creator-table-state creator-courses-empty-state">
            <span>
              <strong>No courses yet</strong>
              <small>
                Create your first course to start tracking students and
                progress.
              </small>
              <button
                type="button"
                className="creator-panel-link"
                onClick={() => onNavigatePage?.("Create Course")}
              >
                Create course <ArrowRight size={16} />
              </button>
            </span>
          </div>
        ) : (
          courseRows.map((course) => (
            <button
              type="button"
              className="creator-table-row creator-course-row"
              key={course.id}
              onClick={() => onNavigatePage?.(getCourseRowDestination(course))}
              title={
                course.status === "draft"
                  ? `Continue editing ${course.title}`
                  : `Manage ${course.title}`
              }
            >
              <span className="creator-course-cell">
                <CreatorCourseThumbnail course={course} />
                <strong>{course.title}</strong>
              </span>
              <span>
                <em
                  className={`course-tag creator-course-status course-tag--${course.status}`}
                >
                  {formatCourseStatus(course.status)}
                </em>
              </span>
              <span className="creator-course-students">
                <Users
                  className="creator-course-students-icon"
                  size={14}
                  weight="regular"
                  aria-hidden="true"
                />
                <span className="creator-course-students-number">
                  {formatDashboardNumber(course.students)}
                </span>
                <span className="creator-course-students-label">
                  {course.students === 1 ? "student" : "students"}
                </span>
              </span>
              <span
                className="creator-progress-cell"
                data-progress-unavailable={
                  course.averageProgressPercent === null ? "" : undefined
                }
              >
                <span>
                  {course.averageProgressPercent === null
                    ? "—"
                    : formatDashboardPercent(course.averageProgressPercent)}
                </span>
                {course.averageProgressPercent !== null && (
                  <CreatorCourseProgress
                    value={course.averageProgressPercent}
                    animated={course.status === "published"}
                  />
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </DashboardPanel>
  );
}

function DiscussionsPanel({
  onNavigatePage,
  isManualRefresh,
}: NavigateProps & { isManualRefresh: boolean }) {
  const {
    data: discussionsResponse,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useDashboardRecentDiscussions();
  const hasDiscussionData = discussionsResponse !== undefined;
  const showInitialLoading =
    isManualRefresh || (isLoading && !hasDiscussionData);
  const showInitialError = isError && !hasDiscussionData;
  const discussionCards =
    discussionsResponse?.items.map((item) =>
      adaptDiscussionWorkspaceItem(item),
    ) ?? [];

  return (
    <DashboardPanel
      className="creator-discussions-panel"
      icon={ChatCircleDots}
      title="Recent Discussions"
      action="Open discussions"
      onAction={() => onNavigatePage?.("Discussions")}
    >
      <div
        className="creator-discussion-list discussion-hub"
        data-dashboard-discussion-preview
        aria-busy={showInitialLoading || isFetching}
      >
        {showInitialLoading ? (
          <DashboardDiscussionCardSkeletons />
        ) : showInitialError ? (
          <div className="creator-discussion-state" role="alert">
            <DashboardDiscussionRetryContent
              title="Couldn't load discussions"
              message="Something went wrong while loading recent discussions."
              isRetrying={isFetching}
              onRetry={() => void refetch()}
            />
          </div>
        ) : discussionCards.length === 0 ? (
          <div className="creator-discussion-state" role="status">
            <strong>No discussions yet</strong>
            <small>Learner questions and comments will appear here.</small>
          </div>
        ) : (
          discussionCards.map((item) => (
            <DiscussionWorkspaceCard
              key={`${item.itemType}:${item.id}`}
              card={item}
              onNavigatePage={onNavigatePage}
              variant="compact"
              expandable={false}
            />
          ))
        )}
      </div>
    </DashboardPanel>
  );
}

function CreatorStudentAvatar({ src }: { src?: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  return (
    <span className="creator-student-avatar" aria-hidden="true">
      {src && !imageFailed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <UserCircle className="creator-student-avatar-icon" weight="duotone" />
      )}
    </span>
  );
}

function CreatorEnrollmentProgress({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span
        className="creator-enrollment-progress-unavailable"
        data-mobile-label="Progress"
      >
        Not started
      </span>
    );
  }

  return (
    <span className="creator-progress-cell" data-mobile-label="Progress">
      <span className="creator-enrollment-progress-value">
        {formatDashboardPercent(value)}
      </span>
      <CreatorCourseProgress value={value} animated />
    </span>
  );
}

function EnrollmentTableSkeletonRows() {
  return (
    <div
      className="creator-enrollment-skeleton-rows"
      role="status"
      aria-label="Loading recent enrollments"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="creator-table-row creator-enrollment-skeleton-row"
          key={`enrollment-skeleton-${index}`}
          aria-hidden="true"
        >
          <span className="creator-student-cell">
            <span className="creator-enrollment-skeleton-avatar" />
            <span className="creator-enrollment-skeleton-name" />
          </span>
          <span>
            <span className="creator-enrollment-skeleton-course" />
          </span>
          <span className="creator-enrollment-mobile-meta">
            <span className="creator-enrollment-progress-slot">
              <span
                className="creator-progress-cell"
                data-mobile-label="Progress"
              >
                <span className="creator-enrollment-skeleton-percent" />
                <i className="creator-enrollment-skeleton-track">
                  <b />
                </i>
              </span>
            </span>
            <span
              className="creator-enrollment-skeleton-time"
              data-mobile-label="Enrolled"
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function EnrollmentsPanel({
  onNavigatePage,
  isManualRefresh,
}: NavigateProps & { isManualRefresh: boolean }) {
  const {
    data: enrollmentsResponse,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useRecentEnrollments({ limit: CREATOR_DASHBOARD_ENROLLMENT_LIMIT });
  const hasEnrollmentData = enrollmentsResponse !== undefined;
  const showInitialLoading =
    isManualRefresh || (isLoading && !hasEnrollmentData);
  const showInitialError = isError && !hasEnrollmentData;
  const enrollments = enrollmentsResponse?.items ?? [];

  return (
    <DashboardPanel
      className="creator-enrollments-panel"
      icon={UserPlus}
      title="Recent Enrollments"
      action="Manage students"
      onAction={() => onNavigatePage?.("Students")}
    >
      <div
        className="creator-table creator-enrollment-table"
        aria-busy={showInitialLoading || isFetching}
      >
        <div className="creator-table-head">
          <span>Student</span>
          <span>Course</span>
          <div className="creator-table-head-label">
            <span>Progress</span>
            <DashboardInfoPopover
              className="creator-table-info-wrap"
              portal
              infoLabel="About enrollment progress"
              infoTitle="Enrollment Progress"
              infoDescription={
                <p>
                  Average of the stored progress percentages for this learner
                  and course. Not started means no matching progress records are
                  available.
                </p>
              }
            />
          </div>
          <span>Enrolled</span>
        </div>
        {showInitialLoading ? (
          <EnrollmentTableSkeletonRows />
        ) : showInitialError ? (
          <div className="creator-table-row creator-table-state" role="alert">
            <DashboardRetryContent
              title="Couldn't load enrollments"
              message="Something went wrong while loading recent enrollments."
              isRetrying={isFetching}
              onRetry={() => void refetch()}
            />
          </div>
        ) : enrollments.length === 0 ? (
          <div className="creator-table-row creator-table-state" role="status">
            <span className="creator-dashboard-state-content">
              <strong>No recent enrollments</strong>
              <small>New student enrollments will appear here.</small>
            </span>
          </div>
        ) : (
          enrollments.map((item) => {
            const studentUsername = item.student.username?.trim();
            const rowContent = (
              <>
                <span className="creator-student-cell">
                  <CreatorStudentAvatar src={item.student.avatarUrl} />
                  <strong>{item.student.displayName}</strong>
                </span>
                <span>{item.course.title}</span>
                <span className="creator-enrollment-mobile-meta">
                  <span className="creator-enrollment-progress-slot">
                    <CreatorEnrollmentProgress
                      value={item.averageProgressPercent}
                    />
                  </span>
                  <time
                    dateTime={new Date(item.enrolledAt).toISOString()}
                    data-mobile-label="Enrolled"
                  >
                    {formatRelativeTime(item.enrolledAt)}
                  </time>
                </span>
              </>
            );

            if (!studentUsername) {
              return (
                <div className="creator-table-row" key={item.enrollmentId}>
                  {rowContent}
                </div>
              );
            }

            return (
              <button
                type="button"
                className="creator-table-row creator-enrollment-row"
                key={item.enrollmentId}
                onClick={() =>
                  onNavigatePage?.(
                    `/students/${encodeURIComponent(studentUsername)}`,
                  )
                }
                aria-label={`View learner ${item.student.displayName}`}
              >
                {rowContent}
              </button>
            );
          })
        )}
      </div>
    </DashboardPanel>
  );
}

export const CreatorDashboard = memo(function CreatorDashboard({
  onNavigatePage,
  academyTheme = "default",
  resolvedTheme = "dark",
}: CreatorDashboardProps) {
  const [range, setRange] = useState<DashboardRange>("30d");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const {
    data: dashboardResponse,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    isFetching: isDashboardFetching,
    refetch: refetchDashboard,
  } = useDashboard(range);
  const dashboardUnavailable =
    isRefreshing ||
    isDashboardLoading ||
    isDashboardError ||
    !dashboardResponse;
  const dashboardCurrency = dashboardResponse?.revenue.currency ?? "INR";
  const dashboardDisplayName =
    currentUser?.displayName?.trim() ||
    currentUser?.username?.trim() ||
    "Your name";
  const dashboardGreeting = getDashboardGreeting();
  const chartThemeKey = `${academyTheme}:${resolvedTheme}`;
  const handleDashboardRefresh = async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    setIsRefreshing(true);
    try {
      await Promise.allSettled(
        getCreatorDashboardRefreshQueryKeys(range).map((queryKey) =>
          queryClient.refetchQueries({
            queryKey,
            exact: true,
            type: "active",
          }),
        ),
      );
    } finally {
      refreshInFlightRef.current = false;
      setIsRefreshing(false);
    }
  };
  const metricCards = [
    {
      label: "Revenue This Month",
      value: dashboardUnavailable
        ? "—"
        : formatDashboardCurrency(
            dashboardResponse.revenue.value,
            dashboardCurrency,
          ),
      changePercent: dashboardResponse?.revenue.changePercent,
      context: "vs last month",
      icon: CurrencyInr,
      tone: "violet",
    },
    {
      label: "Total Students",
      value: dashboardUnavailable
        ? "—"
        : formatDashboardNumber(dashboardResponse.students.total),
      changeValue: dashboardUnavailable
        ? undefined
        : `+${formatDashboardNumber(dashboardResponse.students.newThisMonth)}`,
      context: "this month",
      icon: Users,
      tone: "blue",
    },
    {
      label: "Active Learners (7d)",
      value: dashboardUnavailable
        ? "—"
        : formatDashboardNumber(dashboardResponse.activeLearners.value),
      changePercent: dashboardResponse?.activeLearners.changePercent,
      context: "vs last 7 days",
      icon: Pulse,
      tone: "green",
    },
    {
      label: "Watch Time This Month",
      value: dashboardUnavailable
        ? "—"
        : `${formatDashboardNumber(dashboardResponse.watchHours.value)} hrs`,
      changePercent: dashboardResponse?.watchHours.changePercent,
      context: "vs last month",
      icon: Clock,
      tone: "gold",
    },
  ];

  return (
    <div className="creator-dashboard">
      <header className="creator-dashboard-heading">
        <div>
          <h1>
            <span className="creator-dashboard-greeting">
              {dashboardGreeting},{" "}
              <span className="creator-dashboard-greeting-name">
                {dashboardDisplayName}{" "}
                <span
                  className="creator-dashboard-greeting-emoji"
                  aria-hidden="true"
                >
                  👋
                </span>
              </span>
            </span>
          </h1>
          <p>Here&apos;s what&apos;s happening with your academy today.</p>
        </div>
        <div className="creator-dashboard-actions">
          <button
            type="button"
            className="creator-outline-action creator-dashboard-refresh-action"
            onClick={() => void handleDashboardRefresh()}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <ArrowClockwise
              className={`creator-dashboard-refresh-icon${
                isRefreshing ? " is-refreshing" : ""
              }`}
              size={17}
              aria-hidden="true"
            />
            Refresh
          </button>
          <button
            type="button"
            className="creator-primary-action"
            onClick={() => onNavigatePage?.("Create Course")}
          >
            <Plus size={18} />
            <span className="creator-action-label creator-action-label--full">
              Create Course
            </span>
            <span className="creator-action-label creator-action-label--compact">
              Course
            </span>
          </button>
          <button
            type="button"
            className="creator-outline-action"
            onClick={() => onNavigatePage?.("Analytics")}
          >
            <ChartBar size={17} />
            <span className="creator-action-label creator-action-label--full">
              View Analytics
            </span>
            <span className="creator-action-label creator-action-label--compact">
              Analytics
            </span>
          </button>
        </div>
      </header>

      <section className="creator-kpi-grid" aria-label="Academy overview">
        {metricCards.map(
          ({
            label,
            value,
            changePercent,
            changeValue,
            context,
            icon: Icon,
            tone,
          }) => (
            <article className="creator-kpi-card" key={label}>
              <span className={`creator-icon-circle tone-${tone}`}>
                <Icon size={22} weight="duotone" />
              </span>
              <div>
                <small>{label}</small>
                <strong>{value}</strong>
                <span className="creator-kpi-footer">
                  <DashboardMetricComparison
                    changePercent={changePercent}
                    changeValue={changeValue}
                    context={context}
                    unavailable={dashboardUnavailable}
                  />
                </span>
              </div>
            </article>
          ),
        )}
      </section>

      <div className="creator-dashboard-grid">
        <RevenuePanel
          range={range}
          setRange={setRange}
          themeKey={chartThemeKey}
          revenueOverview={dashboardResponse?.revenueOverview}
          isLoading={isDashboardLoading}
          isError={isDashboardError}
          isManualRefresh={isRefreshing}
        />
        <LearningActivityPanel
          themeKey={chartThemeKey}
          learningActivity={dashboardResponse?.learningActivity}
          isLoading={isDashboardLoading}
          isError={isDashboardError}
          isManualRefresh={isRefreshing}
        />
        <CoursesPanel
          onNavigatePage={onNavigatePage}
          courses={dashboardResponse?.yourCourses}
          isLoading={isDashboardLoading}
          isError={isDashboardError}
          isFetching={isDashboardFetching}
          isManualRefresh={isRefreshing}
          onRetry={() => void refetchDashboard()}
        />
        <DiscussionsPanel
          onNavigatePage={onNavigatePage}
          isManualRefresh={isRefreshing}
        />
        <EnrollmentsPanel
          onNavigatePage={onNavigatePage}
          isManualRefresh={isRefreshing}
        />
      </div>
    </div>
  );
});
