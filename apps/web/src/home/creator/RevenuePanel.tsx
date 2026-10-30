import { useMemo } from "react";
import { toMajorUnits } from "@veolms/contracts/commerce/money";
import type {
  DashboardRange,
  DashboardRevenueOverview,
} from "@veolms/contracts";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { handleRovingTabKeyDown } from "../../accessibility/rovingTabFocus";
import { DashboardPanel } from "./DashboardPanel";
import { DataCanvas } from "./DataCanvas";
import { RevenueMetricTrend } from "./dashboardMetrics";
import {
  formatDashboardCurrency,
  formatDashboardNumber,
} from "./dashboardFormat";

export function RevenuePanel({
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
  // The canvas chart scales and labels plain numbers, so the revenue series
  // (minor units from the API) is converted to major units once, here.
  const apiTrend = revenueOverview?.trend;
  const trend = useMemo(
    () =>
      (apiTrend ?? []).map((point) => ({
        ...point,
        value: toMajorUnits(point.value, currency),
      })),
    [apiTrend, currency],
  );
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
