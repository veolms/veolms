import type { WorkshopHomeCard } from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import type { NavigateTo } from "../../routing/navigation";
import { useWorkshopHomeCard } from "../../services/workshops";
import {
  browserTimeZone,
  formatSessionDay,
  formatSessionTime,
  formatWorkshopPrice,
  surfaceClass,
  timeZoneShortName,
} from "../../workshops/workshopHelpers";

function headline(card: WorkshopHomeCard): string {
  if (card.state === "live") return "Live now";
  if (card.state === "join_open") return "Starting in a few minutes";
  return card.registered ? "Your next workshop" : "Upcoming workshop";
}

/**
 * One line on the learner's home for the workshop that matters most: the
 * next session they are registered for (with Join when it is open), or
 * the soonest workshop they could still register for. Nothing when there
 * is nothing upcoming.
 */
export function LearnerWorkshopCard({
  enabled,
  onNavigatePage,
}: {
  enabled: boolean;
  onNavigatePage: NavigateTo;
}) {
  const query = useWorkshopHomeCard({ enabled });
  const card = query.data;
  if (!card) return null;
  const timeZone = browserTimeZone();
  const joinable =
    card.registered && card.state !== "upcoming" && card.state !== "ended";
  const href = `/workshops/${card.slug}`;
  return (
    <section aria-labelledby="learner-home-workshop" className="min-w-0">
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onNavigatePage(href);
        }}
        className={`${surfaceClass} group flex flex-wrap items-center gap-4 p-4 transition hover:bg-(--hover) sm:p-5`}
      >
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
            joinable
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-(--accent)/10 text-(--accent)"
          }`}
        >
          <VideoConference size={22} weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id="learner-home-workshop"
            className={`text-[11px] font-bold uppercase tracking-wider ${
              joinable ? "text-emerald-600" : "text-(--muted)"
            }`}
          >
            {headline(card)}
          </p>
          <p className="truncate text-base font-bold tracking-tight text-(--text)">
            {card.title}
          </p>
          <p className="text-[13px] text-(--muted)">
            {formatSessionDay(card.startsAt, timeZone)} ·{" "}
            {formatSessionTime(card.startsAt, timeZone)} –{" "}
            {formatSessionTime(card.endsAt, timeZone)}{" "}
            {timeZoneShortName(timeZone, new Date(card.startsAt))}
            {!card.registered && card.priceMinor
              ? ` · ${formatWorkshopPrice(card.priceMinor, card.currency)}`
              : ""}
          </p>
        </div>
        <span
          className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${
            joinable
              ? "bg-emerald-600 text-white"
              : "bg-(--accent) text-(--on-accent)"
          }`}
        >
          {joinable ? "Join now" : card.registered ? "Open" : "See details"}
          <ArrowRight size={16} weight="bold" />
        </span>
      </a>
    </section>
  );
}
