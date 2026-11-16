import { useState, type KeyboardEvent } from "react";
import type { WorkshopAdmin, WorkshopRegistrant } from "@veolms/contracts";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { XIcon as X } from "@phosphor-icons/react/X";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { getApiError } from "../lib/api-error";
import {
  useAddWorkshopRegistrant,
  useRemoveWorkshopRegistrant,
  useWorkshopRegistrants,
} from "../services/workshops";
import { WorkshopHostAvatar } from "./WorkshopHostAvatar";
import { WORKSHOP_REGISTRANTS_PAGE_SIZE } from "@veolms/contracts";
import { WorkshopCsvImport } from "./WorkshopCsvImport";
import {
  browserTimeZone,
  fieldClass,
  formatSessionDay,
  workshopRegistrantsCsvUrl,
} from "./workshopHelpers";

const SOURCE_LABEL: Record<WorkshopRegistrant["source"], string> = {
  free: "Free",
  order: "Paid",
  admin: "Added by staff",
  course: "Course learner",
};

/**
 * Who is registered, with a way to add someone by their account's email,
 * take a seat back, and download the list as a spreadsheet.
 */
export function WorkshopRegistrantsSection({
  workshop,
  canManage,
}: {
  workshop: WorkshopAdmin;
  canManage: boolean;
}) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const registrants = useWorkshopRegistrants(workshop.id, {
    page,
    search: query,
  });
  const total = registrants.data?.total ?? 0;
  const pageCount = Math.max(
    1,
    Math.ceil(total / WORKSHOP_REGISTRANTS_PAGE_SIZE),
  );
  const add = useAddWorkshopRegistrant();
  const remove = useRemoveWorkshopRegistrant();
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const timeZone = browserTimeZone();
  const items = registrants.data?.items ?? [];
  const sessionCount = workshop.sessions.length;

  // Not a <form>: the editor around this section is one already, and a
  // form inside a form is dropped by the browser.
  const submit = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setProblem(null);
    add.mutate(
      { workshopId: workshop.id, email: trimmed },
      {
        onSuccess: () => setEmail(""),
        onError: (error) =>
          setProblem(
            getApiError(error)?.message ?? "The registrant could not be added.",
          ),
      },
    );
  };

  const editable = canManage && workshop.status !== "cancelled";
  const empty = total === 0 && !query;

  return (
    <div className="grid gap-4">
      {workshop.courseId ? (
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-(--surface-strong) px-3.5 py-2.5 text-sm">
          <BookOpen size={16} className="shrink-0 text-(--accent)" />
          <span className="shrink-0 text-(--muted)">Course</span>
          <span className="truncate font-medium text-(--text)">
            {workshop.courseTitle ?? "Linked course"}
          </span>
        </div>
      ) : null}

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Add someone by email"
            aria-label="Email of the account to add"
            className={`${fieldClass} h-9 min-w-0 flex-1 basis-56 text-sm`}
            disabled={add.isPending}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type="button"
            onClick={submit}
            disabled={add.isPending || email.trim().length === 0}
            className="h-9"
          >
            <UserPlus size={16} weight="bold" />
            Add
          </Button>
          <WorkshopCsvImport workshopId={workshop.id} />
          {problem ? (
            <p className="basis-full text-sm text-rose-500" role="alert">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}

      {empty ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email"
            aria-label="Search attendance"
            className={`${fieldClass} h-9 min-w-0 flex-1 basis-56 text-sm sm:max-w-sm`}
          />
          <span className="text-[13px] text-(--muted) tabular-nums">
            {total} {total === 1 ? "person" : "people"}
          </span>
          {items.length > 0 ? (
            <a
              href={workshopRegistrantsCsvUrl(workshop.id)}
              download
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
            >
              <DownloadSimple size={15} />
              Download
            </a>
          ) : null}
        </div>
      )}

      {registrants.isLoading ? (
        <CenteredLoadingSpinner label="Loading registrants" className="py-8" />
      ) : items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold uppercase tracking-wider text-(--muted) select-none">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Learner
                </th>
                <th scope="col" className="px-4 py-3">
                  Added
                </th>
                <th scope="col" className="px-4 py-3">
                  How
                </th>
                <th scope="col" className="px-4 py-3">
                  Joined
                </th>
                {canManage ? (
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] text-sm text-(--text)">
              {items.map((registrant) => (
                <tr key={registrant.registrationId}>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <WorkshopHostAvatar
                        name={registrant.name}
                        avatarUrl={registrant.avatarUrl}
                        size={32}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {registrant.name}
                        </p>
                        <p className="truncate text-xs text-(--muted)">
                          {registrant.email ??
                            (registrant.username
                              ? `@${registrant.username}`
                              : "No email")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-(--muted)">
                    {formatSessionDay(registrant.registeredAt, timeZone)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="rounded-full bg-(--canvas) px-2.5 py-1 text-[11px] font-semibold text-(--muted)">
                      {SOURCE_LABEL[registrant.source]}
                      {registrant.declinedAt ? " · not going" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-(--muted)">
                    {sessionCount === 0
                      ? "—"
                      : `${registrant.joinedSessionIds.length} of ${sessionCount}`}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3 text-right">
                      {confirmRemove === registrant.userId ? (
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={remove.isPending}
                            onClick={() =>
                              remove.mutate(
                                {
                                  workshopId: workshop.id,
                                  userId: registrant.userId,
                                },
                                { onSettled: () => setConfirmRemove(null) },
                              )
                            }
                            className="cursor-pointer text-xs font-semibold text-rose-500 hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(null)}
                            className="cursor-pointer text-xs font-semibold text-(--muted) hover:text-(--text)"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(registrant.userId)}
                          aria-label={`Remove ${registrant.name}`}
                          title={
                            registrant.source === "order"
                              ? "Removing does not refund; refund the order from Orders."
                              : "Remove from the workshop"
                          }
                          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-rose-500"
                        >
                          <X size={14} weight="bold" />
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-[13px] text-(--muted)">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="quiet"
              elevation="flat"
              disabled={page <= 1 || registrants.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="quiet"
              elevation="flat"
              disabled={page >= pageCount || registrants.isFetching}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
