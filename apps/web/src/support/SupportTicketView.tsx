import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/MapPin";
import { useQueryClient } from "@tanstack/react-query";
import type { SupportTicketDetail } from "@veolms/contracts/support";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";

import { TimeAgo } from "../components/TimeAgo";
import { DiscussionAvatar } from "../learning/DiscussionAvatar";
import { supportKeys } from "../services/support";
import {
  SupportMessageBody,
  SupportMessageList,
  SupportReplyBox,
} from "./SupportConversation";
import {
  CategoryBadge,
  RatingFace,
  StatusChip,
  SUPPORT_CATEGORIES,
  SUPPORT_RATINGS,
} from "./supportCatalog";

/**
 * Opening a ticket marks it read on the server; the lists and counts that
 * showed it as new are asked for again.
 */
export function useRefreshAfterRead(ticket: SupportTicketDetail | undefined) {
  const queryClient = useQueryClient();
  const ticketId = ticket?.id;
  useEffect(() => {
    if (!ticketId) return;
    void queryClient.invalidateQueries({ queryKey: supportKeys.mine() });
    void queryClient.invalidateQueries({ queryKey: supportKeys.unread() });
    void queryClient.invalidateQueries({ queryKey: supportKeys.staffLists() });
    void queryClient.invalidateQueries({ queryKey: supportKeys.staffStats() });
  }, [queryClient, ticketId]);
}

/** One report or feedback: what was sent, then the conversation. */
export function SupportTicketView({
  ticket,
  headingLevel = 1,
  staffControls,
  canReply = true,
}: {
  ticket: SupportTicketDetail;
  headingLevel?: 1 | 2;
  /** The team's status buttons, shown under the heading. */
  staffControls?: ReactNode;
  canReply?: boolean;
}) {
  const category = SUPPORT_CATEGORIES[ticket.category];
  const rating = SUPPORT_RATINGS.find((item) => item.value === ticket.rating);
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const staff = ticket.viewerIsStaff;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start gap-3.5">
        <CategoryBadge category={ticket.category} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--muted)">
            <span className="font-semibold" style={{ color: category.color }}>
              {category.label}
            </span>
            <span aria-hidden="true">·</span>
            <span>#{ticket.number}</span>
            <span aria-hidden="true">·</span>
            <TimeAgo value={ticket.createdAt} />
          </div>
          <Heading className="mt-1 mb-0 text-xl leading-snug font-bold tracking-[-0.02em] text-(--text) [overflow-wrap:anywhere] sm:text-[1.4rem]">
            {ticket.title}
          </Heading>
        </div>
        {staffControls ? null : (
          <StatusChip status={ticket.status} staff={staff} />
        )}
      </header>

      {staffControls}

      <section
        aria-label={ticket.kind === "problem" ? "The report" : "The feedback"}
        className="rounded-2xl bg-(--surface-strong) p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <DiscussionAvatar
            src={ticket.requester.avatarUrl}
            className="size-9"
            width={36}
            height={36}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-(--text)">
              {staff ? ticket.requester.name : "You"}
            </div>
            {staff && ticket.requester.email ? (
              <a
                href={`mailto:${ticket.requester.email}`}
                className="block truncate text-xs text-(--muted) hover:text-(--accent)"
              >
                {ticket.requester.email}
                {ticket.kind === "feedback"
                  ? ticket.contactAllowed
                    ? " · open to a follow-up"
                    : " · prefers no follow-up"
                  : ""}
              </a>
            ) : null}
          </div>
          {rating ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                color: rating.color,
                backgroundColor: `color-mix(in srgb, ${rating.color} 13%, transparent)`,
              }}
            >
              <RatingFace rating={rating.value} size={16} />
              {rating.label}
            </span>
          ) : null}
        </div>

        <div className="mt-3.5">
          <SupportMessageBody
            content={ticket.content}
            attachments={ticket.attachments}
            label={ticket.kind === "problem" ? "The report" : "The feedback"}
          />
        </div>

        {ticket.pageLabel ? (
          <div className="mt-4 flex items-center gap-2 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3 text-xs text-(--muted)">
            <MapPin
              size={15}
              weight="duotone"
              aria-hidden="true"
              className="shrink-0 text-(--accent)"
            />
            <span className="min-w-0 truncate">
              {ticket.kind === "problem" ? "Reported from " : "About "}
              <span className="font-semibold text-(--text-secondary)">
                {ticket.pageLabel}
              </span>
            </span>
            {ticket.pagePath ? (
              <Link
                to={ticket.pagePath}
                className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-(--accent) hover:underline"
              >
                Open
                <ArrowSquareOut size={13} weight="bold" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        ) : null}

        {staff && ticket.technical ? (
          <details className="group mt-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3 text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-(--muted) hover:text-(--text-secondary)">
              <CaretDown
                size={13}
                weight="bold"
                aria-hidden="true"
                className="-rotate-90 transition-transform group-open:rotate-0"
              />
              Technical details
              <span className="truncate">
                {[ticket.technical.browser, ticket.technical.os]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </summary>
            <dl className="mt-2.5 mb-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {(
                [
                  ["Browser", ticket.technical.browser],
                  ["System", ticket.technical.os],
                  ["Screen", ticket.technical.screen],
                  ["Page", ticket.pagePath],
                  ["User agent", ticket.technical.userAgent],
                ] as const
              ).map(([term, value]) =>
                value ? (
                  <div key={term} className="contents">
                    <dt className="text-(--muted)">{term}</dt>
                    <dd className="m-0 text-(--text-secondary) [overflow-wrap:anywhere]">
                      {value}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </details>
        ) : null}
      </section>

      <section
        aria-labelledby={`support-conversation-${ticket.id}`}
        className="flex flex-col gap-3"
      >
        <h3
          id={`support-conversation-${ticket.id}`}
          className="m-0 text-[0.72rem] font-bold tracking-[0.08em] text-(--muted) uppercase"
        >
          Conversation
        </h3>
        <SupportMessageList
          ticket={ticket}
          emptyText={
            staff
              ? "No replies yet."
              : ticket.kind === "problem"
                ? "No reply yet. We usually answer within a day or two, and you'll get a notification when we do."
                : "We read every message. If we have a question or an update, it will show up here."
          }
        />
      </section>

      <SupportReplyBox ticket={ticket} canReply={canReply} />
    </div>
  );
}
