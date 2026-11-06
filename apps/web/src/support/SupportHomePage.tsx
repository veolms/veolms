import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import type { SupportTicketSummary } from "@veolms/contracts/support";
import { Link } from "react-router";

import { ElevatedCard } from "../components/ElevatedCard";
import { TimeAgo } from "../components/TimeAgo";
import { LEGAL_SUPPORT_EMAIL } from "../legal/legalPages";
import { useMySupportTickets } from "../services/support";
import {
  CategoryBadge,
  RatingFace,
  StatusChip,
  SUPPORT_CATEGORIES,
  SUPPORT_RATINGS,
} from "./supportCatalog";
import { supportPageClasses } from "./supportLayout";
import { SupportPageHeader } from "./SupportTabs";

/** /support, the "Your reports" tab: what the learner sent, and the replies. */
export function SupportHomePage() {
  const tickets = useMySupportTickets();

  return (
    <main className={supportPageClasses} aria-labelledby="support-title">
      <SupportPageHeader active="mine" />

      <section
        aria-labelledby="support-mine-title"
        className="flex flex-col gap-3"
      >
        <h2 id="support-mine-title" className="sr-only">
          Your reports and feedback
        </h2>
        {tickets.isPending ? (
          <TicketListSkeleton />
        ) : tickets.error ? (
          <ElevatedCard padded className="text-sm text-(--muted)">
            We couldn&apos;t load them.{" "}
            <button
              type="button"
              onClick={() => void tickets.refetch()}
              className="font-semibold text-(--accent) hover:underline"
            >
              Try again
            </button>
          </ElevatedCard>
        ) : tickets.data.tickets.length === 0 ? (
          <ElevatedCard
            padded
            className="flex flex-col items-center gap-2 py-10 text-center"
          >
            <ChatsCircle
              size={40}
              weight="duotone"
              className="text-(--accent)"
              aria-hidden="true"
            />
            <p className="m-0 font-semibold text-(--text)">Nothing sent yet</p>
            <p className="m-0 max-w-sm text-sm text-(--muted)">
              When you report a problem or send feedback, you&apos;ll find it
              here with the team&apos;s replies.
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Link
                to="/support/new?type=problem"
                className="inline-flex h-9 items-center rounded-lg bg-(--accent) px-3.5 text-sm font-semibold text-(--on-accent) no-underline hover:bg-(--accent-hover)"
              >
                Report a problem
              </Link>
              <Link
                to="/support/new?type=feedback"
                className="inline-flex h-9 items-center rounded-lg bg-(--surface-strong) px-3.5 text-sm font-semibold text-(--text-secondary) no-underline hover:bg-(--hover) hover:text-(--text)"
              >
                Send feedback
              </Link>
            </div>
          </ElevatedCard>
        ) : (
          <ElevatedCard as="ul" className="m-0 list-none overflow-hidden p-0">
            {tickets.data.tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} />
            ))}
          </ElevatedCard>
        )}
      </section>

      <p className="m-0 text-center text-xs text-(--muted)">
        Prefer email? Write to{" "}
        <a
          href={`mailto:${LEGAL_SUPPORT_EMAIL}`}
          className="font-semibold text-(--text-secondary) hover:text-(--accent)"
        >
          {LEGAL_SUPPORT_EMAIL}
        </a>
      </p>
    </main>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicketSummary }) {
  const category = SUPPORT_CATEGORIES[ticket.category];
  const rating = SUPPORT_RATINGS.find((item) => item.value === ticket.rating);
  return (
    <li className="border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] first:border-t-0">
      <Link
        to={`/support/${ticket.id}`}
        className="flex items-center gap-3.5 px-5 py-4 no-underline transition-colors hover:bg-(--hover) max-sm:px-4"
      >
        <CategoryBadge category={ticket.category} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {ticket.unread ? (
              <span
                className="size-2 shrink-0 rounded-full bg-(--accent)"
                aria-label="New reply"
              />
            ) : null}
            <span
              className={`truncate text-[0.95rem] text-(--text) ${ticket.unread ? "font-bold" : "font-semibold"}`}
            >
              {ticket.title}
            </span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-(--muted)">
            <span>#{ticket.number}</span>
            <span aria-hidden="true">·</span>
            <span>{category.label}</span>
            {rating ? (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className="inline-flex items-center gap-1"
                  style={{ color: rating.color }}
                >
                  <RatingFace rating={rating.value} size={14} />
                  {rating.label}
                </span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <TimeAgo value={ticket.lastMessageAt} />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {ticket.attachmentCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-(--muted) max-sm:hidden"
              title={`${ticket.attachmentCount} files`}
            >
              <Paperclip size={14} aria-hidden="true" />
              {ticket.attachmentCount}
            </span>
          ) : null}
          {ticket.replyCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-(--muted) max-sm:hidden"
              title={`${ticket.replyCount} replies from the team`}
            >
              <ChatsCircle size={14} aria-hidden="true" />
              {ticket.replyCount}
            </span>
          ) : null}
          <StatusChip status={ticket.status} />
        </span>
      </Link>
    </li>
  );
}

function TicketListSkeleton() {
  return (
    <ElevatedCard as="ul" className="m-0 list-none p-0" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li
          key={row}
          className="flex items-center gap-3.5 border-t border-[color-mix(in_srgb,var(--text)_7%,transparent)] px-5 py-4 first:border-t-0"
        >
          <span className="size-10 rounded-xl bg-(--surface-strong)" />
          <span className="flex-1">
            <span className="block h-3.5 w-2/5 rounded bg-(--surface-strong)" />
            <span className="mt-2 block h-3 w-1/4 rounded bg-(--surface-strong)" />
          </span>
          <span className="h-6 w-20 rounded-full bg-(--surface-strong)" />
        </li>
      ))}
    </ElevatedCard>
  );
}
