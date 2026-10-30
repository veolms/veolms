import { ArrowDownRightIcon as ArrowDownRight } from "@phosphor-icons/react/ArrowDownRight";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { formatEnrollmentComparisonPercent } from "./dashboardFormat";

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

export function DashboardMetricComparison({
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

export function RevenueMetricTrend({
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

export function EnrollmentActivityComparison({
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
