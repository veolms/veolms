import {
  formatStorageBytes,
  type StorageLearner,
  type StorageLearnerFilter,
  type StorageLearnerSort,
} from "@veolms/contracts";
import { useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { storageTone } from "../../storage/StorageUsageBar";

export interface StudentStorageView {
  search: string;
  filter: StorageLearnerFilter;
  sort: StorageLearnerSort;
  page: number;
}

export const DEFAULT_STUDENT_STORAGE_VIEW: StudentStorageView = {
  search: "",
  filter: "all",
  sort: "used",
  page: 1,
};

export const STUDENT_STORAGE_PAGE_SIZE = 25;

export const filterOptions = [
  ["all", "All students"],
  ["requested", "Asked for more"],
  ["near_full", "Almost full"],
  ["full", "Full"],
  ["blocked", "Blocked"],
  ["custom", "Own limit"],
] as const;

export const sortOptions = [
  ["used", "Most space used"],
  ["percent", "Fullest first"],
  ["requested", "Requests first"],
  ["last_upload", "Recent uploads"],
  ["name", "Name (A-Z)"],
] as const;

/** Name sorts A to Z; every other sort shows the largest first. */
export const sortOrder = (sort: StorageLearnerSort) =>
  sort === "name" ? "asc" : "desc";

/** The value, once it has stopped changing for `ms` (the search box). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const badgeTone = {
  rose: "bg-rose-500/12 text-rose-500",
  amber: "bg-amber-500/14 text-amber-500",
  accent: "bg-(--accent)/12 text-(--accent-ink)",
  muted: "bg-(--surface-strong) text-(--text-secondary)",
} as const;

export function StorageBadge({
  tone,
  children,
}: {
  tone: keyof typeof badgeTone;
  children: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        badgeTone[tone],
      )}
    >
      {children}
    </span>
  );
}

/** What stands out about a student's space, as badges. */
export function StudentStorageBadges({ learner }: { learner: StorageLearner }) {
  const tone = storageTone(learner.usedBytes, learner.limitBytes);
  return (
    <span className="flex flex-wrap gap-1.5">
      {learner.pendingRequest ? (
        <StorageBadge tone="accent">Asked for more</StorageBadge>
      ) : null}
      {learner.blocked ? (
        <StorageBadge tone="rose">Blocked</StorageBadge>
      ) : null}
      {tone === "full" && !learner.blocked ? (
        <StorageBadge tone="rose">Full</StorageBadge>
      ) : null}
      {tone === "near" ? (
        <StorageBadge tone="amber">Almost full</StorageBadge>
      ) : null}
      {learner.customLimit ? (
        <StorageBadge tone="muted">Own limit</StorageBadge>
      ) : null}
    </span>
  );
}

export function usageLabel(learner: StorageLearner) {
  return `${formatStorageBytes(learner.usedBytes)} of ${formatStorageBytes(learner.limitBytes)}`;
}

export function initialsOf(learner: StorageLearner) {
  const name = (learner.name ?? learner.username ?? "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}

/** A student's picture, else their initials (as the Students list draws). */
export function StudentStorageAvatar({ learner }: { learner: StorageLearner }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [learner.avatarUrl]);
  if (learner.avatarUrl && !failed) {
    return (
      <img
        src={learner.avatarUrl}
        alt=""
        width={36}
        height={36}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-9 shrink-0 rounded-full border border-(--border) object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-(--border) bg-[color-mix(in_srgb,var(--accent)_15%,var(--surface))] text-xs font-bold text-(--accent)"
    >
      {initialsOf(learner)}
    </span>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatStorageDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}
