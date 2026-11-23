import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import {
  formatStorageBytes,
  type StorageEvent,
  type StorageLearner,
  type StorageLearnerDetailResponse,
} from "@veolms/contracts";
import { useState, type ReactNode } from "react";

import { Button } from "../../components/Button";
import { CenteredLoadingSpinner } from "../../components/LoadingSpinner";
import {
  SlideOverPanel,
  SlideOverStepButtons,
} from "../../components/SlideOverPanel";
import { TimeAgo } from "../../components/TimeAgo";
import {
  useStorageAdminAction,
  useStorageLearner,
  type StorageAdminAction,
} from "../../services/storage";
import { StorageUsageBar } from "../../storage/StorageUsageBar";
import { StorageLimitDialog } from "./StorageLimitDialog";
import { StorageNoteDialog } from "./StorageNoteDialog";
import {
  formatStorageDate,
  StudentStorageBadges,
  usageLabel,
} from "./studentStorageView";

const sectionLabel =
  "mb-2 text-[11px] font-bold tracking-wider text-(--muted) uppercase";
const actionClass =
  "h-9 gap-1.5 rounded-[10px] px-3 text-[0.8rem] font-semibold";

type Dialog = "approve" | "decline" | "limit" | "block" | null;

const eventText: Record<StorageEvent["action"], string> = {
  request: "Asked for more space",
  cancel_request: "Withdrew the request",
  approve_request: "Approved the request",
  decline_request: "Turned the request down",
  set_limit: "Set the limit",
  reset_limit: "Set the limit back to the default",
  block: "Blocked uploads",
  unblock: "Unblocked uploads",
  recount: "Recounted the space used",
  set_default_limit: "Changed the default limit",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={sectionLabel}>{title}</h3>
      {children}
    </section>
  );
}

function History({ events }: { events: readonly StorageEvent[] }) {
  if (events.length === 0) {
    return <p className="m-0 text-sm text-(--muted)">No changes yet.</p>;
  }
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {events.map((event) => (
        <li key={event.id} className="text-[0.8rem] leading-snug">
          <span className="font-semibold text-(--text)">
            {eventText[event.action]}
          </span>
          {event.toLimitBytes !== null ? (
            <span className="text-(--text-secondary)">
              {" "}
              {event.fromLimitBytes !== null
                ? `${formatStorageBytes(event.fromLimitBytes)} → `
                : "to "}
              {formatStorageBytes(event.toLimitBytes)}
            </span>
          ) : null}
          <span className="block text-xs text-(--muted)">
            {event.actor?.name ?? "Someone"} ·{" "}
            <TimeAgo value={event.createdAt} />
          </span>
          {event.note ? (
            <span className="mt-0.5 block text-xs text-(--text-secondary)">
              “{event.note}”
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Breakdown({ detail }: { detail: StorageLearnerDetailResponse }) {
  const rows = [
    ["Chats", detail.breakdown.chatBytes],
    ["Discussions and notes", detail.breakdown.discussionBytes],
    ["Support", detail.breakdown.supportBytes],
  ] as const;
  return (
    <dl className="m-0 mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-[0.8rem]">
      {rows.map(([label, bytes]) => (
        <div key={label} className="contents">
          <dt className="text-(--muted)">{label}</dt>
          <dd className="m-0 text-right font-semibold text-(--text) tabular-nums">
            {formatStorageBytes(bytes)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One student's space in the drawer: what their files take, their open
 * request (approve with a new limit, or turn down), their limit, the block,
 * and every change made, by whom. Actions need `storage.manage`.
 */
export function StudentStoragePanel({
  learner,
  canManage,
  onClose,
  step,
}: {
  learner: StorageLearner;
  canManage: boolean;
  onClose: () => void;
  step: {
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
}) {
  const detail = useStorageLearner(learner.userId);
  const action = useStorageAdminAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  // The freshest copy: the detail (after an action) else the list's row.
  const current = detail.data?.learner ?? learner;
  const request = current.pendingRequest;
  const name = current.name ?? current.username ?? "Student";

  const run = (next: StorageAdminAction) =>
    action.mutate(next, { onSuccess: () => setDialog(null) });
  const close = () => {
    action.reset();
    setDialog(null);
  };

  return (
    <SlideOverPanel
      label={`${name}'s storage`}
      title={name}
      onClose={onClose}
      headerActions={<SlideOverStepButtons {...step} noun="student" />}
      headerContent={
        <div className="mt-2 grid gap-2">
          <span className="truncate text-sm text-(--muted)">
            {current.email ?? (current.username ? `@${current.username}` : "")}
          </span>
          <StudentStorageBadges learner={current} />
        </div>
      }
    >
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5 sm:p-6">
        <Section title="Space used">
          <p className="m-0 mb-2 text-sm text-(--text)">
            <span className="font-bold tabular-nums">
              {formatStorageBytes(current.usedBytes)}
            </span>{" "}
            <span className="text-(--muted)">
              of {formatStorageBytes(current.limitBytes)} ({current.percentUsed}
              %)
              {current.customLimit ? ", own limit" : ", the default"}
            </span>
          </p>
          <StorageUsageBar
            usedBytes={current.usedBytes}
            limitBytes={current.limitBytes}
            blocked={Boolean(current.blocked)}
            label={`${usageLabel(current)} used`}
          />
          {detail.data ? <Breakdown detail={detail.data} /> : null}
          <p className="m-0 mt-2 text-xs text-(--muted)">
            Last upload {formatStorageDate(current.lastUploadAt)}
          </p>
        </Section>

        {request ? (
          <Section title="Asked for more space">
            <div className="rounded-xl border border-(--accent)/30 bg-(--accent)/8 p-3.5">
              <p className="m-0 text-[0.8rem] text-(--text-secondary)">
                <TimeAgo value={request.createdAt} />, with{" "}
                {formatStorageBytes(request.usedBytes)} of{" "}
                {formatStorageBytes(request.limitBytes)} used.
              </p>
              {request.note ? (
                <p className="m-0 mt-1.5 text-sm text-(--text)">
                  “{request.note}”
                </p>
              ) : null}
              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    elevation="flat"
                    className={actionClass}
                    onClick={() => setDialog("approve")}
                  >
                    Approve…
                  </Button>
                  <Button
                    variant="quiet"
                    className={actionClass}
                    onClick={() => setDialog("decline")}
                  >
                    Decline…
                  </Button>
                  {current.blocked ? null : (
                    // Answering a request can also mean stopping the uploads
                    // (abuse): blocking turns the request down too.
                    <Button
                      variant="danger"
                      className={actionClass}
                      onClick={() => setDialog("block")}
                    >
                      <Prohibit size={15} weight="bold" aria-hidden />
                      Block…
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {current.blocked ? (
          <Section title="Uploads blocked">
            <p className="m-0 text-sm text-(--text)">
              Since {formatStorageDate(current.blocked.at)}.
              {current.blocked.reason ? ` “${current.blocked.reason}”` : ""}
            </p>
          </Section>
        ) : null}

        <Section title="History">
          {detail.isPending ? (
            <CenteredLoadingSpinner label="Loading history" />
          ) : detail.data ? (
            <History events={detail.data.events} />
          ) : (
            <p className="m-0 text-sm text-rose-500">
              {detail.error?.message ?? "Couldn’t load the history."}
            </p>
          )}
        </Section>

        {action.error && dialog === null ? (
          <p role="alert" className="m-0 text-sm font-semibold text-rose-500">
            {action.error.message}
          </p>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] p-4 sm:px-6">
          {current.blocked ? (
            <Button
              variant="quiet"
              className={actionClass}
              disabled={action.isPending}
              onClick={() => run({ kind: "unblock", userId: current.userId })}
            >
              Unblock
            </Button>
          ) : (
            <Button
              variant="danger"
              className={actionClass}
              onClick={() => setDialog("block")}
            >
              <Prohibit size={15} weight="bold" aria-hidden />
              Block uploads
            </Button>
          )}
          <Button
            variant="quiet"
            className={actionClass}
            disabled={action.isPending}
            title="Recompute the space used from the student's files"
            onClick={() => run({ kind: "recount", userId: current.userId })}
          >
            <ArrowsClockwise size={15} weight="bold" aria-hidden />
            Recount
          </Button>
          <span className="flex-1" />
          {current.customLimit ? (
            <Button
              variant="quiet"
              className={actionClass}
              disabled={action.isPending}
              onClick={() =>
                run({
                  kind: "set_limit",
                  userId: current.userId,
                  limitBytes: null,
                })
              }
            >
              Use default
            </Button>
          ) : null}
          <Button
            elevation="flat"
            className={actionClass}
            onClick={() => setDialog("limit")}
          >
            Change limit…
          </Button>
        </div>
      ) : null}

      <StorageLimitDialog
        open={dialog === "approve" || dialog === "limit"}
        title={
          dialog === "approve" ? "Approve the request" : "Change the limit"
        }
        subtitle={`${name}’s new storage limit.`}
        currentLimitBytes={current.limitBytes}
        usedBytes={current.usedBytes}
        confirmLabel={dialog === "approve" ? "Approve" : "Save limit"}
        pending={action.isPending}
        error={action.error?.message}
        onClose={close}
        onConfirm={(limitBytes, note) =>
          dialog === "approve" && request
            ? run({
                kind: "approve",
                userId: current.userId,
                requestId: request.id,
                limitBytes,
                note,
              })
            : run({
                kind: "set_limit",
                userId: current.userId,
                limitBytes,
                note,
              })
        }
      />
      <StorageNoteDialog
        open={dialog === "decline"}
        title="Decline the request"
        subtitle={`${name} sees that it was not approved, with your note.`}
        noteLabel="Note for the student"
        confirmLabel="Decline"
        pending={action.isPending}
        error={action.error?.message}
        onClose={close}
        onConfirm={(note) =>
          request &&
          run({
            kind: "decline",
            userId: current.userId,
            requestId: request.id,
            note,
          })
        }
      />
      <StorageNoteDialog
        open={dialog === "block"}
        title="Block uploads"
        subtitle={`${name} can no longer send any file: in chats, discussions or support. Their files stay.${request ? " Their request for more space is turned down with this reason." : ""}`}
        noteLabel="Reason (the student sees it)"
        confirmLabel="Block uploads"
        danger
        pending={action.isPending}
        error={action.error?.message}
        onClose={close}
        onConfirm={(reason) =>
          run({ kind: "block", userId: current.userId, reason })
        }
      />
    </SlideOverPanel>
  );
}
