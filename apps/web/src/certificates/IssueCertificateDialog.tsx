import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../components/Button";
import { useBackDismiss } from "../navigation/useBackDismiss";
import {
  useCertificateCandidates,
  useIssueCertificate,
} from "../services/certificates";
import { certificateInputClass } from "./certificateUi";

/** The most learners the search answers with at once. */
const SHOWN = 30;

/**
 * Issues a course's certificate to a learner by hand, whatever their
 * progress: search the course's learners, see how far each one is, issue.
 * The certificate carries the learner's profile name, and they are
 * notified and emailed as when they earn it.
 */
export function IssueCertificateDialog({
  courseId,
  open,
  onClose,
  onIssued,
}: {
  courseId: string;
  open: boolean;
  onClose: () => void;
  onIssued: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const candidates = useCertificateCandidates(courseId, search, {
    enabled: open,
  });
  const issue = useIssueCertificate(courseId);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  useBackDismiss({ open, onDismiss: onClose });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSearch("");
    setError(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;
  const items = candidates.data?.items ?? [];

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs [animation:deleteModalFadeIn_0.18s_ease-out] max-[480px]:items-end max-[480px]:p-0"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="relative flex max-h-[min(640px,calc(100dvh-2rem))] w-full max-w-[520px] flex-col rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[480px]:max-h-[88dvh] max-[480px]:rounded-b-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div className="min-w-0">
            <h3
              id={titleId}
              className="m-0 text-[1.1rem] font-bold tracking-tight text-(--text)"
            >
              Issue a certificate
            </h3>
            <p className="m-0 mt-1 text-[0.82rem] text-(--muted)">
              To any learner on this course, whatever their progress. It carries
              their profile name, and they are emailed the PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-3">
          <label className="relative block">
            <span className="sr-only">Search learners</span>
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--muted)"
              aria-hidden="true"
            />
            <input
              className={`${certificateInputClass} h-10 pl-9 text-sm`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Learner's name or email"
              type="search"
              autoFocus
            />
          </label>
          {error ? (
            <p className="m-0 mt-2 text-[0.82rem] text-rose-500" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {candidates.isPending ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((key) => (
                <span
                  key={key}
                  className="h-14 animate-pulse rounded-xl bg-(--surface-strong)"
                />
              ))}
            </div>
          ) : candidates.error ? (
            <p className="m-0 text-sm text-(--muted)">
              We couldn&apos;t load the learners.{" "}
              <button
                type="button"
                onClick={() => void candidates.refetch()}
                className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-(--accent) hover:underline"
              >
                Try again
              </button>
            </p>
          ) : items.length === 0 ? (
            <p className="m-0 rounded-xl bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4 py-6 text-center text-sm text-(--muted)">
              {search
                ? "No learner on this course matches."
                : "No learners on this course yet."}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-[color-mix(in_srgb,var(--text)_8%,transparent)] p-0">
              {items.map((item) => {
                const percent = Math.round(item.progressPercent);
                const busy = issuingId === item.userId;
                return (
                  <li
                    key={item.userId}
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[0.92rem] font-semibold text-(--text)">
                        {item.name}
                      </p>
                      <p className="m-0 truncate text-[0.78rem] text-(--muted)">
                        {item.email ?? "No email"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className="h-1.5 w-24 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                          aria-hidden="true"
                        >
                          <span
                            className="block h-full rounded-full bg-(--accent)"
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                        <span className="text-[0.74rem] font-semibold text-(--text-secondary)">
                          {percent}% done
                        </span>
                      </div>
                      {item.nameProblem && !item.hasCertificate ? (
                        <p className="m-0 mt-1 text-[0.76rem] text-rose-500">
                          {item.nameProblem}
                        </p>
                      ) : null}
                    </div>
                    {item.hasCertificate ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[0.74rem] font-semibold text-emerald-600">
                        <CheckCircle
                          size={14}
                          weight="fill"
                          aria-hidden="true"
                        />
                        Issued
                      </span>
                    ) : (
                      <Button
                        className="h-9 shrink-0 rounded-lg px-3.5 text-sm"
                        disabled={
                          Boolean(item.nameProblem) || issuingId !== null
                        }
                        aria-label={`Issue ${item.name}'s certificate`}
                        onClick={() => {
                          setError(null);
                          setIssuingId(item.userId);
                          issue.mutate(
                            { userId: item.userId },
                            {
                              onSuccess: (certificate) =>
                                onIssued(certificate.recipientName),
                              onError: (failure) => setError(failure.message),
                              onSettled: () => setIssuingId(null),
                            },
                          );
                        }}
                      >
                        {busy ? "Issuing…" : "Issue"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {items.length >= SHOWN ? (
            <p className="m-0 mt-3 text-center text-[0.78rem] text-(--muted)">
              Showing the first {SHOWN}. Search to find someone else.
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
