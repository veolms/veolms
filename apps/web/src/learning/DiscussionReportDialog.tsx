import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ReportReason } from "@veolms/contracts";
import React, { useEffect, useRef, useState } from "react";
import { GENERIC_API_ERROR_MESSAGE } from "../lib/api-error";
import { useBackDismiss } from "../navigation/useBackDismiss";

export interface ReportTarget {
  targetType: "thread" | "reply";
  targetId: string;
  authorName?: string;
}

export interface ReportSubmissionPayload {
  targetType: "thread" | "reply";
  targetId: string;
  courseId?: string;
  reason: ReportReason;
  details?: string;
}

export interface DiscussionReportDialogProps {
  open: boolean;
  target: ReportTarget | null;
  courseId?: string;
  onClose: () => void;
  onSubmit: (payload: ReportSubmissionPayload) => Promise<boolean>;
  isSubmitting?: boolean;
}

export const REPORT_REASONS: Array<{
  value: ReportReason;
  label: string;
  description: string;
}> = [
  {
    value: "spam",
    label: "Spam",
    description: "Commercial advertising, promotional links, or repeated posts",
  },
  {
    value: "harassment",
    label: "Harassment",
    description: "Hate speech, bullying, threats, or personal attacks",
  },
  {
    value: "inappropriate",
    label: "Inappropriate Content",
    description: "Offensive, sexually explicit, or graphic material",
  },
  {
    value: "misinformation",
    label: "Misinformation",
    description: "Harmful false or misleading educational advice",
  },
  {
    value: "copyright",
    label: "Copyright Violation",
    description: "Unauthorized posting of copyrighted material",
  },
  {
    value: "other",
    label: "Other",
    description: "Something else that violates community guidelines",
  },
];

export const DUPLICATE_REPORT_MESSAGE =
  "You already have a pending report for this item. Our moderation team is reviewing it.";

export function isDuplicateReportError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "string") {
    return (
      err === "DUPLICATE_REPORT" ||
      err.includes("DUPLICATE_REPORT") ||
      err === DUPLICATE_REPORT_MESSAGE
    );
  }
  const anyErr = err as Record<string, any>;
  return (
    anyErr.code === "DUPLICATE_REPORT" ||
    anyErr.error?.code === "DUPLICATE_REPORT" ||
    anyErr.details?.error?.code === "DUPLICATE_REPORT" ||
    anyErr.response?.data?.error?.code === "DUPLICATE_REPORT" ||
    anyErr.response?.data?.code === "DUPLICATE_REPORT" ||
    anyErr.message === "DUPLICATE_REPORT" ||
    anyErr.message === DUPLICATE_REPORT_MESSAGE ||
    (typeof anyErr.message === "string" &&
      anyErr.message.includes("DUPLICATE_REPORT"))
  );
}

export function DiscussionReportDialog({
  open,
  target,
  courseId,
  onClose,
  onSubmit,
  isSubmitting = false,
}: DiscussionReportDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useBackDismiss({ open, onDismiss: onClose });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Reset dialog state when opening with a new target
  useEffect(() => {
    if (open) {
      setReason("");
      setDetails("");
      setErrorMessage("");
    }
  }, [open, target?.targetId]);

  if (!open || !target) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason || isSubmitting) return;

    setErrorMessage("");
    try {
      const success = await onSubmit({
        targetType: target.targetType,
        targetId: target.targetId,
        courseId: courseId || undefined,
        reason: reason as ReportReason,
        details: details.trim() || undefined,
      });

      if (!success) {
        setErrorMessage(GENERIC_API_ERROR_MESSAGE);
      }
    } catch (err: unknown) {
      if (isDuplicateReportError(err)) {
        setErrorMessage(DUPLICATE_REPORT_MESSAGE);
      } else {
        setErrorMessage(GENERIC_API_ERROR_MESSAGE);
      }
    }
  };

  const targetLabel = target.targetType === "reply" ? "reply" : "discussion";
  const title = `Report ${targetLabel}`;

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      aria-describedby="report-dialog-description"
      data-testid="discussion-report-dialog"
      className="fixed inset-0 z-150 m-auto w-[92vw] max-w-md rounded-2xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-(--surface) p-6 text-(--text) shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-xs"
      onCancel={(event) => {
        event.preventDefault();
        if (!isSubmitting) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Close report dialog"
          data-testid="report-dialog-close"
          disabled={isSubmitting}
          onClick={onClose}
          className="absolute -top-1 -right-1 inline-flex size-8 items-center justify-center rounded-lg text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-50"
        >
          <X size={18} weight="bold" />
        </button>

        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Flag size={20} weight="bold" aria-hidden="true" />
          </div>
          <div>
            <h2 id="report-dialog-title" className="text-base font-semibold text-(--text)">
              {title}
            </h2>
            <p id="report-dialog-description" className="text-xs text-(--text-secondary)">
              {target.authorName
                ? `Reporting ${targetLabel} by ${target.authorName}`
                : `Help us understand the issue with this ${targetLabel}`}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="report-reason-select"
              className="block text-xs font-semibold text-(--text)"
            >
              Reason for reporting <span className="text-rose-500">*</span>
            </label>
            <select
              id="report-reason-select"
              data-testid="report-reason-select"
              value={reason}
              disabled={isSubmitting}
              onChange={(e) => setReason(e.target.value as ReportReason)}
              className="mt-1.5 block w-full rounded-lg border border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-(--surface) px-3 py-2 text-sm text-(--text) transition-colors focus:border-(--accent) focus:outline-hidden disabled:opacity-60"
            >
              <option value="" disabled>
                Select a reason…
              </option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-details-input"
              className="block text-xs font-semibold text-(--text)"
            >
              Additional details (optional)
            </label>
            <textarea
              id="report-details-input"
              data-testid="report-details-input"
              value={details}
              disabled={isSubmitting}
              maxLength={1000}
              rows={3}
              placeholder="Provide any additional context that will help our moderators…"
              onChange={(e) => setDetails(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-(--surface) px-3 py-2 text-sm text-(--text) placeholder:text-(--muted) transition-colors focus:border-(--accent) focus:outline-hidden disabled:opacity-60"
            />
            <p className="mt-1 text-right text-[11px] text-(--muted)">
              {details.length}/1000
            </p>
          </div>

          {errorMessage && (
            <p
              role="alert"
              data-testid="report-dialog-error"
              className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-400"
            >
              {errorMessage}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              data-testid="report-cancel-button"
              disabled={isSubmitting}
              onClick={onClose}
              className="inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-xs font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="report-submit-button"
              disabled={!reason || isSubmitting}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
