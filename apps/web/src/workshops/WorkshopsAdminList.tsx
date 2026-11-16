import type {
  WorkshopAdminListItem,
  WorkshopAdminTab,
} from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { Button } from "../components/Button";
import {
  browserTimeZone,
  formatRegistrations,
  formatSessionDay,
  formatSessionTime,
  formatWorkshopPrice,
  workshopDisplayStatus,
  workshopStatusClass,
  workshopStatusLabel,
} from "./workshopHelpers";

const EMPTY_COPY: Record<WorkshopAdminTab, { title: string; body: string }> = {
  upcoming: {
    title: "No upcoming workshops",
    body: "Published workshops with a session still to come appear here.",
  },
  past: {
    title: "No past workshops yet",
    body: "Once a workshop's last session has ended, it moves here.",
  },
  drafts: {
    title: "No drafts",
    body: "Create a workshop and publish it when the sessions and links are set.",
  },
  cancelled: {
    title: "Nothing cancelled",
    body: "Cancelled workshops stay here with the reason you gave.",
  },
};

export function WorkshopsListLoadingRows() {
  return (
    <div className="grid gap-2.5 px-3 py-3 sm:gap-3 sm:px-7 sm:py-5">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-24 animate-pulse rounded-xl bg-(--canvas) sm:h-20"
        />
      ))}
    </div>
  );
}

function CoverThumb({
  coverUrl,
  title,
}: {
  coverUrl: string | null;
  title: string;
}) {
  return coverUrl ? (
    <img
      src={coverUrl}
      alt=""
      loading="lazy"
      className="aspect-video w-full rounded-lg object-cover sm:w-28"
    />
  ) : (
    <div
      aria-hidden="true"
      className="flex aspect-video w-full items-center justify-center rounded-lg bg-(--accent)/10 text-(--accent) sm:w-28"
      title={title}
    >
      <VideoConference size={24} weight="duotone" />
    </div>
  );
}

export function WorkshopsAdminList({
  items,
  tab,
  isLoading,
  canManage,
  onOpen,
  onCreate,
}: {
  items: WorkshopAdminListItem[];
  tab: WorkshopAdminTab;
  isLoading: boolean;
  canManage: boolean;
  onOpen: (workshop: WorkshopAdminListItem) => void;
  onCreate?: () => void;
}) {
  if (isLoading) return <WorkshopsListLoadingRows />;

  if (items.length === 0) {
    const copy = EMPTY_COPY[tab];
    return (
      <div className="grid place-items-center p-6 text-center sm:p-12">
        <span className="flex size-10 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent) sm:size-11">
          <VideoConference size={22} weight="bold" />
        </span>
        <h3 className="mt-3 text-sm font-semibold">{copy.title}</h3>
        <p className="mt-1 max-w-sm text-xs leading-5 text-(--muted)">
          {copy.body}
        </p>
        {canManage && onCreate && tab === "drafts" ? (
          <div className="mt-4">
            <Button onClick={onCreate}>Create workshop</Button>
          </div>
        ) : null}
      </div>
    );
  }

  const zone = browserTimeZone();

  return (
    <ul className="divide-y divide-[color-mix(in_srgb,var(--text)_8%,transparent)]">
      {items.map((workshop) => {
        const status = workshopDisplayStatus(workshop);
        return (
          <li key={workshop.id}>
            <button
              type="button"
              onClick={() => onOpen(workshop)}
              className="grid w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] focus-visible:outline-none sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:px-7 sm:py-4 cursor-pointer"
              aria-label={`${canManage ? "Edit" : "Open"} ${workshop.title}`}
            >
              <CoverThumb coverUrl={workshop.coverUrl} title={workshop.title} />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-(--text) sm:text-[15px]">
                    {workshop.title}
                  </h3>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${workshopStatusClass(status)}`}
                  >
                    {workshopStatusLabel(status)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-(--muted)">
                  {workshop.host.name}
                  {workshop.audience === "course"
                    ? ` · ${workshop.courseTitle ?? "Course"} learners`
                    : workshop.audience === "paid"
                      ? " · Paid seats"
                      : " · Everyone signed up"}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--text-secondary,var(--muted))">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarBlank size={14} />
                    {workshop.nextSessionAt
                      ? `${formatSessionDay(workshop.nextSessionAt, zone)}, ${formatSessionTime(workshop.nextSessionAt, zone)}`
                      : "No sessions yet"}
                    {workshop.sessionCount > 1
                      ? ` · ${workshop.sessionCount} sessions`
                      : null}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users size={14} />
                    {workshop.audience === "paid"
                      ? formatRegistrations(
                          workshop.registrationCount,
                          workshop.capacity,
                        )
                      : `${workshop.invitedCount.toLocaleString("en-IN")} invited`}
                    {` · ${workshop.joinedCount.toLocaleString("en-IN")} joined`}
                  </span>
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                {workshop.priceMinor ? (
                  <span className="text-sm font-semibold text-(--text)">
                    {formatWorkshopPrice(
                      workshop.priceMinor,
                      workshop.currency,
                    )}
                  </span>
                ) : (
                  <span />
                )}
                <span className="inline-flex items-center gap-1 text-xs font-medium text-(--accent)">
                  {canManage ? "Edit" : "View"}
                  <ArrowRight size={14} weight="bold" />
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
