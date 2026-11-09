import type { WorkshopPublicListItem } from "@veolms/contracts";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { raisedCourseCardClasses } from "../components/cardElevation";
import { elevatedCardClasses } from "../components/ElevatedCard";
import { WorkshopHostAvatar } from "./WorkshopHostAvatar";
import {
  formatNextSession,
  formatWorkshopPrice,
  publicStateClass,
  publicStateLabel,
  seatsLeftLabel,
} from "./workshopHelpers";

export function WorkshopPublicCard({
  workshop,
  timeZone,
  onOpen,
}: {
  workshop: WorkshopPublicListItem;
  timeZone: string;
  onOpen: (workshop: WorkshopPublicListItem) => void;
}) {
  const seats = seatsLeftLabel(workshop.seatsLeft);
  return (
    <article
      className={`${elevatedCardClasses} ${raisedCourseCardClasses} flex h-full flex-col overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => onOpen(workshop)}
        className="flex h-full flex-col text-left cursor-pointer focus-visible:outline-none"
        aria-label={`Open ${workshop.title}`}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-(--accent)/10">
          {workshop.coverUrl ? (
            <img
              src={workshop.coverUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-(--accent)">
              <VideoConference size={36} weight="duotone" />
            </div>
          )}
          <span
            className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${publicStateClass(workshop.state)}`}
          >
            {publicStateLabel(workshop.state)}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="text-[15px] font-semibold leading-snug text-(--text)">
            {workshop.title}
          </h3>
          {workshop.summary ? (
            <p className="line-clamp-2 text-[13px] leading-5 text-(--muted)">
              {workshop.summary}
            </p>
          ) : null}
          <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-(--text-secondary,var(--muted))">
            <CalendarBlank size={14} className="shrink-0" />
            <span className="truncate">
              {formatNextSession(workshop.nextSessionAt, timeZone)}
              {workshop.sessionCount > 1
                ? ` · ${workshop.sessionCount} sessions`
                : ""}
            </span>
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] pt-3">
            <span className="flex min-w-0 items-center gap-2 text-xs text-(--muted)">
              <WorkshopHostAvatar
                name={workshop.host.name}
                avatarUrl={workshop.host.avatarUrl}
              />
              <span className="truncate">{workshop.host.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-(--text)">
              {seats && workshop.state !== "ended" ? (
                <span className="text-[11px] font-medium text-(--muted)">
                  {seats}
                </span>
              ) : null}
              {formatWorkshopPrice(workshop.priceMinor, workshop.currency)}
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}
