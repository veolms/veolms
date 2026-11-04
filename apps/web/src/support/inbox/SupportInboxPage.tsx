import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { TrayIcon as Tray } from "@phosphor-icons/react/Tray";
import type {
  SupportAdminTicketSummary,
  SupportTicketCategory,
  SupportTicketKind,
  SupportTicketStatus,
} from "@veolms/contracts/support";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { ElevatedCard } from "../../components/ElevatedCard";
import { PageHeading } from "../../components/PageHeading";
import { TimeAgo } from "../../components/TimeAgo";
import { DiscussionAvatar } from "../../learning/DiscussionAvatar";
import { useCapabilities } from "../../services/authorization";
import {
  getApplicationScrollElement,
  scrollApplicationTo,
  withKeepScroll,
} from "../../shell/applicationScroll";
import {
  useStaffSupportStats,
  useStaffSupportTickets,
  type SupportAdminFilters,
} from "../../services/support";
import { SearchField } from "../../team/TeamBits";
import {
  CategoryBadge,
  FEEDBACK_CATEGORY_ORDER,
  FEEDBACK_STATUS_ORDER,
  PROBLEM_CATEGORY_ORDER,
  PROBLEM_STATUS_ORDER,
  RatingFace,
  StatusChip,
  SUPPORT_CATEGORIES,
  SUPPORT_RATINGS,
  SUPPORT_STATUSES,
} from "../supportCatalog";
import { supportInboxPageClasses } from "../supportLayout";
import { SupportSelect } from "../SupportSelect";
import { FeedbackSummary } from "./FeedbackSummary";
import { StaffTicketPanel } from "./StaffTicketPanel";

const ALL = "all";

/** /support-inbox(/feedback): what learners reported and the feedback they sent. */
export function SupportInboxPage() {
  const capabilities = useCapabilities();
  if (capabilities.isLoading) {
    return <InboxSkeleton />;
  }
  if (!capabilities.can("support.read")) return <AccessDenied />;
  return <SupportInbox canManage={capabilities.can("support.manage")} />;
}

function SupportInbox({ canManage }: { canManage: boolean }) {
  const { inboxTab } = useParams();
  const kind: SupportTicketKind =
    inboxTab === "feedback" ? "feedback" : "problem";
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("ticket");
  const stats = useStaffSupportStats();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const [status, setStatus] = useState<SupportTicketStatus | typeof ALL>(ALL);
  const [category, setCategory] = useState<SupportTicketCategory | typeof ALL>(
    ALL,
  );
  const [rating, setRating] = useState<string>(ALL);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  // Filters belong to one tab.
  useEffect(() => {
    setStatus(ALL);
    setCategory(ALL);
    setRating(ALL);
  }, [kind]);

  const filters = useMemo<SupportAdminFilters>(
    () => ({
      kind,
      sort,
      ...(status !== ALL ? { status } : {}),
      ...(category !== ALL ? { category } : {}),
      ...(rating !== ALL ? { rating: Number(rating) } : {}),
      ...(search ? { search } : {}),
    }),
    [kind, sort, status, category, rating, search],
  );
  // What is open and listed now, for a page that finishes loading later.
  const latestView = useRef({ selectedId, filters });
  useEffect(() => {
    latestView.current = { selectedId, filters };
  });
  const list = useStaffSupportTickets(filters);
  const tickets = list.data?.pages.flatMap((page) => page.tickets) ?? [];
  const total = list.data?.pages[0]?.totalCount ?? 0;

  // The open one is kept in the address, so it can be shared and reloaded.
  // Stepping to the next one replaces the entry rather than adding to it.
  const select = (ticketId: string | null) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (ticketId) next.set("ticket", ticketId);
        else next.delete("ticket");
        return next;
      },
      // Only the open one changes: the page keeps its scroll position.
      { replace: Boolean(selectedId), state: withKeepScroll(null) },
    );
  };
  const selectedIndex = tickets.findIndex((ticket) => ticket.id === selectedId);
  const selectedTicket = selectedIndex >= 0 ? tickets[selectedIndex] : null;
  const prevId = selectedIndex > 0 ? tickets[selectedIndex - 1]?.id : undefined;
  const nextId =
    selectedIndex >= 0 ? tickets[selectedIndex + 1]?.id : undefined;

  const problems = stats.data?.problems;
  const feedback = stats.data?.feedback;

  return (
    <main
      className={supportInboxPageClasses}
      aria-labelledby="support-inbox-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeading
          id="support-inbox-title"
          title="Support"
          description="Problems reported by learners, and their feedback on ProCodrr."
        />
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          label={kind === "problem" ? "Search reports" : "Search feedback"}
          placeholder="Search by name, email, text or #number"
          className="max-w-sm min-w-60"
        />
      </div>

      <nav
        aria-label="Support"
        className="flex gap-1 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
      >
        <InboxTab
          to="/support-inbox"
          active={kind === "problem"}
          label="Reports"
        >
          {problems ? `${problems.open} open` : null}
        </InboxTab>
        <InboxTab
          to="/support-inbox/feedback"
          active={kind === "feedback"}
          label="Feedback"
        >
          {feedback ? `${feedback.new} new` : null}
        </InboxTab>
      </nav>

      {kind === "problem" ? (
        <div className="@container/support-stats">
          <div className="grid grid-cols-2 gap-3 @2xl/support-stats:grid-cols-4">
            {PROBLEM_STATUS_ORDER.map((value) => (
              <StatusCard
                key={value}
                status={value}
                count={problems?.[value]}
                selected={status === value}
                onToggle={() => setStatus(status === value ? ALL : value)}
              />
            ))}
          </div>
        </div>
      ) : (
        <FeedbackSummary stats={feedback} />
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {kind === "feedback" ? (
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="Type"
          >
            {([ALL, ...FEEDBACK_CATEGORY_ORDER] as const).map((value) => {
              const selected = category === value;
              const count =
                value === ALL ? feedback?.total : feedback?.[value as "idea"];
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(value)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-(--surface-strong) px-3.5 text-[0.8rem] font-semibold text-(--text-secondary) ring-1 ring-transparent ring-inset hover:text-(--text) aria-checked:bg-(--accent)/12 aria-checked:text-(--text) aria-checked:ring-(--accent)"
                >
                  {value === ALL ? "All" : SUPPORT_CATEGORIES[value].short}
                  {count !== undefined ? (
                    <span className="text-(--muted)">{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="m-0 mr-auto text-sm text-(--muted)">
            Showing{" "}
            <span className="font-semibold text-(--text-secondary)">
              {status === ALL
                ? "all reports"
                : SUPPORT_STATUSES[status].staffLabel.toLowerCase()}
            </span>{" "}
            · {total} {total === 1 ? "report" : "reports"}
          </p>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {kind === "problem" ? (
            <SupportSelect
              value={category}
              onValueChange={setCategory}
              ariaLabel="Category"
              className="w-52"
              options={[
                [ALL, "All categories"],
                ...PROBLEM_CATEGORY_ORDER.map(
                  (value) => [value, SUPPORT_CATEGORIES[value].label] as const,
                ),
              ]}
            />
          ) : (
            <>
              <SupportSelect
                value={rating}
                onValueChange={setRating}
                ariaLabel="Rating"
                className="w-40"
                options={[
                  [ALL, "All ratings"],
                  ...[...SUPPORT_RATINGS]
                    .reverse()
                    .map((item) => [String(item.value), item.label] as const),
                ]}
              />
              <SupportSelect
                value={status}
                onValueChange={setStatus}
                ariaLabel="Status"
                className="w-40"
                options={[
                  [ALL, "Any status"],
                  ...FEEDBACK_STATUS_ORDER.map(
                    (value) =>
                      [value, SUPPORT_STATUSES[value].staffLabel] as const,
                  ),
                ]}
              />
            </>
          )}
          <SupportSelect
            value={sort}
            onValueChange={setSort}
            ariaLabel="Sort"
            className="w-40"
            options={[
              ["newest", "Newest first"],
              ["oldest", "Oldest first"],
            ]}
          />
        </div>
      </div>

      <div>
        {list.isPending ? (
          <ListSkeleton />
        ) : list.error ? (
          <ElevatedCard padded className="text-sm text-(--muted)">
            {list.error.message}{" "}
            <button
              type="button"
              onClick={() => void list.refetch()}
              className="font-semibold text-(--accent) hover:underline"
            >
              Try again
            </button>
          </ElevatedCard>
        ) : tickets.length === 0 ? (
          <ElevatedCard
            padded
            className="flex flex-col items-center gap-2 py-12 text-center"
          >
            <Tray
              size={36}
              weight="duotone"
              className="text-(--accent)"
              aria-hidden="true"
            />
            <p className="m-0 font-semibold text-(--text)">
              {kind === "problem" ? "No reports here" : "No feedback here"}
            </p>
            <p className="m-0 text-sm text-(--muted)">
              {search || status !== ALL || category !== ALL || rating !== ALL
                ? "Nothing matches these filters."
                : kind === "problem"
                  ? "Nice work: nothing is waiting."
                  : "When learners send feedback, it shows up here."}
            </p>
          </ElevatedCard>
        ) : (
          <div className="flex flex-col gap-3">
            <ul
              className={`m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2.5 p-0 ${kind === "feedback" ? "2xl:grid-cols-2" : ""}`}
            >
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  selected={ticket.id === selectedId}
                  onSelect={() => select(ticket.id)}
                />
              ))}
            </ul>
            {list.hasNextPage ? (
              <button
                type="button"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                className="h-10 rounded-lg bg-(--surface-strong) text-sm font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) disabled:opacity-60"
              >
                {list.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* The open report or feedback, in the Discussions page's side panel. */}
      <StaffTicketPanel
        ticketId={selectedId}
        ticketNumber={selectedTicket?.number ?? null}
        canManage={canManage}
        onClose={() => select(null)}
        onReopen={select}
        hasPrev={selectedIndex > 0}
        hasNext={
          selectedIndex >= 0 &&
          (selectedIndex < tickets.length - 1 || Boolean(list.hasNextPage))
        }
        onPrev={() => {
          if (prevId) select(prevId);
        }}
        onNext={() => {
          if (nextId) {
            select(nextId);
            return;
          }
          // The last one loaded: bring the next page and open its first.
          if (!list.hasNextPage || list.isFetchingNextPage) return;
          const requested = { selectedId, filters };
          void list.fetchNextPage().then((result) => {
            // Another one opened, or the filters changed, while it loaded.
            const current = latestView.current;
            if (
              current.selectedId !== requested.selectedId ||
              current.filters !== requested.filters
            )
              return;
            const first = result.data?.pages.at(-1)?.tickets[0];
            if (first) select(first.id);
          });
        }}
      />
    </main>
  );
}

function InboxTab({
  to,
  active,
  label,
  children,
}: {
  to: string;
  active: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className="-mb-px inline-flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-semibold text-(--muted) no-underline transition-colors hover:text-(--text) aria-[current=page]:border-(--accent) aria-[current=page]:text-(--text)"
    >
      {label}
      {children ? (
        <span className="rounded-full bg-(--surface-strong) px-2 py-0.5 text-xs font-semibold text-(--text-secondary)">
          {children}
        </span>
      ) : null}
    </Link>
  );
}

function StatusCard({
  status,
  count,
  selected,
  onToggle,
}: {
  status: SupportTicketStatus;
  count: number | undefined;
  selected: boolean;
  onToggle: () => void;
}) {
  const info = SUPPORT_STATUSES[status];
  return (
    <ElevatedCard
      as="button"
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="flex flex-col items-start gap-1.5 px-4 py-3.5 text-left ring-(--accent) transition-[background-color,box-shadow] ring-inset hover:bg-(--card-surface-hover) aria-pressed:ring-2"
    >
      <span className="flex items-center gap-2 text-[0.8rem] font-semibold text-(--text-secondary)">
        <span
          className={`size-2 rounded-full ${info.dot}`}
          aria-hidden="true"
        />
        {info.staffLabel}
      </span>
      <span className="text-2xl font-bold tracking-[-0.02em] text-(--text) tabular-nums">
        {count ?? "–"}
      </span>
    </ElevatedCard>
  );
}

function TicketCard({
  ticket,
  selected,
  onSelect,
}: {
  ticket: SupportAdminTicketSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const rating = SUPPORT_RATINGS.find((item) => item.value === ticket.rating);
  const isFeedback = ticket.kind === "feedback";
  const itemRef = useRef<HTMLLIElement>(null);
  // Stepped to with the panel's arrows: brought to the middle of the list
  // when it is not fully in view, as on the Discussions page.
  useEffect(() => {
    if (selected) revealInList(itemRef.current);
  }, [selected]);
  return (
    <li ref={itemRef}>
      <ElevatedCard
        as="button"
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left ring-(--accent) transition-[background-color,box-shadow] ring-inset hover:bg-(--card-surface-hover) aria-[current=true]:ring-2"
      >
        <span className="flex w-full items-start gap-3">
          {isFeedback && rating ? (
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{
                color: rating.color,
                backgroundColor: `color-mix(in srgb, ${rating.color} 14%, transparent)`,
              }}
              aria-hidden="true"
            >
              <RatingFace rating={rating.value} size={24} />
            </span>
          ) : (
            <CategoryBadge category={ticket.category} />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-2">
              {ticket.unread ? (
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-(--accent)"
                  aria-label="New"
                />
              ) : null}
              <span
                className={`line-clamp-2 text-[0.92rem] leading-snug [overflow-wrap:anywhere] text-(--text) ${ticket.unread ? "font-bold" : "font-semibold"}`}
              >
                {isFeedback ? ticket.snippet : ticket.title}
              </span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-(--muted)">
              <span
                className="font-semibold"
                style={{ color: SUPPORT_CATEGORIES[ticket.category].color }}
              >
                {SUPPORT_CATEGORIES[ticket.category].short}
              </span>
              {rating && isFeedback ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{rating.label}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <span>#{ticket.number}</span>
              <span aria-hidden="true">·</span>
              <TimeAgo value={ticket.createdAt} />
            </span>
          </span>
          <StatusChip status={ticket.status} staff />
        </span>
        {isFeedback ? null : (
          <span className="line-clamp-2 text-[0.82rem] leading-5 text-(--text-secondary)">
            {ticket.snippet}
          </span>
        )}
        <span className="flex w-full items-center gap-2 text-xs text-(--muted)">
          <DiscussionAvatar
            src={ticket.requester.avatarUrl}
            className="size-5"
            width={20}
            height={20}
          />
          <span className="truncate font-medium text-(--text-secondary)">
            {ticket.requester.name}
          </span>
          {ticket.pageLabel ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{ticket.pageLabel}</span>
            </>
          ) : null}
          {isFeedback && ticket.contactAllowed ? (
            <span className="ml-auto shrink-0 rounded-full bg-emerald-400/12 px-2 py-0.5 font-semibold text-emerald-700 [:root[data-theme=dark]_&]:text-emerald-300">
              Can contact
            </span>
          ) : null}
          {ticket.replyCount > 0 ? (
            <span
              className={`shrink-0 ${isFeedback && ticket.contactAllowed ? "" : "ml-auto"}`}
            >
              {ticket.replyCount}{" "}
              {ticket.replyCount === 1 ? "reply" : "replies"}
            </span>
          ) : null}
        </span>
      </ElevatedCard>
    </li>
  );
}

function revealInList(item: HTMLElement | null) {
  if (!item) return;
  const scroller = getApplicationScrollElement();
  const view = scroller?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
    height: window.innerHeight,
  };
  const rect = item.getBoundingClientRect();
  if (rect.top >= view.top && rect.bottom <= view.bottom) return;
  const current = scroller ? scroller.scrollTop : window.scrollY;
  scrollApplicationTo({
    top: current + rect.top - view.top - (view.height - rect.height) / 2,
    behavior: "smooth",
  });
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <ElevatedCard
          key={row}
          as="div"
          className="flex items-start gap-3 px-4 py-4"
        >
          <span className="size-10 rounded-xl bg-(--surface-strong)" />
          <span className="flex-1">
            <span className="block h-3.5 w-1/2 rounded bg-(--surface-strong)" />
            <span className="mt-2 block h-3 w-1/3 rounded bg-(--surface-strong)" />
            <span className="mt-3 block h-3 w-4/5 rounded bg-(--surface-strong)" />
          </span>
        </ElevatedCard>
      ))}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <main className={supportInboxPageClasses} aria-busy="true">
      <span className="block h-9 w-40 rounded-lg bg-(--surface-strong)" />
      <ListSkeleton />
    </main>
  );
}

function AccessDenied() {
  const navigate = useNavigate();
  return (
    <main className={supportInboxPageClasses}>
      <ElevatedCard
        as="div"
        className="mx-auto mt-6 grid max-w-xl place-items-center p-10 text-center"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
          <ShieldWarning size={24} weight="bold" />
        </span>
        <h1 className="mt-3 text-lg font-semibold">Access denied</h1>
        <p className="mt-1 max-w-md text-sm text-(--muted)">
          Your roles do not include reading reports and feedback.
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) hover:bg-(--accent-hover)"
        >
          Return home
        </button>
      </ElevatedCard>
    </main>
  );
}
