import { useEffect, useRef } from "react";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import type { NavigateTo } from "../routing/navigation";
import { NotificationCard } from "./NotificationCard";
import { NotificationFiltersBar } from "./NotificationFiltersBar";
import { NotificationSummaryWidget } from "./NotificationSummaryWidget";
import { RecentMentionsWidget } from "./RecentMentionsWidget";
import type { NotificationTabId } from "./notificationsData";
import { useNotificationsFilter } from "./useNotificationsFilter";

export interface NotificationsPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const tabsConfig: readonly {
  id: NotificationTabId;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
  { id: "course-activity", label: "Course activity" },
  { id: "announcements", label: "Announcements" },
];

export function NotificationsPage({
  onNavigatePage,
  setNotice,
}: NotificationsPageProps) {
  const {
    groupedNotifications,
    recentMentions,
    totalFilteredCount,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    tabCounts,
    markAllAsRead,
    markAsRead,
    archiveNotification,
    resetFilters,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
    refetch,
  } = useNotificationsFilter(setNotice);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keyboard shortcut listener (/ or Cmd+K to search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInput =
        activeTag === "input" ||
        activeTag === "textarea" ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      if (!isInput) {
        if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
          e.preventDefault();
          document.getElementById("notifications-search-input")?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="w-full min-w-0 flex flex-col font-sans"
      aria-labelledby="notifications-page-title"
    >
      {/* Top Header Row with Title, Badge, Subtitle, and Mark All as Read Button */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1
              id="notifications-page-title"
              className="text-[clamp(1.9rem,3.4vw,2.7rem)] font-[740] tracking-[-0.055em] leading-[1.02] text-(--text)"
            >
              Notifications
            </h1>
            <span className="rounded-full bg-[color-mix(in_srgb,var(--surface-strong)_85%,var(--canvas))] px-2.5 py-0.5 text-xs font-bold text-(--text-secondary) shadow-sm">
              {tabCounts.all}
            </span>
          </div>
          <p className="mt-2 text-[0.92rem] text-(--muted) leading-normal">
            Stay updated with course activity, replies, reminders, and
            announcements.
          </p>
        </div>

        {/* Mark All as Read Action Button */}
        <button
          type="button"
          onClick={markAllAsRead}
          className="inline-flex shrink-0 cursor-pointer self-start items-center gap-2 rounded-xl border border-(--border) bg-(--card-surface) px-4 py-2 text-xs font-semibold text-(--text) shadow-sm transition-all hover:bg-(--hover) hover:text-(--text) active:scale-[0.98] sm:self-auto md:text-sm"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <Check size={16} weight="bold" className="text-emerald-400" />
          <span>Mark all as read</span>
        </button>
      </header>

      {/* Tab Navigation Bar with delicate thin bottom line and live count badges */}
      <nav
        aria-label="Notification categories"
        className="mb-5 flex min-w-0 gap-1 overflow-x-auto border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-transparent md:gap-3"
        role="tablist"
      >
        {tabsConfig.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id];
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`relative inline-flex min-h-11.5 shrink-0 cursor-pointer select-none items-center gap-2 px-3.5 pb-2.5 pt-1 text-xs font-[650] transition-colors md:text-sm ${
                isActive
                  ? "text-(--text)"
                  : "text-(--muted) hover:text-(--text)"
              }`}
            >
              <span>{tab.label}</span>
              {count > 0 && tab.id !== "all" && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive
                      ? "bg-(--accent) text-(--on-accent,#ffffff)"
                      : "bg-(--surface-strong) text-(--muted)"
                  }`}
                >
                  {count}
                </span>
              )}
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-t-full bg-(--accent)"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Filter and Search Toolbar */}
      <section aria-label="Notification filters" className="mb-5">
        <NotificationFiltersBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />
      </section>

      {/* Responsive Layout: 1 column on <=150% zoom, 2 columns on >=1280px / 100% zoom */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
        {/* Left / Main Column: Grouped Notifications Feed */}
        <main className="flex flex-col gap-6 xl:col-span-8 min-w-0">
          {isLoading ? (
            <div
              className="rounded-[18px] bg-(--card-surface) p-8 text-center text-sm text-(--muted)"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              Loading notifications…
            </div>
          ) : isError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center rounded-[18px] bg-(--card-surface) p-8 sm:p-12 text-center"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 mb-3.5"
                aria-hidden="true"
              >
                <WarningCircle size={26} weight="duotone" />
              </div>
              <h3 className="text-base font-semibold text-(--text) tracking-tight">
                Unable to load notifications
              </h3>
              <p className="mt-1 max-w-sm text-xs md:text-sm text-(--muted) leading-relaxed">
                Notifications could not be loaded. Please check your connection and try again.
              </p>
              <button
                type="button"
                onClick={refetch}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-(--accent) px-4 py-2 text-xs sm:text-sm font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
              >
                <ArrowClockwise size={15} weight="bold" />
                <span>Try again</span>
              </button>
            </div>
          ) : totalFilteredCount > 0 ? (
            <>
              {/* Today Section */}
              {groupedNotifications.today.length > 0 && (
                <section aria-labelledby="heading-today">
                  <h2
                    id="heading-today"
                    className="text-xs font-bold uppercase tracking-wider text-(--muted) mb-2.5 px-0.5"
                  >
                    Today
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {groupedNotifications.today.map((item) => (
                      <NotificationCard
                        key={item.id}
                        notification={item}
                        onMarkRead={markAsRead}
                        onArchive={archiveNotification}
                        onOpen={onNavigatePage}
                        setNotice={setNotice}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Yesterday Section */}
              {groupedNotifications.yesterday.length > 0 && (
                <section aria-labelledby="heading-yesterday">
                  <h2
                    id="heading-yesterday"
                    className="text-xs font-bold uppercase tracking-wider text-(--muted) mb-2.5 px-0.5"
                  >
                    Yesterday
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {groupedNotifications.yesterday.map((item) => (
                      <NotificationCard
                        key={item.id}
                        notification={item}
                        onMarkRead={markAsRead}
                        onArchive={archiveNotification}
                        onOpen={onNavigatePage}
                        setNotice={setNotice}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Earlier Section */}
              {groupedNotifications.earlier.length > 0 && (
                <section aria-labelledby="heading-earlier">
                  <h2
                    id="heading-earlier"
                    className="text-xs font-bold uppercase tracking-wider text-(--muted) mb-2.5 px-0.5"
                  >
                    Earlier
                  </h2>
                  <div className="flex flex-col gap-2.5">
                    {groupedNotifications.earlier.map((item) => (
                      <NotificationCard
                        key={item.id}
                        notification={item}
                        onMarkRead={markAsRead}
                        onArchive={archiveNotification}
                        onOpen={onNavigatePage}
                        setNotice={setNotice}
                      />
                    ))}
                  </div>
                </section>
              )}
              {hasNextPage && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isFetchingNextPage}
                  className="self-center rounded-xl border border-(--border) bg-(--card-surface) px-4 py-2 text-sm font-semibold text-(--text) disabled:cursor-wait disabled:opacity-60"
                >
                  {isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-[18px] bg-(--card-surface) p-12 text-center"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--hover) text-(--muted) mb-3">
                <Bell size={24} />
              </div>
              <h3 className="text-base font-semibold text-(--text)">
                No notifications found
              </h3>
              <p className="mt-1 max-w-sm text-xs md:text-sm text-(--muted)">
                {searchQuery ||
                categoryFilter !== "all" ||
                statusFilter !== "all"
                  ? "Try changing your search query or reset your active filters to view all notifications."
                  : "You're all caught up! No notifications to display."}
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm hover:opacity-90 cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          )}
        </main>

        {/* Right Column / Subgrid: Sidebar Widgets */}
        <aside className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-5 xl:col-span-4 min-w-0">
          {/* Summary Widget */}
          <NotificationSummaryWidget
            counts={tabCounts}
            onSelectCategory={(cat) => setActiveTab(cat)}
          />

          {/* Recent Mentions Widget */}
          <RecentMentionsWidget
            mentions={recentMentions}
            onViewAll={() => setActiveTab("mentions")}
            onSelectMention={(m) => {
              setActiveTab("mentions");
              if (m.actionUrl) onNavigatePage?.(m.actionUrl);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
