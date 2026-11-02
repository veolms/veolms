import { lazy, type ComponentType } from "react";
import { ChartPieSliceIcon as ChartPieSlice } from "@phosphor-icons/react/ChartPieSlice";
import { CurrencyInrIcon as CurrencyInr } from "@phosphor-icons/react/CurrencyInr";
import { BooksIcon as Books } from "@phosphor-icons/react/Books";
import type {
  AnalyticsTabContribution,
  AnalyticsTabProps,
} from "@veolms/web-core";
import {
  COURSES_PLACEHOLDER,
  OVERVIEW_PLACEHOLDER,
  REVENUE_PLACEHOLDER,
} from "./analyticsPlaceholders";

/**
 * The page's own tabs. Plugins add theirs through `registerAnalyticsTab`
 * (web-core); the page shows both lists in `order`. Each tab's module is
 * loaded when it is first opened, so the Overview does not pay for the
 * charts of the others.
 */
const lazyTab = (
  load: () => Promise<{ default: ComponentType<AnalyticsTabProps> }>,
) => lazy(load);

export const CORE_ANALYTICS_TABS: readonly AnalyticsTabContribution[] = [
  {
    id: "overview",
    label: "Overview",
    permission: "analytics.overview.read",
    order: 0,
    Icon: ChartPieSlice,
    tone: "blue",
    component: lazyTab(() => import("./tabs/OverviewTab")),
    placeholder: OVERVIEW_PLACEHOLDER,
  },
  {
    id: "revenue",
    label: "Revenue",
    permission: "analytics.revenue.read",
    order: 10,
    Icon: CurrencyInr,
    tone: "green",
    component: lazyTab(() => import("./tabs/RevenueTab")),
    placeholder: REVENUE_PLACEHOLDER,
  },
  {
    id: "courses",
    label: "Courses & Content",
    permission: "analytics.course.read",
    order: 20,
    Icon: Books,
    tone: "violet",
    component: lazyTab(() => import("./tabs/CoursesTab")),
    placeholder: COURSES_PLACEHOLDER,
  },
];
