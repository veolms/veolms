import { HardDrivesIcon as HardDrives } from "@phosphor-icons/react/HardDrives";
import {
  formatStorageBytes,
  type StorageLearner,
  type StorageSummary,
} from "@veolms/contracts";
import { useState } from "react";

import { Button } from "../../components/Button";
import { ElevatedCard } from "../../components/ElevatedCard";
import { CenteredLoadingSpinner } from "../../components/LoadingSpinner";
import { useCapabilities } from "../../services/authorization";
import {
  useStorageLearners,
  useUpdateStorageSettings,
} from "../../services/storage";
import { StorageLimitDialog } from "./StorageLimitDialog";
import { StudentStorageFilters } from "./StudentStorageFilters";
import { StudentStoragePanel } from "./StudentStoragePanel";
import {
  StudentStoragePages,
  StudentStorageTable,
} from "./StudentStorageTable";
import {
  DEFAULT_STUDENT_STORAGE_VIEW,
  sortOrder,
  STUDENT_STORAGE_PAGE_SIZE,
  useDebounced,
  type StudentStorageView,
} from "./studentStorageView";

function Summary({
  summary,
  onShowRequests,
}: {
  summary: StorageSummary;
  onShowRequests: () => void;
}) {
  const items = [
    ["Students", summary.learners.toLocaleString()],
    ["Space used", formatStorageBytes(summary.totalUsedBytes)],
    ["Full", summary.full.toLocaleString()],
    ["Blocked", summary.blocked.toLocaleString()],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <ElevatedCard as="div" className="col-span-2 px-4 py-3 sm:col-span-1">
        <dt className="text-[11px] font-bold tracking-wider text-(--muted) uppercase">
          Requests
        </dt>
        <dd className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="font-mono text-xl font-bold text-(--text)">
            {summary.pendingRequests.toLocaleString()}
          </span>
          {summary.pendingRequests > 0 ? (
            <button
              type="button"
              onClick={onShowRequests}
              className="cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-(--accent-ink) hover:underline"
            >
              Show
            </button>
          ) : null}
        </dd>
      </ElevatedCard>
      {items.map(([label, value]) => (
        <ElevatedCard key={label} as="div" className="px-4 py-3">
          <dt className="text-[11px] font-bold tracking-wider text-(--muted) uppercase">
            {label}
          </dt>
          <dd className="mt-0.5 font-mono text-xl font-bold text-(--text)">
            {value}
          </dd>
        </ElevatedCard>
      ))}
    </dl>
  );
}

/**
 * Settings > Student storage: every student's space (what their chat,
 * discussion and support files take), who asked for more, and who is
 * blocked. Paged and sorted on the server (thousands of students). A
 * student's details and actions open in a drawer. For staff with
 * `storage.read`; changes need `storage.manage`.
 */
export function StudentStorageSettings({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const capabilities = useCapabilities({ enabled: isAuthenticated });
  const allowed = isAuthenticated && capabilities.can("storage.read");
  const canManage = capabilities.can("storage.manage");
  const [view, setView] = useState<StudentStorageView>(
    DEFAULT_STUDENT_STORAGE_VIEW,
  );
  const search = useDebounced(view.search.trim(), 300);
  const learners = useStorageLearners(
    {
      search: search || undefined,
      filter: view.filter,
      sort: view.sort,
      order: sortOrder(view.sort),
      page: view.page,
      pageSize: STUDENT_STORAGE_PAGE_SIZE,
    },
    { enabled: allowed },
  );
  const [opened, setOpened] = useState<StorageLearner | null>(null);
  const [editingDefault, setEditingDefault] = useState(false);
  const updateDefault = useUpdateStorageSettings();

  if (!capabilities.isFetched && isAuthenticated) {
    return <CenteredLoadingSpinner label="Loading student storage" />;
  }
  if (!allowed) {
    return (
      <ElevatedCard as="p" className="p-5 text-sm text-(--muted)">
        Student storage is managed by the academy&apos;s admins.
      </ElevatedCard>
    );
  }

  const data = learners.data;
  const rows = data?.learners ?? [];
  // The open student's row on this page (fresher), else as opened: an
  // action can move them off a filtered page (approved: no longer asking).
  const open: StorageLearner | null =
    rows.find((learner) => learner.userId === opened?.userId) ?? opened;
  const openIndex = open ? rows.findIndex((r) => r.userId === open.userId) : -1;
  const stepTo = (index: number) => {
    const next = rows[index];
    if (next) setOpened(next);
  };
  const defaultLimit = data?.summary.defaultLimitBytes ?? null;

  return (
    <div className="flex flex-col gap-5" aria-label="Student storage">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--accent)/12 text-(--accent)">
            <HardDrives size={22} weight="duotone" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-bold text-(--text)">Student storage</h2>
            <p className="text-sm text-(--muted)">
              Space each student&apos;s files take: what they send in chats,
              discussions and support.
              {defaultLimit !== null
                ? ` Everyone has ${formatStorageBytes(defaultLimit)} unless you give them more.`
                : ""}
            </p>
          </div>
        </div>
        {canManage && defaultLimit !== null ? (
          <Button
            variant="quiet"
            elevation="flat"
            className="h-10 rounded-[10px] px-4 text-sm font-semibold"
            onClick={() => setEditingDefault(true)}
          >
            Default: {formatStorageBytes(defaultLimit)}
          </Button>
        ) : null}
      </header>

      {data ? (
        <Summary
          summary={data.summary}
          onShowRequests={() =>
            setView({
              ...DEFAULT_STUDENT_STORAGE_VIEW,
              filter: "requested",
              sort: "requested",
            })
          }
        />
      ) : null}
      <StudentStorageFilters view={view} onChange={setView} />

      {learners.isPending ? (
        <CenteredLoadingSpinner label="Loading students" />
      ) : learners.isError ? (
        <p role="alert" className="text-sm text-rose-500">
          {learners.error.message}
        </p>
      ) : rows.length === 0 ? (
        <ElevatedCard as="p" className="p-6 text-center text-sm text-(--muted)">
          No students match the search and filters.
        </ElevatedCard>
      ) : (
        <>
          <div
            className={
              learners.isPlaceholderData ? "opacity-60 transition-opacity" : ""
            }
            aria-busy={learners.isPlaceholderData}
          >
            <StudentStorageTable learners={rows} onOpen={setOpened} />
          </div>
          <StudentStoragePages
            page={data?.page ?? view.page}
            pageSize={STUDENT_STORAGE_PAGE_SIZE}
            total={data?.total ?? 0}
            onPage={(page) => setView({ ...view, page })}
          />
        </>
      )}

      {open ? (
        <StudentStoragePanel
          learner={open}
          canManage={canManage}
          onClose={() => setOpened(null)}
          step={{
            hasPrev: openIndex > 0,
            hasNext: openIndex >= 0 && openIndex < rows.length - 1,
            onPrev: () => stepTo(openIndex - 1),
            onNext: () => stepTo(openIndex + 1),
          }}
        />
      ) : null}

      {defaultLimit !== null ? (
        <StorageLimitDialog
          open={editingDefault}
          title="Default storage limit"
          subtitle="Every student without a limit of their own gets this."
          currentLimitBytes={defaultLimit}
          confirmLabel="Save default"
          withNote={false}
          pending={updateDefault.isPending}
          error={updateDefault.error?.message}
          onClose={() => {
            updateDefault.reset();
            setEditingDefault(false);
          }}
          onConfirm={(limitBytes) =>
            updateDefault.mutate(limitBytes, {
              onSuccess: () => setEditingDefault(false),
            })
          }
        />
      ) : null}
    </div>
  );
}
