import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import type { StorageLearner } from "@veolms/contracts";
import type { KeyboardEvent } from "react";

import { ElevatedCard } from "../../components/ElevatedCard";
import { TimeAgo } from "../../components/TimeAgo";
import { StorageUsageBar } from "../../storage/StorageUsageBar";
import {
  StudentStorageAvatar,
  StudentStorageBadges,
  usageLabel,
} from "./studentStorageView";

// One grid for the header and the rows, from the container's width (the
// table stacks into cards when the settings panel is narrow).
const columns =
  "@3xl/storage:grid-cols-[minmax(200px,1.4fr)_minmax(200px,1.3fr)_minmax(150px,0.9fr)_minmax(110px,0.6fr)_44px]";
const cell = "min-w-0 @3xl/storage:px-4 @3xl/storage:py-3.5";

function StudentRow({
  learner,
  onOpen,
}: {
  learner: StorageLearner;
  onOpen: () => void;
}) {
  const open = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  const name = learner.name ?? learner.username ?? "Student";

  return (
    <div
      role="row"
      tabIndex={0}
      aria-label={`Open ${name}'s storage`}
      onClick={onOpen}
      onKeyDown={open}
      className={`group relative flex cursor-pointer flex-col gap-2.5 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] p-4 transition-colors last:border-b-0 hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent) @3xl/storage:grid @3xl/storage:items-center @3xl/storage:gap-0 @3xl/storage:p-0 ${columns}`}
    >
      <div
        role="cell"
        className={`${cell} flex items-center gap-3 pr-8 @3xl/storage:pl-5`}
      >
        <StudentStorageAvatar learner={learner} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-(--text) transition-colors group-hover:text-(--accent)">
            {name}
          </span>
          <span className="block truncate text-xs text-(--muted)">
            {learner.email ?? (learner.username ? `@${learner.username}` : "")}
          </span>
        </span>
      </div>

      <div role="cell" className={cell}>
        <span className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold text-(--text) tabular-nums">
            {usageLabel(learner)}
          </span>
          <span className="text-(--muted) tabular-nums">
            {learner.percentUsed}%
          </span>
        </span>
        <StorageUsageBar
          usedBytes={learner.usedBytes}
          limitBytes={learner.limitBytes}
          blocked={Boolean(learner.blocked)}
          label={`${name}: ${usageLabel(learner)} used`}
        />
      </div>

      <div role="cell" className={cell}>
        <StudentStorageBadges learner={learner} />
      </div>

      <div role="cell" className={`${cell} text-xs text-(--muted)`}>
        <span className="@3xl/storage:hidden">Last upload </span>
        {learner.lastUploadAt ? (
          <TimeAgo value={learner.lastUploadAt} />
        ) : (
          "Never"
        )}
      </div>

      <div
        role="cell"
        className="absolute top-4 right-3 text-(--muted) @3xl/storage:static @3xl/storage:pr-4"
        aria-hidden="true"
      >
        <CaretRight size={16} weight="bold" />
      </div>
    </div>
  );
}

/** One page of students: who they are, space used, what stands out. */
export function StudentStorageTable({
  learners,
  onOpen,
}: {
  learners: readonly StorageLearner[];
  onOpen: (learner: StorageLearner) => void;
}) {
  return (
    <ElevatedCard as="div" className="overflow-hidden">
      <div className="@container/storage">
        <div role="table" aria-label="Students' storage">
          <div
            role="row"
            className={`hidden border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold tracking-wider text-(--muted) uppercase select-none @3xl/storage:grid ${columns}`}
          >
            <div role="columnheader" className="px-5 py-3.5">
              Student
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Space used
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Status
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              Last upload
            </div>
            <div role="columnheader" className="px-4 py-3.5">
              <span className="sr-only">Open</span>
            </div>
          </div>
          {learners.map((learner) => (
            <StudentRow
              key={learner.userId}
              learner={learner}
              onOpen={() => onOpen(learner)}
            />
          ))}
        </div>
      </div>
    </ElevatedCard>
  );
}
