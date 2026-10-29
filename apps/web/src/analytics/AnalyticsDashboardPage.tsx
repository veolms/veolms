import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router";
import { downloadCsv } from "@veolms/analytics-ui";
import type {
  AnalyticsExportSection,
  AnalyticsTabFilters,
} from "@veolms/web-core";
import { SwipeableTabPanel } from "../navigation/SwipeableTabPanel";
import type { NavigateTo } from "../routing/navigation";
import type { ThemedSelectOption } from "../ThemedSelect";
import { useCapabilities } from "../services/authorization";
import { useMyCourses } from "../services/courses";
import { useSettingsTabShortcuts } from "../settings/useSettingsTabShortcuts";
import {
  ANALYTICS_DEFAULT_RANGE,
  ANALYTICS_DEFAULT_TAB,
  AnalyticsPageChrome,
  AnalyticsPageLoading,
  AnalyticsTabLoading,
  formatDay,
  isAnalyticsRangeKey,
  parseDay,
  rangeLengthInDays,
  resolveAnalyticsTab,
  useAnalyticsTabs,
  type AnalyticsRangeKey,
  type CustomDateRange,
} from "./AnalyticsPageChrome";
import "../styles/features/settings/foundation.css";
import "../styles/features/settings/preferences-responsive.css";

interface Props {
  role: "student" | "creator";
  isAdmin: boolean;
  /** The section from the path (`/analytics/<tab>`); the overview without one. */
  tab?: string;
  onNavigatePage?: NavigateTo;
}

const ANALYTICS_PATH = "/analytics";

/** `/analytics` for the overview, `/analytics/<tab>` for any other section. */
export function analyticsTabPath(tabId: string): string {
  return tabId === ANALYTICS_DEFAULT_TAB
    ? ANALYTICS_PATH
    : `${ANALYTICS_PATH}/${tabId}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The end of today (UTC): see `useDateRangeParams`. */
function endOfToday(): Date {
  const to = new Date();
  to.setUTCHours(24, 0, 0, 0);
  return to;
}

/** The days a preset covers, as a custom range to start from. */
function presetAsCustom(rangeKey: AnalyticsRangeKey): CustomDateRange {
  const days = rangeLengthInDays(rangeKey);
  const to = endOfToday();
  return {
    from: formatDay(new Date(to.getTime() - days * DAY_MS)),
    to: formatDay(new Date(to.getTime() - DAY_MS)),
  };
}

function useDateRangeParams(
  rangeKey: AnalyticsRangeKey,
  custom: CustomDateRange | undefined,
) {
  const customFrom = custom?.from;
  const customTo = custom?.to;
  return useMemo(() => {
    // A custom range runs from the start of its first day to the end of its
    // last (UTC): the same days on every request.
    const fromDay = parseDay(customFrom);
    const toDay = parseDay(customTo);
    if (rangeKey === "custom" && fromDay && toDay) {
      return {
        from: fromDay.toISOString(),
        to: new Date(toDay.getTime() + DAY_MS).toISOString(),
      };
    }
    // Through the end of today (UTC), so the range is the same for every
    // request made today. With "now" to the millisecond no two requests
    // matched: the server's response cache never hit, and this page
    // refetched everything each time it was opened.
    const to = endOfToday();
    const from = new Date(to.getTime() - rangeLengthInDays(rangeKey) * DAY_MS);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [rangeKey, customFrom, customTo]);
}

/**
 * The analytics page, laid out like Settings: the heading scrolls away, the
 * section tabs stay pinned (same bar, same colours, same Alt+1… and arrow
 * shortcuts, same swipe between sections on touch), and the filters and
 * the open section scroll under them. A section is a path of its own.
 */
function AnalyticsContent({
  isAdmin,
  tab,
  onNavigatePage,
}: {
  isAdmin: boolean;
  tab: string | undefined;
  onNavigatePage: NavigateTo | undefined;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabListRef = useRef<HTMLElement>(null);

  const tabs = useAnalyticsTabs(isAdmin);
  const tabIds = useMemo(() => tabs.map((entry) => entry.id), [tabs]);
  const activeTab = resolveAnalyticsTab(tabs, tab);
  const activeTabRef = useRef(activeTab.id);
  activeTabRef.current = activeTab.id;

  // The sections used to live in `?tab=`; a saved link of that shape opens
  // the same section at its path, with the rest of the query kept.
  const legacyTab = searchParams.get("tab");
  useEffect(() => {
    if (!legacyTab) return;
    const rest = new URLSearchParams(searchParams);
    rest.delete("tab");
    const query = rest.toString();
    const destination = `${analyticsTabPath(legacyTab)}${query ? `?${query}` : ""}`;
    if (onNavigatePage) onNavigatePage(destination);
    else window.history.replaceState(window.history.state, "", destination);
  }, [legacyTab, onNavigatePage, searchParams]);

  const requestedRange = searchParams.get("range");
  const range: AnalyticsRangeKey = isAnalyticsRangeKey(requestedRange)
    ? requestedRange
    : ANALYTICS_DEFAULT_RANGE;
  // A custom range keeps its days in the address (`?from=…&to=…`), so a
  // link or a reload opens the same days; the last week until picked.
  const requestedFrom = searchParams.get("from");
  const requestedTo = searchParams.get("to");
  const customRange = useMemo<CustomDateRange | undefined>(() => {
    if (range !== "custom") return undefined;
    const from = parseDay(requestedFrom);
    const to = parseDay(requestedTo);
    return from && to && from <= to
      ? { from: formatDay(from), to: formatDay(to) }
      : presetAsCustom("7d");
  }, [range, requestedFrom, requestedTo]);
  const [courseId, setCourseId] = useState<string>("all");
  const dateRangeParams = useDateRangeParams(range, customRange);
  const myCourses = useMyCourses();

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // A section is a path of its own (`/analytics/revenue`), as on Settings;
  // the range and course stay in the query string and travel with it.
  const selectTab = useCallback(
    (id: string) => {
      if (id === activeTabRef.current) return;
      const query = window.location.search.replace(/^\?/, "");
      const destination = `${analyticsTabPath(id)}${query ? `?${query}` : ""}`;
      if (onNavigatePage) onNavigatePage(destination, { resetScroll: true });
      else window.location.assign(destination);
    },
    [onNavigatePage],
  );
  const getCurrentTab = useCallback(() => activeTabRef.current, []);
  useSettingsTabShortcuts({
    tabIds,
    getCurrentTab,
    onNavigate: selectTab,
  });

  // A course card's "Analytics" link opens this page with ?course=<id>, which
  // used to be ignored. It is read once and becomes the selected course only
  // if it is one of the courses in the list below.
  const [requestedCourseId, setRequestedCourseId] = useState(
    () => searchParams.get("course") || null,
  );
  const myCourseRecords = myCourses.data?.courses;
  useEffect(() => {
    if (!requestedCourseId || !myCourseRecords) return;
    setRequestedCourseId(null);
    if (myCourseRecords.some((course) => course.id === requestedCourseId)) {
      setCourseId(requestedCourseId);
    }
  }, [requestedCourseId, myCourseRecords]);

  const changeCourse = useCallback((nextCourseId: string) => {
    setRequestedCourseId(null);
    setCourseId(nextCourseId);
  }, []);

  const filters: AnalyticsTabFilters = useMemo(
    () => ({
      ...dateRangeParams,
      courseId: courseId === "all" ? undefined : courseId,
      rangeKey: range,
    }),
    [dateRangeParams, courseId, range],
  );

  const courseOptions: ThemedSelectOption<string>[] = [
    [
      "all",
      isAdmin ? "All Courses" : "All my courses",
    ] as ThemedSelectOption<string>,
    ...(myCourses.data?.courses ?? []).map(
      (course) => [course.id, course.title] as ThemedSelectOption<string>,
    ),
  ];

  const [exportSections, setExportSections] = useState<
    AnalyticsExportSection[] | null
  >(null);
  const handleExportChange = useCallback(
    (sections: AnalyticsExportSection[] | null) => setExportSections(sections),
    [],
  );
  const exportCsv = () => {
    if (!exportSections) return;
    const day = (iso: string) => iso.slice(0, 10);
    downloadCsv(
      `analytics-${activeTab.id}-${day(filters.from)}-to-${day(filters.to)}.csv`,
      exportSections,
    );
  };

  const isFiltered = range !== ANALYTICS_DEFAULT_RANGE || courseId !== "all";
  const resetFilters = () => {
    setRequestedCourseId(null);
    setCourseId("all");
    updateParams({ range: null, course: null, from: null, to: null });
  };
  const changeRange = useCallback(
    (next: AnalyticsRangeKey) => {
      // Custom starts from the days the preset showed, ready to adjust.
      const start = next === "custom" ? presetAsCustom(range) : null;
      updateParams({
        range: next === ANALYTICS_DEFAULT_RANGE ? null : next,
        from: start?.from ?? null,
        to: start?.to ?? null,
      });
    },
    [range, updateParams],
  );
  const changeCustomRange = useCallback(
    (next: CustomDateRange) => {
      // Keep the two days in order when one is moved past the other.
      const [from, to] =
        next.from <= next.to ? [next.from, next.to] : [next.to, next.from];
      updateParams({ range: "custom", from, to });
    },
    [updateParams],
  );

  const TabComponent = activeTab.component;

  return (
    <AnalyticsPageChrome
      tabs={tabs}
      activeTab={activeTab}
      isAdmin={isAdmin}
      range={range}
      customRange={customRange}
      courseId={courseId}
      courseOptions={courseOptions}
      onSelectTab={selectTab}
      onRangeChange={changeRange}
      onCustomRangeChange={changeCustomRange}
      onCourseChange={changeCourse}
      onExport={exportCsv}
      exportDisabled={!exportSections}
      onReset={isFiltered ? resetFilters : undefined}
      navRef={tabListRef}
    >
      <SwipeableTabPanel
        tabs={tabIds}
        activeTab={activeTab.id}
        onTabChange={selectTab}
        tabListRef={tabListRef}
        id="analytics-tab-panel"
        className="settings-tab-content pb-8"
        stateAttribute="data-analytics-tab"
        labelledBy={`analytics-tab-${activeTab.id}`}
        nativeOnFinePointer
        focusable={false}
      >
        {(panelTab) =>
          panelTab === activeTab.id ? (
            <Suspense fallback={<AnalyticsTabLoading tab={activeTab} />}>
              <TabComponent
                key={activeTab.id}
                filters={filters}
                isAdmin={isAdmin}
                onExportChange={handleExportChange}
              />
            </Suspense>
          ) : null
        }
      </SwipeableTabPanel>
    </AnalyticsPageChrome>
  );
}

export function AnalyticsDashboardPage({
  role,
  isAdmin,
  tab,
  onNavigatePage,
}: Props) {
  // The sections a person sees follow their permissions; until those are
  // known the page keeps its loading frame rather than pick a section.
  const capabilities = useCapabilities({ enabled: !isAdmin });
  const tabs = useAnalyticsTabs(isAdmin);
  if (role !== "creator") {
    return null;
  }
  if (!isAdmin && !capabilities.data) {
    return <AnalyticsPageLoading isAdmin={isAdmin} tab={tab} />;
  }
  if (tabs.length === 0) {
    return (
      <p className="mx-auto mt-10 max-w-md text-center text-sm text-(--muted)">
        Your roles do not open any analytics section here.
      </p>
    );
  }
  return (
    <AnalyticsContent
      isAdmin={isAdmin}
      tab={tab}
      onNavigatePage={onNavigatePage}
    />
  );
}
