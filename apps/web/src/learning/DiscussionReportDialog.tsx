import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
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
      className="fixed inset-0 z-150 m-auto w-[min(92vw,32rem)] rounded-3xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--surface)_96%,var(--canvas))] p-5 text-(--text) shadow-[0_24px_80px_color-mix(in_srgb,black_42%,transparent),0_0_0_1px_color-mix(in_srgb,var(--text)_5%,transparent)] backdrop:bg-black/65 backdrop:backdrop-blur-sm sm:p-6"
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

        <div className="min-w-0 pr-8 pt-0.5">
          <h2 id="report-dialog-title" className="text-lg font-semibold tracking-[-0.01em] text-(--text)">
            {title}
          </h2>
          <p id="report-dialog-description" className="mt-0.5 text-sm leading-5 text-(--text-secondary)">
            {target.authorName
              ? `Reporting ${targetLabel} by ${target.authorName}`
              : `Help us understand the issue with this ${targetLabel}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="report-reason-select"
              className="block text-sm font-semibold text-(--text)"
            >
              Reason for reporting <span className="text-rose-500">*</span>
            </label>
            <div className="relative mt-2">
              <select
                id="report-reason-select"
                data-testid="report-reason-select"
                value={reason}
                disabled={isSubmitting}
                onChange={(e) => setReason(e.target.value as ReportReason)}
                className="block h-11 w-full appearance-none rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5 pr-10 text-sm text-(--text) shadow-[inset_0_1px_2px_color-mix(in_srgb,black_8%,transparent)] transition-colors focus:border-(--accent) focus:outline-hidden focus:ring-2 focus:ring-(--accent)/20 disabled:opacity-60"
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
              <CaretDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-(--muted)"
                size={16}
                weight="bold"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="report-details-input"
              className="block text-sm font-semibold text-(--text)"
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
              className="mt-2 block w-full resize-y rounded-xl border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_58%,var(--surface))] px-3.5 py-3 text-sm leading-5 text-(--text) placeholder:text-(--muted) shadow-[inset_0_1px_2px_color-mix(in_srgb,black_8%,transparent)] transition-colors focus:border-(--accent) focus:outline-hidden focus:ring-2 focus:ring-(--accent)/20 disabled:opacity-60"
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

          <div className="flex items-center justify-end gap-2.5 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] pt-4">
            <button
              type="button"
              data-testid="report-cancel-button"
              disabled={isSubmitting}
              onClick={onClose}
              className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="report-submit-button"
              disabled={!reason || isSubmitting}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white shadow-[0_6px_16px_color-mix(in_srgb,theme(colors.rose.600)_28%,transparent)] transition-all hover:bg-rose-700 hover:shadow-[0_8px_20px_color-mix(in_srgb,theme(colors.rose.600)_34%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
