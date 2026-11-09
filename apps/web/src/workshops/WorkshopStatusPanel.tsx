import { useState } from "react";
import type { WorkshopAdmin, WorkshopPublishCheck } from "@veolms/contracts";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { Button } from "../components/Button";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";
import {
  browserTimeZone,
  fieldClass,
  formatSessionDay,
  formatSessionTime,
  formatWorkshopPrice,
  surfaceClass,
  workshopStatusClass,
  workshopStatusLabel,
  type WorkshopDisplayStatus,
} from "./workshopHelpers";

export interface WorkshopStatusPanelProps {
  /** Null while creating: nothing exists yet to publish or cancel. */
  workshop: WorkshopAdmin | null;
  publishCheck: WorkshopPublishCheck | undefined;
  preview: {
    title: string;
    summary: string;
    coverUrl: string | null;
    firstSessionAt: string | null;
    firstSessionZone: string;
    priceMinor: number | null;
    currency: string;
  };
  isDirty: boolean;
  isBusy: boolean;
  canManage: boolean;
  onSave: () => void;
  /** `announce`: tell every learner (open workshops only). */
  onPublish: (announce: boolean) => void;
  onUnpublish: () => void;
  onCancel: (reason: string, refundPaid: boolean) => void;
  onDelete: () => void;
}

function displayStatus(workshop: WorkshopAdmin | null): WorkshopDisplayStatus {
  if (!workshop) return "draft";
  if (workshop.status === "cancelled") return "cancelled";
  if (workshop.status === "draft") return "draft";
  const now = Date.now();
  const sessions = workshop.sessions;
  if (sessions.some((session) => session.state === "live")) return "live";
  if (
    sessions.length > 0 &&
    sessions.every((session) => session.state === "ended")
  ) {
    return "past";
  }
  return sessions.length === 0 ? "upcoming" : now ? "upcoming" : "upcoming";
}

function statusCopy(
  status: WorkshopDisplayStatus,
  workshop: WorkshopAdmin | null,
) {
  switch (status) {
    case "draft":
      return workshop
        ? "Only the team can see this draft. Publish it when the sessions and meeting links are set."
        : "Save the draft first. You can publish once the sessions and meeting links are set.";
    case "upcoming":
      return "Learners can see this workshop and register.";
    case "live":
      return "A session is live right now. Registrants can join from the workshop page.";
    case "past":
      return "Every session has ended. Attach the recording so registrants can watch it.";
    case "cancelled":
      return workshop?.cancelReason
        ? `Cancelled: ${workshop.cancelReason}`
        : "Cancelled.";
  }
}

export function WorkshopStatusPanel({
  workshop,
  publishCheck,
  preview,
  isDirty,
  isBusy,
  canManage,
  onSave,
  onPublish,
  onUnpublish,
  onCancel,
  onDelete,
}: WorkshopStatusPanelProps) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundPaid, setRefundPaid] = useState(true);
  const isPaid = (workshop?.priceMinor ?? 0) > 0;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const status = displayStatus(workshop);
  const isDraft = !workshop || workshop.status === "draft";
  const issues = publishCheck?.issues ?? [];
  const ready = Boolean(workshop) && isDraft && !isDirty && issues.length === 0;
  const zone = preview.firstSessionZone || browserTimeZone();

  return (
    <aside className="grid gap-4 lg:sticky lg:top-4">
      <section
        className={`${surfaceClass} p-5`}
        aria-labelledby="workshop-status-heading"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="workshop-status-heading"
            className="text-sm font-bold text-(--text)"
          >
            Status
          </h2>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${workshopStatusClass(status)}`}
          >
            {workshopStatusLabel(status)}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-(--muted)">
          {statusCopy(status, workshop)}
        </p>
        {workshop && workshop.registrationCount > 0 ? (
          <p className="mt-2 text-[13px] text-(--text)">
            {workshop.registrationCount === 1
              ? "1 learner registered"
              : `${workshop.registrationCount} learners registered`}
          </p>
        ) : null}

        {workshop && isDraft ? (
          <ul className="mt-4 grid gap-2" aria-label="Ready to publish?">
            {isDirty ? (
              <li className="flex items-start gap-2 text-[13px] text-(--muted)">
                <WarningCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-amber-500"
                />
                Save your changes before publishing.
              </li>
            ) : null}
            {issues.map((issue) => (
              <li
                key={`${issue.field}-${issue.message}`}
                className="flex items-start gap-2 text-[13px] text-(--muted)"
              >
                <WarningCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-amber-500"
                />
                {issue.message}
              </li>
            ))}
            {!isDirty && publishCheck && issues.length === 0 ? (
              <li className="flex items-start gap-2 text-[13px] text-emerald-600">
                <CheckCircle
                  size={16}
                  weight="fill"
                  className="mt-0.5 shrink-0"
                />
                Everything is set. Publishing shows it to learners.
              </li>
            ) : null}
          </ul>
        ) : null}

        {canManage ? (
          <div className="mt-4 grid gap-2">
            {isDirty || !workshop ? (
              <Button onClick={onSave} disabled={isBusy} className="w-full">
                {workshop ? "Save changes" : "Save draft"}
              </Button>
            ) : null}
            {workshop && isDraft ? (
              <>
                {workshop.courseId ? (
                  <p className="text-[12px] leading-5 text-(--muted)">
                    Learners of {workshop.courseTitle ?? "its course"} are told
                    when you publish; they do not need to register.
                  </p>
                ) : !workshop.publishedAt ? (
                  <label className="flex cursor-pointer items-start gap-2 text-[13px] text-(--text)">
                    <input
                      type="checkbox"
                      checked={announce}
                      onChange={(event) => setAnnounce(event.target.checked)}
                      className="mt-0.5 size-4 accent-(--accent)"
                    />
                    <span>Announce to every learner by email</span>
                  </label>
                ) : null}
                <Button
                  onClick={() => onPublish(announce)}
                  disabled={isBusy || !ready}
                  variant={isDirty ? "quiet" : "primary"}
                  elevation={isDirty ? "flat" : "raised"}
                  className="w-full"
                >
                  Publish
                </Button>
              </>
            ) : null}
            {workshop?.status === "published" ? (
              <Button
                onClick={onUnpublish}
                disabled={isBusy}
                variant="quiet"
                elevation="flat"
                className="w-full"
              >
                Unpublish
              </Button>
            ) : null}
            {workshop && workshop.status !== "cancelled" ? (
              cancelOpen ? (
                <div className="grid gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                  <label
                    htmlFor="workshop-cancel-reason"
                    className="text-[13px] font-medium text-(--text)"
                  >
                    Why is it cancelled? Registrants are told.
                  </label>
                  <textarea
                    id="workshop-cancel-reason"
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="The host is unwell; we will announce a new date."
                    className={`${fieldClass} h-auto w-full py-2`}
                  />
                  {isPaid ? (
                    <label className="flex cursor-pointer items-start gap-2 text-[13px] text-(--text)">
                      <input
                        type="checkbox"
                        checked={refundPaid}
                        onChange={(event) =>
                          setRefundPaid(event.target.checked)
                        }
                        className="mt-0.5 size-4 accent-(--accent)"
                      />
                      <span>
                        Refund every paid registration now (the usual refund
                        flow, one order at a time).
                      </span>
                    </label>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      disabled={isBusy || cancelReason.trim().length < 3}
                      onClick={() => {
                        onCancel(cancelReason.trim(), isPaid && refundPaid);
                        setCancelOpen(false);
                      }}
                    >
                      Cancel workshop
                    </Button>
                    <Button
                      variant="quiet"
                      elevation="flat"
                      disabled={isBusy}
                      onClick={() => setCancelOpen(false)}
                    >
                      Keep it
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => setCancelOpen(true)}
                  disabled={isBusy}
                  variant="danger"
                  elevation="flat"
                  className="w-full"
                >
                  Cancel workshop…
                </Button>
              )
            ) : null}
            {workshop && workshop.status !== "published" ? (
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                disabled={isBusy}
                className="mt-1 text-[13px] font-medium text-(--muted) hover:text-rose-500 cursor-pointer disabled:opacity-50"
              >
                Delete this workshop
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={`${surfaceClass}`} aria-label="How learners see it">
        <div className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-5 py-3">
          <h2 className="text-sm font-bold text-(--text)">Card preview</h2>
          <p className="mt-0.5 text-xs text-(--muted)">
            What learners see on the Workshops page.
          </p>
        </div>
        <div className="p-4">
          <div className="overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface)">
            {preview.coverUrl ? (
              <img
                src={preview.coverUrl}
                alt=""
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="grid aspect-video w-full place-items-center bg-(--accent)/10 text-(--accent)">
                <VideoConference size={32} weight="duotone" />
              </div>
            )}
            <div className="grid gap-1.5 p-4">
              <h3 className="text-[15px] font-semibold leading-snug text-(--text)">
                {preview.title.trim() || "Workshop title"}
              </h3>
              <p className="line-clamp-2 text-[13px] leading-5 text-(--muted)">
                {preview.summary.trim() || "A one-line summary appears here."}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-(--text-secondary,var(--muted))">
                <CalendarBlank size={14} />
                {preview.firstSessionAt
                  ? `${formatSessionDay(preview.firstSessionAt, zone)} · ${formatSessionTime(preview.firstSessionAt, zone)}`
                  : "Date to be set"}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-(--text)">
                  {formatWorkshopPrice(preview.priceMinor, preview.currency)}
                </span>
                <span className="rounded-lg bg-(--accent) px-3 py-1.5 text-xs font-semibold text-(--on-accent)">
                  Register
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDeleteModal
        isOpen={deleteOpen}
        title="Delete this workshop?"
        message="The draft and its sessions are removed. Registrations, if any, are kept in the database but no longer shown."
        confirmLabel="Delete workshop"
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete();
        }}
      />
    </aside>
  );
}
