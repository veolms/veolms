import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import type { StaffCertificate } from "@veolms/contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "../components/Button";
import { InfiniteListEnd } from "../components/InfiniteListEnd";
import {
  useCourseCertificates,
  useRestoreCertificate,
  useRevokeCertificate,
} from "../services/certificates";
import { IssueCertificateDialog } from "./IssueCertificateDialog";
import { RevokeCertificateDialog } from "./RevokeCertificateDialog";
import {
  certificateInputClass,
  certificatePath,
  downloadCertificatePdf,
  formatCertificateDate,
} from "./certificateUi";

const iconButtonClass =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:cursor-default disabled:opacity-50";

/**
 * The course editor's list of the certificates issued for the course,
 * newest first, loaded as it scrolls: search, open, download, and revoke
 * or restore, and issue one by hand to any learner on the course. Hidden
 * from staff who may not see them.
 */
export function CourseCertificatesSection({ courseId }: { courseId: string }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const list = useCourseCertificates(courseId, search);
  const revoke = useRevokeCertificate();
  const restore = useRestoreCertificate();
  const [revoking, setRevoking] = useState<StaffCertificate | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issuedNote, setIssuedNote] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (list.error?.status === 403) return null;

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const issuedCount = list.data?.pages[0]?.issuedCount ?? 0;

  return (
    <section
      className="flex flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)"
      aria-labelledby="course-certificates-title"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            id="course-certificates-title"
            className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)"
          >
            Issued certificates
          </h3>
          <p className="m-0 text-[0.83rem] text-(--muted)">
            {issuedCount === 1
              ? "1 learner holds this course's certificate."
              : `${issuedCount} learners hold this course's certificate.`}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <span className="sr-only">Search certificates</span>
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--muted)"
              aria-hidden="true"
            />
            <input
              className={`${certificateInputClass} h-10 pl-9 text-sm`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email or certificate ID"
              type="search"
            />
          </label>
          <Button
            className="h-10 shrink-0 rounded-lg px-3.5 text-sm"
            onClick={() => {
              setIssuedNote(null);
              setIssuing(true);
            }}
          >
            <Plus size={15} weight="bold" aria-hidden="true" />
            Issue certificate
          </Button>
        </div>
      </div>

      {issuedNote ? (
        <p className="m-0 mb-3 text-[0.82rem] text-emerald-600" role="status">
          {issuedNote}
        </p>
      ) : null}

      {rowError ? (
        <p className="m-0 mb-3 text-[0.82rem] text-rose-500" role="alert">
          {rowError}
        </p>
      ) : null}

      {list.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((key) => (
            <span
              key={key}
              className="h-12 animate-pulse rounded-xl bg-(--surface-strong)"
            />
          ))}
        </div>
      ) : list.error ? (
        <p className="m-0 text-sm text-(--muted)">
          We couldn&apos;t load the certificates.{" "}
          <button
            type="button"
            onClick={() => void list.refetch()}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-(--accent) hover:underline"
          >
            Try again
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="m-0 rounded-xl bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-6 text-center text-sm text-(--muted)">
          {search
            ? "No certificate matches."
            : "No certificates yet. Learners get theirs once they finish the course's share, or issue one by hand."}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-[color-mix(in_srgb,var(--text)_8%,transparent)] p-0">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[0.92rem] font-semibold text-(--text)">
                  {item.recipientName}
                  {item.learner && item.learner.name !== item.recipientName ? (
                    <span className="font-normal text-(--muted)">
                      {" "}
                      · {item.learner.name}
                    </span>
                  ) : null}
                </p>
                <p className="m-0 truncate text-[0.78rem] text-(--muted)">
                  {item.learner?.email ?? "Account deleted"} ·{" "}
                  {formatCertificateDate(item.issuedOn)} ·{" "}
                  <Link
                    to={certificatePath(item.code)}
                    className="font-mono text-(--text-secondary) hover:underline"
                  >
                    {item.displayCode}
                  </Link>
                </p>
              </div>
              {item.status === "revoked" ? (
                <span
                  className="rounded-full bg-rose-500/12 px-2.5 py-0.5 text-[0.72rem] font-semibold text-rose-500"
                  title={item.revokeReason ?? undefined}
                >
                  Revoked
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={iconButtonClass}
                  aria-label={`Download ${item.recipientName}'s certificate`}
                  title="Download PDF"
                  onClick={() => {
                    setRowError(null);
                    void downloadCertificatePdf({
                      code: item.code,
                      courseTitle: "certificate",
                      recipientName: item.recipientName,
                    }).catch((error: unknown) =>
                      setRowError(
                        error instanceof Error
                          ? error.message
                          : "The download failed.",
                      ),
                    );
                  }}
                >
                  <DownloadSimple size={17} />
                </button>
                {item.status === "active" ? (
                  <button
                    type="button"
                    className={`${iconButtonClass} hover:text-rose-500`}
                    aria-label={`Revoke ${item.recipientName}'s certificate`}
                    title="Revoke"
                    onClick={() => {
                      revoke.reset();
                      setRevoking(item);
                    }}
                  >
                    <Prohibit size={17} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={iconButtonClass}
                    aria-label={`Restore ${item.recipientName}'s certificate`}
                    title="Restore"
                    disabled={restore.isPending}
                    onClick={() => {
                      setRowError(null);
                      restore.mutate(
                        { certificateId: item.id },
                        {
                          onError: (error) => setRowError(error.message),
                        },
                      );
                    }}
                  >
                    <ArrowCounterClockwise size={17} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <InfiniteListEnd
        hasNextPage={Boolean(list.hasNextPage)}
        isFetchingNextPage={list.isFetchingNextPage}
        fetchNextPage={() => void list.fetchNextPage()}
        label="certificates"
      />

      <IssueCertificateDialog
        courseId={courseId}
        open={issuing}
        onClose={() => setIssuing(false)}
        onIssued={(name) =>
          setIssuedNote(
            `Issued ${name}'s certificate. They are emailed the PDF.`,
          )
        }
      />

      <RevokeCertificateDialog
        certificate={revoking}
        pending={revoke.isPending}
        error={revoke.error?.message ?? null}
        onCancel={() => setRevoking(null)}
        onRevoke={(reason) => {
          if (!revoking) return;
          // The list shows it revoked at once; put back with a note if the
          // server refuses.
          setRevoking(null);
          setRowError(null);
          revoke.mutate(
            { certificateId: revoking.id, reason },
            { onError: (error) => setRowError(error.message) },
          );
        }}
      />
    </section>
  );
}
