import { useMemo, useState } from "react";
import type {
  WorkshopPublicListItem,
  WorkshopStandingsResponse,
} from "@veolms/contracts";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import {
  useWorkshopStandings,
  useWorkshopsPublic,
} from "../services/workshops";
import { useAuthStore } from "../store/auth.store";
import {
  browserTimeZone,
  formatSessionTime,
  formatWorkshopPrice,
  surfaceClass,
  timeZoneShortName,
  workshopJoinUrl,
} from "./workshopHelpers";
import { formatCountdown, JOIN_OPENS_MS, useNow } from "./useNow";

export const WORKSHOPS_PATH = "/workshops";

export interface WorkshopsPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

type Standing = WorkshopStandingsResponse["items"][number] | undefined;

function dayParts(iso: string, timeZone: string) {
  const date = new Date(iso);
  return {
    day: new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone }).format(
      date,
    ),
    month: new Intl.DateTimeFormat("en-IN", {
      month: "short",
      timeZone,
    }).format(date),
    weekday: new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      timeZone,
    }).format(date),
  };
}

/** Today, Tomorrow, This week, Later: the agenda's groups. */
function groupOf(iso: string, now: number, timeZone: string): string {
  const key = (value: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(value));
  const day = key(new Date(iso).getTime());
  if (day <= key(now)) return "Today";
  if (day === key(now + 86_400_000)) return "Tomorrow";
  if (new Date(iso).getTime() - now < 7 * 86_400_000) return "This week";
  return "Later";
}

function DateBlock({
  iso,
  timeZone,
  live,
}: {
  iso: string;
  timeZone: string;
  live?: boolean;
}) {
  const parts = dayParts(iso, timeZone);
  return (
    <div
      className={`flex w-14 shrink-0 flex-col items-center rounded-xl border py-1.5 ${
        live
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--canvas)"
      }`}
      aria-hidden="true"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-(--muted)">
        {parts.weekday}
      </span>
      <span className="text-lg font-bold leading-tight text-(--text)">
        {parts.day}
      </span>
      <span className="text-[11px] text-(--muted)">{parts.month}</span>
    </div>
  );
}

/** What the learner can do with a workshop right now, as one short label. */
function StandingBadge({
  workshop,
  standing,
  signedIn,
}: {
  workshop: WorkshopPublicListItem;
  standing: Standing;
  signedIn: boolean;
}) {
  if (standing?.attending) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
        <CalendarCheck size={13} weight="bold" />
        You&apos;re in
      </span>
    );
  }
  if (standing?.declined) {
    return (
      <span className="rounded-full bg-(--canvas) px-2.5 py-1 text-[11px] font-semibold text-(--muted)">
        Not going
      </span>
    );
  }
  if (workshop.courseId && (!signedIn || !standing?.attending)) {
    return (
      <span className="rounded-full bg-(--canvas) px-2.5 py-1 text-[11px] font-semibold text-(--muted)">
        {workshop.courseTitle ? `For ${workshop.courseTitle}` : "Course only"}
      </span>
    );
  }
  if (workshop.priceMinor) {
    return (
      <span className="rounded-full bg-(--accent)/12 px-2.5 py-1 text-[11px] font-semibold text-(--accent)">
        {formatWorkshopPrice(workshop.priceMinor, workshop.currency)}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-(--canvas) px-2.5 py-1 text-[11px] font-semibold text-(--muted)">
      Free
    </span>
  );
}

/**
 * Learners' workshops: the one coming up next, with the action that matters
 * now, then the rest as a short agenda grouped by day. Nobody registers:
 * whoever a workshop is for is in, and it is already in their calendar.
 */
export function WorkshopsPage({ onNavigatePage }: WorkshopsPageProps) {
  const { data: authUser, isFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const user = isFetched ? authUser : storeUser;
  const workshops = useWorkshopsPublic();
  const standings = useWorkshopStandings({ enabled: Boolean(user) });
  const [tab, setTab] = useState<"upcoming" | "recordings">("upcoming");
  const now = useNow();
  const timeZone = browserTimeZone();

  const standingOf = useMemo(() => {
    const map = new Map(
      (standings.data?.items ?? []).map((item) => [item.workshopId, item]),
    );
    return (id: string): Standing => map.get(id);
  }, [standings.data]);

  const upcoming = workshops.data?.upcoming ?? [];
  const past = workshops.data?.past ?? [];
  // The hero: the next workshop the learner is in, else the next of all.
  const featured =
    upcoming.find((item) => standingOf(item.id)?.attending) ?? upcoming[0];
  const rest = upcoming.filter((item) => item.id !== featured?.id);

  const groups = useMemo(() => {
    const map = new Map<string, WorkshopPublicListItem[]>();
    for (const item of rest) {
      const group = item.nextSessionAt
        ? groupOf(item.nextSessionAt, now, timeZone)
        : "Later";
      map.set(group, [...(map.get(group) ?? []), item]);
    }
    return [...map.entries()];
  }, [rest, now, timeZone]);

  const open = (item: WorkshopPublicListItem) =>
    onNavigatePage?.(`${WORKSHOPS_PATH}/${item.slug}`);

  if (workshops.isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1100px]">
        <CenteredLoadingSpinner
          label="Loading workshops"
          className="min-h-52 py-24"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-[1100px] gap-6">
      <header className="border-b border-(--border) pt-2 pb-4.5 sm:pt-0 sm:pb-6">
        <h1 className="m-0 text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)">
          Workshops
        </h1>
        <p className="mt-1.5 mb-0 text-[0.88rem] leading-6 text-(--muted)">
          Live sessions with the instructors, added to your calendar for you.
        </p>
      </header>

      {featured ? (
        <FeaturedWorkshop
          workshop={featured}
          standing={standingOf(featured.id)}
          signedIn={Boolean(user)}
          now={now}
          timeZone={timeZone}
          onOpen={() => open(featured)}
        />
      ) : null}

      <section className={`${surfaceClass} p-2 sm:p-3`}>
        <div className="flex gap-1 p-1" role="tablist">
          {(
            [
              ["upcoming", `Upcoming${rest.length ? ` ${rest.length}` : ""}`],
              ["recordings", "Past and recordings"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
                tab === value
                  ? "bg-(--surface-strong) text-(--text)"
                  : "text-(--muted) hover:text-(--text)"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "upcoming" ? (
          rest.length === 0 ? (
            <EmptyState
              text={
                featured
                  ? "Nothing else is scheduled yet."
                  : "No workshops are scheduled yet. New ones appear here and in your calendar."
              }
            />
          ) : (
            groups.map(([group, items]) => (
              <div key={group} className="mt-2">
                <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-(--muted)">
                  {group}
                </p>
                <ul className="grid">
                  {items.map((item) => (
                    <AgendaRow
                      key={item.id}
                      workshop={item}
                      standing={standingOf(item.id)}
                      signedIn={Boolean(user)}
                      timeZone={timeZone}
                      onOpen={() => open(item)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )
        ) : past.length === 0 ? (
          <EmptyState text="Past workshops and their recordings appear here." />
        ) : (
          <ul className="mt-2 grid">
            {past.map((item) => (
              <AgendaRow
                key={item.id}
                workshop={item}
                standing={standingOf(item.id)}
                signedIn={Boolean(user)}
                timeZone={timeZone}
                past
                onOpen={() => open(item)}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid place-items-center gap-2 px-4 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
        <VideoConference size={22} weight="duotone" />
      </span>
      <p className="m-0 max-w-sm text-sm text-(--muted)">{text}</p>
    </div>
  );
}

function FeaturedWorkshop({
  workshop,
  standing,
  signedIn,
  now,
  timeZone,
  onOpen,
}: {
  workshop: WorkshopPublicListItem;
  standing: Standing;
  signedIn: boolean;
  now: number;
  timeZone: string;
  onOpen: () => void;
}) {
  const startsAt = workshop.nextSessionAt;
  const live = workshop.state === "live";
  const joinOpen =
    standing?.attending &&
    workshop.nextSessionId &&
    startsAt &&
    new Date(startsAt).getTime() - now <= JOIN_OPENS_MS &&
    (!workshop.nextSessionEndsAt ||
      new Date(workshop.nextSessionEndsAt).getTime() > now);

  return (
    <section
      aria-labelledby="featured-workshop"
      className={`${surfaceClass} flex flex-wrap items-center gap-4 p-4 sm:p-5 ${
        live ? "ring-1 ring-emerald-500/40" : ""
      }`}
    >
      {startsAt ? (
        <DateBlock iso={startsAt} timeZone={timeZone} live={live} />
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <p
          className={`m-0 text-[11px] font-bold uppercase tracking-wider ${
            live ? "text-emerald-600" : "text-(--muted)"
          }`}
        >
          {live
            ? "Live now"
            : standing?.attending
              ? "Your next workshop"
              : "Coming up"}
        </p>
        <h2
          id="featured-workshop"
          className="m-0 mt-0.5 truncate text-lg font-bold tracking-tight text-(--text)"
        >
          {workshop.title}
        </h2>
        {startsAt ? (
          <p className="m-0 mt-0.5 text-[13px] text-(--muted)">
            {formatSessionTime(startsAt, timeZone)}{" "}
            {timeZoneShortName(timeZone, new Date(startsAt))} ·{" "}
            {workshop.host.name}
            {!live ? ` · starts ${formatCountdown(startsAt, now)}` : ""}
          </p>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {joinOpen ? (
          <a
            href={workshopJoinUrl(workshop.id, workshop.nextSessionId!)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <VideoCamera size={17} weight="fill" />
            Join now
          </a>
        ) : (
          <>
            <StandingBadge
              workshop={workshop}
              standing={standing}
              signedIn={signedIn}
            />
            <Button onClick={onOpen} variant="quiet" elevation="flat">
              Open
              <ArrowRight size={15} weight="bold" />
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function AgendaRow({
  workshop,
  standing,
  signedIn,
  timeZone,
  past,
  onOpen,
}: {
  workshop: WorkshopPublicListItem;
  standing: Standing;
  signedIn: boolean;
  timeZone: string;
  past?: boolean;
  onOpen: () => void;
}) {
  const at = workshop.nextSessionAt ?? workshop.lastSessionEndsAt;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-(--hover)"
      >
        {at ? <DateBlock iso={at} timeZone={timeZone} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-(--text)">
            {workshop.title}
          </span>
          <span className="block truncate text-[12px] text-(--muted)">
            {at && !past
              ? `${formatSessionTime(at, timeZone)} ${timeZoneShortName(timeZone, new Date(at))}`
              : "Ended"}
            {workshop.sessionCount > 1
              ? ` · ${workshop.sessionCount} sessions`
              : ""}
            {` · ${workshop.host.name}`}
          </span>
        </span>
        {past ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-(--accent)">
            <PlayCircle size={15} weight="fill" />
            Open
          </span>
        ) : (
          <StandingBadge
            workshop={workshop}
            standing={standing}
            signedIn={signedIn}
          />
        )}
      </button>
    </li>
  );
}
