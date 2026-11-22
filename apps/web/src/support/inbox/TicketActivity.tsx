import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ChatCircleIcon as ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import type {
  SupportEvent,
  SupportMessage,
  SupportPriority,
  SupportTicketCategory,
  SupportTicketDetail,
  SupportTicketStatus,
} from "@veolms/contracts/support";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { TimeAgo } from "../../components/TimeAgo";
import { useAuthStore } from "../../store/auth.store";
import { SupportMessageBody } from "../SupportConversation";
import { SupportSelect } from "../SupportSelect";
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES } from "../supportCatalog";
import { SupportNoteCard } from "./SupportNoteCard";
import {
  AssigneeAvatar,
  PriorityIcon,
  QUEUE_PRIORITIES,
  StatusIcon,
} from "./supportQueueCatalog";

type Entry =
  | { kind: "reported"; at: string }
  | { kind: "message"; at: string; message: SupportMessage }
  | { kind: "event"; at: string; event: SupportEvent };

type Show = "everything" | "messages";

/**
 * The ticket's Activity, oldest first: who reported it, what the team did
 * (assigned, changed its status, ...), internal notes and replies. Pinned
 * notes come first. Replaces the plain conversation for the team.
 */
export function TicketActivity({
  ticket,
  canManage,
  onHandOff,
}: {
  ticket: SupportTicketDetail;
  canManage: boolean;
  onHandOff: () => void;
}) {
  const [show, setShow] = useState<Show>("everything");
  const viewerId = useAuthStore((state) => state.user?.id);
  const [params] = useSearchParams();
  const linkedNote = params.get("note");
  const staff = ticket.staff;

  const pinned = ticket.messages.filter(
    (message) => message.internal && message.pinned,
  );
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      { kind: "reported", at: ticket.createdAt },
      ...ticket.messages
        .filter((message) => !(message.internal && message.pinned))
        .map((message) => ({
          kind: "message" as const,
          at: message.createdAt,
          message,
        })),
      ...(staff?.events ?? []).map((event) => ({
        kind: "event" as const,
        at: event.createdAt,
        event,
      })),
    ];
    // Stable: what happened in one step keeps the order it was logged in.
    return list
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          Date.parse(left.entry.at) - Date.parse(right.entry.at) ||
          left.index - right.index,
      )
      .map(({ entry }) => entry)
      .filter((entry) => show === "everything" || entry.kind === "message");
  }, [ticket, staff, show]);

  // Opened from a note's link: brought into view and marked.
  useEffect(() => {
    if (!linkedNote) return;
    const element = document.getElementById(`support-note-${linkedNote}`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.focus({ preventScroll: true });
  }, [linkedNote, ticket.id]);

  const noteCard = (message: SupportMessage) => (
    <SupportNoteCard
      key={message.id}
      ticketId={ticket.id}
      note={message}
      canChange={
        canManage &&
        (message.author.id === viewerId || Boolean(staff?.canModerateNotes))
      }
      canPin={canManage}
      highlighted={message.id === linkedNote}
      onHandOff={onHandOff}
    />
  );

  return (
    <section
      aria-labelledby={`support-activity-${ticket.id}`}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          id={`support-activity-${ticket.id}`}
          className="m-0 text-[0.72rem] font-bold tracking-[0.08em] text-(--muted) uppercase"
        >
          Activity
        </h3>
        <SupportSelect
          value={show}
          onValueChange={setShow}
          ariaLabel="Show"
          className="w-52"
          options={[
            ["everything", "Show: Everything"],
            ["messages", "Show: Notes & replies"],
          ]}
        />
      </div>

      {pinned.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {pinned.map(noteCard)}
        </ol>
      ) : null}

      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {entries.map((entry) => {
          if (entry.kind === "reported") {
            return show === "everything" ? (
              <EventLine
                key="reported"
                icon={<Flag size={14} aria-hidden="true" />}
                at={entry.at}
              >
                <strong>{ticket.requester.name}</strong>{" "}
                {ticket.kind === "problem" ? "reported this" : "sent this"}
                {ticket.pageLabel ? ` from ${ticket.pageLabel}` : ""}
              </EventLine>
            ) : null;
          }
          if (entry.kind === "event") {
            return (
              <EventLine
                key={entry.event.id}
                icon={eventIcon(entry.event)}
                at={entry.at}
              >
                {describeEvent(entry.event)}
              </EventLine>
            );
          }
          return entry.message.internal ? (
            noteCard(entry.message)
          ) : (
            <ReplyCard
              key={entry.message.id}
              message={entry.message}
              studentName={ticket.requester.name}
            />
          );
        })}
      </ol>

      {ticket.messages.length === 0 && show === "messages" ? (
        <p className="m-0 rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_14%,transparent)] px-4 py-3 text-sm text-(--muted)">
          No replies yet.
          {ticket.kind === "feedback" && ticket.contactAllowed
            ? ` ${ticket.requester.name.split(" ")[0]} is open to a follow-up — a quick thank-you goes a long way.`
            : ""}
        </p>
      ) : null}
    </section>
  );
}

function EventLine({
  icon,
  at,
  children,
}: {
  icon: ReactNode;
  at: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 px-1 text-[0.8rem] text-(--muted) [&_strong]:font-semibold [&_strong]:text-(--text-secondary)">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--surface-strong) text-(--muted)">
        {icon}
      </span>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {children}
      </span>
      <TimeAgo value={at} className="shrink-0 text-xs" />
    </li>
  );
}

function eventIcon(event: SupportEvent): ReactNode {
  switch (event.type) {
    case "status_changed":
      return event.to ? (
        <StatusIcon status={event.to as SupportTicketStatus} size={14} />
      ) : null;
    case "priority_changed":
      return (
        <PriorityIcon
          priority={(event.to as SupportPriority | null) ?? null}
          size={14}
        />
      );
    case "category_changed":
      return <Tag size={14} aria-hidden="true" />;
    case "note_pinned":
    case "note_unpinned":
      return <PushPin size={14} aria-hidden="true" />;
    case "note_deleted":
      return <Trash size={14} aria-hidden="true" />;
    default:
      return <UserCircle size={14} aria-hidden="true" />;
  }
}

function statusName(value: string | null): string {
  return value && value in SUPPORT_STATUSES
    ? SUPPORT_STATUSES[value as SupportTicketStatus].staffLabel
    : "—";
}

function describeEvent(event: SupportEvent): ReactNode {
  const actor = <strong>{event.actor.name}</strong>;
  const sameAsActor =
    event.assignee?.id !== null && event.assignee?.id === event.actor.id;
  switch (event.type) {
    case "assigned":
      return (
        <>
          {actor} assigned this to{" "}
          {sameAsActor ? "themselves" : <strong>{event.assignee?.name}</strong>}
        </>
      );
    case "unassigned":
      return (
        <>
          {actor} unassigned{" "}
          {sameAsActor ? "themselves" : <strong>{event.assignee?.name}</strong>}
        </>
      );
    case "status_changed":
      return (
        <>
          {actor} changed status {statusName(event.from)}{" "}
          <ArrowRight
            size={11}
            weight="bold"
            aria-label="to"
            className="inline align-[-1px]"
          />{" "}
          <strong>{statusName(event.to)}</strong>
        </>
      );
    case "priority_changed":
      return event.to ? (
        <>
          {actor} set priority to{" "}
          <strong>
            {QUEUE_PRIORITIES[event.to as SupportPriority]?.label ?? event.to}
          </strong>
        </>
      ) : (
        <>{actor} removed the priority</>
      );
    case "category_changed":
      return (
        <>
          {actor} changed category to{" "}
          <strong>
            {SUPPORT_CATEGORIES[event.to as SupportTicketCategory]?.label ??
              event.to}
          </strong>
        </>
      );
    case "note_pinned":
      return <>{actor} pinned a note</>;
    case "note_unpinned":
      return <>{actor} unpinned a note</>;
    case "note_deleted":
      return <>{actor} deleted a note</>;
  }
}

/** A reply to the student, or the student's own message: neutral. */
function ReplyCard({
  message,
  studentName,
}: {
  message: SupportMessage;
  studentName: string;
}) {
  const fromTeam = message.authorRole === "staff";
  return (
    <li className="flex gap-3 rounded-2xl bg-(--surface-strong) p-3.5">
      <AssigneeAvatar person={message.author} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-sm font-semibold text-(--text)">
            {message.author.name}
          </span>
          {fromTeam ? (
            <span className="inline-flex items-center gap-1 font-semibold text-(--accent)">
              <PaperPlaneTilt size={12} weight="fill" aria-hidden="true" />
              Sent to {studentName.split(" ")[0] || "the student"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-(--muted)">
              <ChatCircle size={12} aria-hidden="true" />
              Student
            </span>
          )}
          <TimeAgo value={message.createdAt} className="text-(--muted)" />
        </div>
        <div className="mt-1">
          <SupportMessageBody
            content={message.content}
            attachments={message.attachments}
            label={`Message from ${message.author.name}`}
          />
        </div>
      </div>
    </li>
  );
}
