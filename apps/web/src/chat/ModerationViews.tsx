import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import type { ChatReport, ChatRestriction } from "@veolms/contracts";

import { getApiError } from "../lib/api-error";
import {
  useChatReports,
  useChatRestrictions,
  useDeleteMessage,
  useHandleReport,
  useLiftRestriction,
  useRestrictMember,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { REASONS } from "./ChatDialogs";
import { listTime, messageTime } from "./chatFormat";

const reasonLabel = (value: string) =>
  REASONS.find((r) => r.value === value)?.label ?? value;

const pill =
  "h-8 cursor-pointer rounded-full border border-solid px-3 text-[0.8rem] font-semibold disabled:opacity-50";

function when(iso: string) {
  const day = listTime(iso);
  const time = messageTime(iso);
  return day === time ? time : `${day}, ${time}`;
}

/**
 * Group admins: reported messages of this group, newest first, each with
 * what was said around it and the quick actions an admin takes most:
 * delete it for everyone, mute the sender for a day, or dismiss.
 */
export function ReportsView({
  roomId,
  onToast,
  onJumpTo,
}: {
  roomId: string;
  onToast: (message: string) => void;
  onJumpTo: (seq: number) => void;
}) {
  const reports = useChatReports(roomId, true);
  const handle = useHandleReport();
  const remove = useDeleteMessage();
  const restrict = useRestrictMember();
  const fail = (error: unknown) => onToast(getApiError(error).message);
  const list = reports.data?.reports ?? [];

  function act(report: ChatReport, action: "delete" | "mute" | "dismiss") {
    const done = () =>
      handle.mutate(
        {
          id: report.id,
          status: action === "dismiss" ? "dismissed" : "actioned",
        },
        { onError: fail },
      );
    if (action === "dismiss") return done();
    if (action === "delete") {
      remove.mutate(
        { roomId, seq: report.seq, scope: "everyone" },
        {
          onSuccess: () => {
            done();
            onToast("Message deleted for everyone.");
          },
          onError: fail,
        },
      );
      return;
    }
    if (!report.reportedUser) return;
    restrict.mutate(
      {
        userId: report.reportedUser.id,
        roomId,
        type: "mute",
        durationMinutes: 24 * 60,
        reason: report.reason,
      },
      {
        onSuccess: () => {
          done();
          onToast(`${report.reportedUser!.name} is muted for 24 hours.`);
        },
        onError: fail,
      },
    );
  }

  if (reports.isLoading) {
    return (
      <p className="m-0 px-6 py-6 text-[0.88rem] text-(--muted)">Loading…</p>
    );
  }
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
        <ShieldCheck
          size={40}
          className="text-(--accent-ink)"
          aria-hidden="true"
        />
        <p className="m-0 text-[0.9rem] text-(--muted)">
          No open reports. Members report a message from its menu.
        </p>
      </div>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-4">
      {list.map((report) => (
        <li
          key={report.id}
          className="rounded-2xl bg-(--chat-input) p-4 text-(--text)"
        >
          <div className="flex items-center gap-2 text-[0.78rem] text-(--muted)">
            <Flag
              size={14}
              weight="fill"
              className="text-red-500"
              aria-hidden="true"
            />
            <span className="font-semibold text-red-500">
              {reasonLabel(report.reason)}
            </span>
            {report.reportCount > 1 ? (
              <span>· reported {report.reportCount} times</span>
            ) : null}
            <span className="ml-auto">{when(report.createdAt)}</span>
          </div>
          <button
            type="button"
            onClick={() => onJumpTo(report.seq)}
            className="mt-2 block w-full cursor-pointer rounded-xl border-0 bg-(--chat-in) px-3 py-2 text-left"
          >
            <span className="block text-[0.78rem] font-semibold text-(--accent-ink)">
              {report.snapshot.senderName ?? "Someone"}
            </span>
            <span className="line-clamp-4 block text-[0.88rem] whitespace-pre-wrap">
              {report.snapshot.body || "Media"}
            </span>
          </button>
          {report.details ? (
            <p className="m-0 mt-2 text-[0.82rem] text-(--text-secondary)">
              “{report.details}”
            </p>
          ) : null}
          <p className="m-0 mt-1 text-[0.75rem] text-(--muted)">
            Reported by {report.reporter?.name ?? "a member"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => act(report, "delete")}
              className={`${pill} border-red-500/50 bg-transparent text-red-500 hover:bg-red-500/10`}
            >
              Delete message
            </button>
            {report.reportedUser ? (
              <button
                type="button"
                onClick={() => act(report, "mute")}
                className={`${pill} border-(--chat-line-strong) bg-transparent text-(--text) hover:bg-(--chat-hover)`}
              >
                Mute 24 h
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => act(report, "dismiss")}
              className={`${pill} border-transparent bg-transparent text-(--muted) hover:text-(--text)`}
            >
              Dismiss
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Group admins: who is muted or removed here, until when, and Lift. */
export function RestrictedView({
  roomId,
  onToast,
}: {
  roomId: string;
  onToast: (message: string) => void;
}) {
  const restrictions = useChatRestrictions(roomId, true);
  const lift = useLiftRestriction();
  const list = restrictions.data?.restrictions ?? [];

  if (restrictions.isLoading) {
    return (
      <p className="m-0 px-6 py-6 text-[0.88rem] text-(--muted)">Loading…</p>
    );
  }
  if (list.length === 0) {
    return (
      <p className="m-0 px-8 py-14 text-center text-[0.9rem] text-(--muted)">
        Nobody is muted or removed in this group.
      </p>
    );
  }
  return (
    <ul className="m-0 list-none p-2">
      {list.map((r: ChatRestriction) => (
        <li
          key={r.id}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5"
        >
          <ChatAvatar name={r.user.name} url={r.user.avatarUrl} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.92rem] text-(--text)">
              {r.user.name}
            </span>
            <span className="block truncate text-[0.76rem] text-(--muted)">
              {r.type === "ban" ? "Removed" : "Muted"}
              {r.roomId === null ? " in all chats" : ""} ·{" "}
              {r.until ? `until ${when(r.until)}` : "until lifted"} ·{" "}
              {reasonLabel(r.reason)}
            </span>
          </span>
          <button
            type="button"
            disabled={lift.isPending}
            onClick={() =>
              lift.mutate(r.id, {
                onSuccess: () => onToast(`${r.user.name} can take part again.`),
                onError: (error) => onToast(getApiError(error).message),
              })
            }
            className={`${pill} border-(--accent-border) bg-transparent text-(--accent-ink) hover:bg-(--chat-hover)`}
          >
            Lift
          </button>
        </li>
      ))}
    </ul>
  );
}
