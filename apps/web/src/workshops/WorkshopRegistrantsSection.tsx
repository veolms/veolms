import { useState, type KeyboardEvent } from "react";
import type { WorkshopAdmin, WorkshopRegistrant } from "@veolms/contracts";
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
  const registrants = useWorkshopRegistrants(workshop.id);
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--muted)">
          {items.length === 0
            ? "Nobody is registered yet."
            : `${items.length} ${items.length === 1 ? "person" : "people"} registered.`}
        </p>
        {items.length > 0 ? (
          <a
            href={workshopRegistrantsCsvUrl(workshop.id)}
            download
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-(--surface-strong) px-3.5 text-[13px] font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
          >
            <DownloadSimple size={15} />
            Download CSV
          </a>
        ) : null}
      </div>

      {canManage && workshop.status !== "cancelled" ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="grid gap-1">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Add by email: learner@example.com"
              aria-label="Email of the account to register"
              className={`${fieldClass} w-full`}
              disabled={add.isPending}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <p className="text-xs text-(--muted)">
              They need an account here. Seats are not counted for people you
              add, and they get the usual confirmation and reminders.
            </p>
          </div>
          <Button
            type="button"
            onClick={submit}
            disabled={add.isPending || email.trim().length === 0}
            className="sm:h-11"
          >
            <UserPlus size={16} weight="bold" />
            Add
          </Button>
        </div>
      ) : null}
      {problem ? (
        <p className="text-sm text-rose-500" role="alert">
          {problem}
        </p>
      ) : null}

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
                  Registered
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
    </div>
  );
}
