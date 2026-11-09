import type { WorkshopSessionAdmin } from "@veolms/contracts";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { Button } from "../components/Button";
import { ThemedDateTimePicker } from "../ThemedDateTimePicker";
import { ThemedSelect } from "../ThemedSelect";
import {
  DURATION_OPTIONS,
  durationMinutes,
  fieldClass,
  formatSessionTime,
  instantToWallValue,
  selectTriggerClass,
  sessionStateLabel,
  timeZoneOptions,
  wallValueToInstant,
} from "./workshopHelpers";

/** A session as the form holds it: a wall-clock start in its own zone. */
export interface SessionDraft {
  key: string;
  id?: string;
  title: string;
  /** "YYYY-MM-DDTHH:mm" in `timeZone`. */
  startsWall: string;
  durationMinutes: number;
  timeZone: string;
  joinUrl: string;
  passcode: string;
  state?: WorkshopSessionAdmin["state"];
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Tomorrow 7 PM in the zone, as a wall value. */
function defaultStartWall(timeZone: string, after?: SessionDraft): string {
  if (after?.startsWall) {
    const previous = wallValueToInstant(after.startsWall, after.timeZone);
    if (previous) {
      const next = new Date(previous.getTime() + 24 * 60 * 60 * 1000);
      return instantToWallValue(next.toISOString(), timeZone);
    }
  }
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const wall = instantToWallValue(tomorrow.toISOString(), timeZone);
  return `${wall.slice(0, 10)}T${pad(19)}:00`;
}

export function newSessionDraft(
  timeZone: string,
  after?: SessionDraft,
): SessionDraft {
  return {
    key: crypto.randomUUID(),
    title: "",
    startsWall: defaultStartWall(timeZone, after),
    durationMinutes: after?.durationMinutes ?? 90,
    timeZone: after?.timeZone ?? timeZone,
    joinUrl: "",
    passcode: "",
  };
}

export function sessionDraftFromAdmin(
  session: WorkshopSessionAdmin,
): SessionDraft {
  return {
    key: session.id,
    id: session.id,
    title: session.title ?? "",
    startsWall: instantToWallValue(session.startsAt, session.timeZone),
    durationMinutes: durationMinutes(session.startsAt, session.endsAt) || 90,
    timeZone: session.timeZone,
    joinUrl: session.joinUrl ?? "",
    passcode: session.passcode ?? "",
    state: session.state,
  };
}

/** The instants a draft names, or null while its start is not a date. */
export function sessionDraftInstants(
  draft: SessionDraft,
): { startsAt: Date; endsAt: Date } | null {
  const startsAt = wallValueToInstant(draft.startsWall, draft.timeZone);
  if (!startsAt) return null;
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + draft.durationMinutes * 60_000),
  };
}

function durationOptionsFor(minutes: number): readonly [string, string][] {
  const known = DURATION_OPTIONS.some(([value]) => Number(value) === minutes);
  return known
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, [String(minutes), `${minutes} minutes`]];
}

export function WorkshopSessionsField({
  sessions,
  onChange,
  disabled = false,
  defaultTimeZone,
}: {
  sessions: SessionDraft[];
  onChange: (sessions: SessionDraft[]) => void;
  disabled?: boolean;
  defaultTimeZone: string;
}) {
  const zones = timeZoneOptions();

  const update = (key: string, patch: Partial<SessionDraft>) =>
    onChange(
      sessions.map((session) =>
        session.key === key ? { ...session, ...patch } : session,
      ),
    );

  return (
    <div className="grid gap-4">
      {sessions.length === 0 ? (
        <p className="text-[13px] text-(--muted)">
          A workshop needs at least one session. Most have one; a bootcamp has a
          few on consecutive days.
        </p>
      ) : null}

      {sessions.map((session, index) => {
        const instants = sessionDraftInstants(session);
        return (
          <div
            key={session.key}
            className="grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,transparent)] p-3.5 sm:p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-(--accent)/12 text-[11px] font-bold text-(--accent)">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={session.title}
                  onChange={(event) =>
                    update(session.key, { title: event.target.value })
                  }
                  placeholder={
                    sessions.length > 1
                      ? `Day ${index + 1}`
                      : "Session title (optional)"
                  }
                  maxLength={160}
                  disabled={disabled}
                  aria-label={`Session ${index + 1} title`}
                  className="h-9 w-full min-w-0 rounded-lg border-0 bg-transparent px-1 text-sm font-semibold text-(--text) outline-none placeholder:font-normal placeholder:text-(--muted) focus:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {session.state ? (
                  <span className="hidden rounded-full bg-(--canvas) px-2 py-0.5 text-[11px] font-semibold text-(--muted) sm:inline-flex">
                    {sessionStateLabel(session.state)}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      sessions.filter((item) => item.key !== session.key),
                    )
                  }
                  disabled={disabled}
                  aria-label={`Remove session ${index + 1}`}
                  className="inline-flex size-9 items-center justify-center rounded-lg text-(--muted) hover:bg-rose-500/10 hover:text-rose-500 cursor-pointer disabled:opacity-50"
                >
                  <Trash size={17} />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-(--text-secondary,var(--muted))">
                  Starts
                </span>
                <ThemedDateTimePicker
                  id={`session-${session.key}-starts`}
                  value={session.startsWall}
                  onChange={(value) =>
                    update(session.key, { startsWall: value })
                  }
                  disabled={disabled}
                  ariaLabel={`Session ${index + 1} start`}
                  placeholder="dd/mm/yyyy --:--"
                  className="w-full"
                />
              </div>
              <div className="min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-(--text-secondary,var(--muted))">
                  Duration
                </span>
                <div className={`${fieldClass} flex w-full items-center`}>
                  <ThemedSelect
                    id={`session-${session.key}-duration`}
                    value={String(session.durationMinutes)}
                    onValueChange={(value) =>
                      update(session.key, { durationMinutes: Number(value) })
                    }
                    options={durationOptionsFor(session.durationMinutes)}
                    disabled={disabled}
                    ariaLabel={`Session ${index + 1} duration`}
                    triggerClassName={selectTriggerClass}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-(--text-secondary,var(--muted))">
                  Time zone
                </span>
                <div className={`${fieldClass} flex w-full items-center`}>
                  <ThemedSelect
                    id={`session-${session.key}-zone`}
                    value={session.timeZone}
                    onValueChange={(value) =>
                      update(session.key, { timeZone: value })
                    }
                    options={zones}
                    searchable
                    searchPlaceholder="Search time zones"
                    defaultLimit={8}
                    disabled={disabled}
                    ariaLabel={`Session ${index + 1} time zone`}
                    triggerClassName={selectTriggerClass}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)]">
              <div className="min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-(--text-secondary,var(--muted))">
                  Meeting link
                </span>
                <div className={`${fieldClass} flex w-full items-center gap-2`}>
                  <VideoCamera size={16} className="shrink-0 text-(--muted)" />
                  <input
                    type="url"
                    value={session.joinUrl}
                    onChange={(event) =>
                      update(session.key, { joinUrl: event.target.value })
                    }
                    placeholder="https://zoom.us/j/… or meet.google.com/…"
                    maxLength={2048}
                    disabled={disabled}
                    aria-label={`Session ${index + 1} meeting link`}
                    className="w-full min-w-0 border-0 bg-transparent outline-none"
                  />
                </div>
                <p className="mt-1 text-[12px] text-(--muted)">
                  Learners never see this address; the Join button opens it for
                  registrants from 15 minutes before the start.
                </p>
              </div>
              <div className="min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-(--text-secondary,var(--muted))">
                  Passcode (optional)
                </span>
                <input
                  type="text"
                  value={session.passcode}
                  onChange={(event) =>
                    update(session.key, { passcode: event.target.value })
                  }
                  placeholder="Shown next to Join"
                  maxLength={64}
                  disabled={disabled}
                  aria-label={`Session ${index + 1} passcode`}
                  className={`${fieldClass} w-full`}
                />
              </div>
            </div>

            {instants ? (
              <p className="text-[12px] text-(--muted)">
                Ends at{" "}
                {formatSessionTime(
                  instants.endsAt.toISOString(),
                  session.timeZone,
                )}
                {" · "}
                {session.timeZone.replace(/_/g, " ")}
              </p>
            ) : (
              <p className="text-[12px] text-rose-500">
                Pick a start date and time.
              </p>
            )}
          </div>
        );
      })}

      <div>
        <Button
          variant="quiet"
          elevation="flat"
          disabled={disabled || sessions.length >= 30}
          onClick={() =>
            onChange([
              ...sessions,
              newSessionDraft(defaultTimeZone, sessions[sessions.length - 1]),
            ])
          }
        >
          <Plus size={16} weight="bold" />
          {sessions.length === 0 ? "Add a session" : "Add another session"}
        </Button>
      </div>
    </div>
  );
}
