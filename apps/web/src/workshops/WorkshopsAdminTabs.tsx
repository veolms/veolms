import type {
  WorkshopAdminListResponse,
  WorkshopAdminTab,
} from "@veolms/contracts";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS,
  SearchShortcutHint,
} from "../searchShortcut";
import { inputClass } from "./workshopHelpers";

export const WORKSHOPS_SEARCH_INPUT_ID = "workshops-search-input";

const TAB_LABELS: Record<WorkshopAdminTab, string> = {
  upcoming: "Upcoming",
  past: "Past",
  drafts: "Drafts",
  cancelled: "Cancelled",
};

export function WorkshopsAdminTabs({
  activeTab,
  onTabChange,
  counts,
  searchQuery,
  onSearchChange,
}: {
  activeTab: WorkshopAdminTab;
  onTabChange: (tab: WorkshopAdminTab) => void;
  counts: WorkshopAdminListResponse["counts"] | undefined;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  const tabs = (Object.keys(TAB_LABELS) as WorkshopAdminTab[]).map((id) => ({
    id,
    label: TAB_LABELS[id],
    count: counts?.[id],
  }));

  return (
    <div className="flex flex-col gap-3 px-3 pb-3 mt-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:pb-5">
      <div
        className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-[10px] sm:rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-1 shadow-[inset_0_1px_2px_color-mix(in_srgb,black_10%,transparent)]"
        role="tablist"
        aria-label="Workshop status"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md sm:rounded-[8px] px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-compact-shadow)"
                  : "text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined ? (
                <span className="text-[0.68rem] opacity-70">{tab.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <label className="relative flex min-w-0 items-center sm:w-72">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-3 text-(--muted)"
        />
        <input
          id={WORKSHOPS_SEARCH_INPUT_ID}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search workshops"
          aria-label="Search workshops"
          aria-keyshortcuts={SEARCH_SHORTCUT_ARIA_KEYSHORTCUTS}
          data-search-shortcut-target=""
          className={`${inputClass} w-full pl-9! pr-16!`}
        />
        <span className="pointer-events-none absolute right-3 flex items-center gap-1.5">
          {searchQuery ? null : <SearchShortcutHint />}
        </span>
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2.5 flex size-6 items-center justify-center rounded-md text-(--muted) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) cursor-pointer"
          >
            <X size={14} weight="bold" />
          </button>
        ) : null}
      </label>
    </div>
  );
}
