import { useState } from "react";
import type { WorkshopHomeCard } from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { NavigateTo } from "../../routing/navigation";
import { useWorkshopHomeCard } from "../../services/workshops";
import {
  browserTimeZone,
  formatSessionDay,
  formatSessionTime,
  formatWorkshopPrice,
  timeZoneShortName,
} from "../../workshops/workshopHelpers";

function headline(card: WorkshopHomeCard): string {
  if (card.state === "live") return "Live now";
  if (card.state === "join_open") return "Starting in a few minutes";
  return card.registered ? "Your next workshop" : "Upcoming workshop";
}

/**
 * A closed banner stays closed for that session until it can be joined:
 * then it comes back once with Join now, the one moment it must not miss.
 */
function dismissKey(card: WorkshopHomeCard, joinable: boolean): string {
  return `veolms:workshop-banner:${card.slug}:${card.startsAt}:${joinable ? "join" : "soon"}`;
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * The learner's next workshop as a small banner at the top of their home,
 * in the look of the app's notices, with a close button. Learners have no
 * Workshops menu: this banner, the invitation email and the calendar entry
 * are how they find a workshop. Nothing when there is nothing upcoming.
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
  const joinable = Boolean(
    card?.registered && card.state !== "upcoming" && card.state !== "ended",
  );
  const key = card ? dismissKey(card, joinable) : "";
  const [closedKey, setClosedKey] = useState<string | null>(null);
  if (!card || closedKey === key || readDismissed(key)) return null;

  const timeZone = browserTimeZone();
  const href = `/workshops/${card.slug}`;
  const close = () => {
    setClosedKey(key);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Closed for this visit only.
    }
  };

  return (
    <section
      aria-labelledby="learner-home-workshop"
      className="mx-auto w-full max-w-2xl min-w-0"
    >
      <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] py-2.5 pr-2 pl-3 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-1 ${
            joinable ? "bg-emerald-500" : "bg-(--accent)"
          }`}
        />
        <span
          className={`ml-1 flex size-9 shrink-0 items-center justify-center rounded-lg ${
            joinable
              ? "bg-emerald-500/15 text-emerald-600"
              : "bg-(--accent)/12 text-(--accent)"
          }`}
        >
          <VideoConference size={19} weight="duotone" />
        </span>
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            onNavigatePage(href);
          }}
          className="min-w-0 flex-1"
        >
          <p
            id="learner-home-workshop"
            className={`text-[10.5px] font-bold uppercase tracking-wider ${
              joinable ? "text-emerald-600" : "text-(--muted)"
            }`}
          >
            {headline(card)}
          </p>
          <p className="truncate text-sm font-semibold text-(--text)">
            {card.title}
          </p>
          <p className="truncate text-xs text-(--muted)">
            {formatSessionDay(card.startsAt, timeZone)} ·{" "}
            {formatSessionTime(card.startsAt, timeZone)} –{" "}
            {formatSessionTime(card.endsAt, timeZone)}{" "}
            {timeZoneShortName(timeZone, new Date(card.startsAt))}
            {!card.registered && card.priceMinor
              ? ` · ${formatWorkshopPrice(card.priceMinor, card.currency)}`
              : ""}
          </p>
        </a>
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            onNavigatePage(href);
          }}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold ${
            joinable
              ? "bg-emerald-600 text-white"
              : "bg-(--accent) text-(--on-accent)"
          }`}
        >
          {joinable ? "Join now" : "Details"}
          <ArrowRight size={14} weight="bold" />
        </a>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) hover:bg-(--hover) hover:text-(--text)"
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </section>
  );
}
