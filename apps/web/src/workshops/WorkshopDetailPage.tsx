import { useState } from "react";
import {
  googleCalendarUrl,
  type WorkshopPublic,
  type WorkshopViewer,
} from "@veolms/contracts";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CalendarPlusIcon as CalendarPlus } from "@phosphor-icons/react/CalendarPlus";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { LinkIcon as Link } from "@phosphor-icons/react/Link";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import { getApiError } from "../lib/api-error";
import { buildLoginPath } from "../routing/routeAccess";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import {
  useRegisterForWorkshop,
  useUnregisterFromWorkshop,
  useWorkshopPublic,
  useWorkshopViewer,
  workshopRefetchInterval,
} from "../services/workshops";
import { useAuthStore } from "../store/auth.store";
import { WorkshopHostAvatar } from "./WorkshopHostAvatar";
import { WorkshopJoinButton } from "./WorkshopJoinButton";
import { WorkshopPayButton } from "./WorkshopPayButton";
import { WorkshopRecordingPlayer } from "./WorkshopRecordingPlayer";
import { WORKSHOPS_PATH } from "./WorkshopsPage";
import {
  browserTimeZone,
  formatSessionDay,
  formatSessionTime,
  formatWorkshopPrice,
  publicStateClass,
  publicStateLabel,
  seatsLeftLabel,
  sessionStateLabel,
  surfaceClass,
  timeZoneShortName,
  workshopCalendarUrl,
} from "./workshopHelpers";

export interface WorkshopDetailPageProps {
  slug?: string | null;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

function RegisterPanel({
  workshop,
  viewer,
  signedIn,
  isBusy,
  onRegister,
  onUnregister,
  onSignIn,
  onPaid,
  onNavigatePage,
}: {
  workshop: WorkshopPublic;
  viewer: WorkshopViewer | undefined;
  signedIn: boolean;
  isBusy: boolean;
  onRegister: () => void;
  onUnregister: () => void;
  onSignIn: () => void;
  onPaid: () => void;
  onNavigatePage?: NavigateTo;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const reason: WorkshopViewer["reason"] = signedIn
    ? (viewer?.reason ?? "ok")
    : workshop.status === "cancelled"
      ? "cancelled"
      : workshop.state === "ended"
        ? "ended"
        : "sign_in";
  const seats = seatsLeftLabel(workshop.seatsLeft);
  const nextSession =
    workshop.sessions.find((session) => session.state !== "ended") ??
    workshop.sessions[0];
  const calendarLink = nextSession
    ? googleCalendarUrl({
        title: workshop.title,
        startsAt: nextSession.startsAt,
        endsAt: nextSession.endsAt,
        details: workshop.summary ?? undefined,
        location:
          typeof window !== "undefined" ? window.location.href : undefined,
      })
    : null;

  let body: React.ReactNode;
  switch (reason) {
    case "registered":
      body = (
        <div className="grid gap-3">
          {viewer?.joinable?.length ? (
            <div className="grid gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-(--text)">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                </span>
                {workshop.state === "live"
                  ? "The session is live"
                  : "Starting soon — you can join now"}
              </p>
              {viewer.joinable.map((entry) => (
                <WorkshopJoinButton
                  key={entry.sessionId}
                  workshopId={workshop.id}
                  joinable={entry}
                  label={
                    workshop.sessions.length > 1
                      ? `Join ${
                          workshop.sessions.find(
                            (session) => session.id === entry.sessionId,
                          )?.title ??
                          `session ${
                            workshop.sessions.findIndex(
                              (session) => session.id === entry.sessionId,
                            ) + 1
                          }`
                        }`
                      : "Join now"
                  }
                />
              ))}
            </div>
          ) : null}
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
            <CheckCircle size={18} weight="fill" />
            {viewer?.viaCourse
              ? "Included with your course"
              : "You're registered"}
          </p>
          <p className="text-[13px] leading-5 text-(--muted)">
            We&apos;ll remind you a day before and an hour before. The Join
            button appears here 15 minutes before each session starts, and this
            page refreshes on its own.
          </p>
          <div className="grid gap-2">
            {calendarLink ? (
              <a
                href={calendarLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-(--surface-strong) px-4 text-sm font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
              >
                <CalendarPlus size={16} />
                Add to Google Calendar
              </a>
            ) : null}
            <a
              href={workshopCalendarUrl(workshop.id)}
              download
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-(--surface-strong) px-4 text-sm font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
            >
              <DownloadSimple size={16} />
              Download calendar file (.ics)
            </a>
          </div>
          {viewer?.viaCourse ? null : confirmLeave ? (
            <div className="grid gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <p className="text-[13px] text-(--text)">
                Cancel your registration? You can register again while seats are
                left.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  disabled={isBusy}
                  onClick={onUnregister}
                >
                  Cancel registration
                </Button>
                <Button
                  variant="quiet"
                  elevation="flat"
                  disabled={isBusy}
                  onClick={() => setConfirmLeave(false)}
                >
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              disabled={isBusy}
              className="text-[13px] font-medium text-(--muted) hover:text-rose-500 cursor-pointer disabled:opacity-50"
            >
              Can&apos;t make it? Cancel registration
            </button>
          )}
        </div>
      );
      break;
    case "sign_in":
      body = (
        <div className="grid gap-3">
          <Button onClick={onSignIn} className="w-full">
            Sign in to register
          </Button>
          <p className="text-[13px] leading-5 text-(--muted)">
            {workshop.priceMinor
              ? formatWorkshopPrice(workshop.priceMinor, workshop.currency) +
                " per seat. You'll be back here after signing in."
              : "Registration is free. You'll be back here after signing in."}
          </p>
        </div>
      );
      break;
    case "course_required":
      body = (
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-(--text)">
            For learners of {workshop.courseTitle ?? "the course"}
          </p>
          <p className="text-[13px] leading-5 text-(--muted)">
            This workshop comes with the course. Enrol in the course and
            registration opens here.
          </p>
          {workshop.courseSlug ? (
            <Button
              variant="quiet"
              elevation="flat"
              onClick={() =>
                onNavigatePage?.(`/courses/${workshop.courseSlug}/overview`)
              }
            >
              Open the course
            </Button>
          ) : null}
        </div>
      );
      break;
    case "full":
      body = (
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-(--text)">No seats left</p>
          <p className="text-[13px] leading-5 text-(--muted)">
            Every seat is taken. If someone cancels, a seat opens here.
          </p>
        </div>
      );
      break;
    case "payment_required":
      body = <WorkshopPayButton workshop={workshop} onRegistered={onPaid} />;
      break;
    case "ended":
      body = (
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-(--text)">
            This workshop has ended
          </p>
          <p className="text-[13px] leading-5 text-(--muted)">
            {workshop.sessions.some((session) => session.hasRecording)
              ? "The recording is available below."
              : "The recording appears here once the host adds it."}
          </p>
        </div>
      );
      break;
    case "cancelled":
      body = (
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-rose-500">Cancelled</p>
          <p className="text-[13px] leading-5 text-(--muted)">
            {workshop.cancelReason ?? "This workshop was cancelled."}
          </p>
        </div>
      );
      break;
    default:
      body = (
        <div className="grid gap-3">
          <Button onClick={onRegister} disabled={isBusy} className="w-full">
            {isBusy ? "Registering…" : "Register"}
          </Button>
          <p className="text-[13px] leading-5 text-(--muted)">
            Free. You&apos;ll get a confirmation, reminders before each session,
            and the Join button here when it starts.
          </p>
        </div>
      );
  }

  return (
    <aside className={`${surfaceClass} grid gap-4 p-5 lg:sticky lg:top-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tracking-tight text-(--text)">
            {formatWorkshopPrice(workshop.priceMinor, workshop.currency)}
          </p>
          {seats && workshop.state !== "ended" ? (
            <p className="text-xs text-(--muted)">{seats}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${publicStateClass(workshop.state)}`}
        >
          {publicStateLabel(workshop.state)}
        </span>
      </div>
      {body}
      <p className="flex items-center gap-1.5 text-xs text-(--muted)">
        <Users size={14} />
        {workshop.registrationCount === 0
          ? "Be the first to register"
          : workshop.registrationCount === 1
            ? "1 learner registered"
            : `${workshop.registrationCount} learners registered`}
      </p>
    </aside>
  );
}

export function WorkshopDetailPage({
  slug,
  onNavigatePage,
  setNotice,
}: WorkshopDetailPageProps) {
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const user = authUserFetched ? authUser : storeUser;
  const signedIn = Boolean(user);
  const workshopQuery = useWorkshopPublic(slug);
  const viewerQuery = useWorkshopViewer(slug, {
    enabled: signedIn,
    refetchInterval: workshopRefetchInterval(
      workshopQuery.data?.sessions ?? [],
    ),
  });
  const registerMutation = useRegisterForWorkshop();
  const unregisterMutation = useUnregisterFromWorkshop();
  const [error, setError] = useState<string | null>(null);
  const timeZone = browserTimeZone();
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(
    null,
  );

  const workshop = workshopQuery.data;
  const recordingSession = recordingSessionId
    ? workshop?.sessions.find((session) => session.id === recordingSessionId)
    : undefined;

  if (workshopQuery.isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1320px]">
        <CenteredLoadingSpinner
          label="Loading workshop"
          className="min-h-52 py-24"
        />
      </main>
    );
  }
  if (!workshop) {
    return (
      <main className="mx-auto grid w-full max-w-[1320px] gap-4">
        <div
          className={`${surfaceClass} grid place-items-center p-10 text-center`}
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
            <VideoConference size={24} weight="duotone" />
          </span>
          <h2 className="mt-3 text-lg font-semibold">Workshop not found</h2>
          <p className="mt-1 max-w-md text-sm text-(--muted)">
            It may have been taken down, or the address is mistyped.
          </p>
          <div className="mt-4">
            <Button onClick={() => onNavigatePage?.(WORKSHOPS_PATH)}>
              All workshops
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const isBusy = registerMutation.isPending || unregisterMutation.isPending;
  const act = async (action: () => Promise<unknown>, notice: string) => {
    setError(null);
    try {
      await action();
      setNotice?.(notice);
    } catch (caught) {
      setError(getApiError(caught).message);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-[1800px] gap-6">
      <button
        type="button"
        onClick={() => onNavigatePage?.(WORKSHOPS_PATH)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-(--muted) hover:text-(--text) cursor-pointer"
      >
        <ArrowLeft size={16} weight="bold" />
        All workshops
      </button>

      <div className="grid w-full min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.38fr)]">
        <div className="grid min-w-0 gap-5">
          <section className={`${surfaceClass}`}>
            <div className="relative aspect-video w-full overflow-hidden bg-(--accent)/10">
              {workshop.coverUrl ? (
                <img
                  src={workshop.coverUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center text-(--accent)">
                  <VideoConference size={56} weight="duotone" />
                </div>
              )}
            </div>
            <div className="grid gap-4 p-5 sm:p-6">
              <div>
                <h1 className="text-[clamp(1.6rem,2.2vw,2rem)] font-bold leading-tight tracking-[-0.03em] text-(--text)">
                  {workshop.title}
                </h1>
                {workshop.summary ? (
                  <p className="mt-2 text-[15px] leading-6 text-(--muted)">
                    {workshop.summary}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-(--text-secondary,var(--muted))">
                <span className="flex items-center gap-2">
                  <WorkshopHostAvatar
                    name={workshop.host.name}
                    avatarUrl={workshop.host.avatarUrl}
                    size={28}
                  />
                  <span>
                    Hosted by{" "}
                    <span className="font-medium text-(--text)">
                      {workshop.host.name}
                    </span>
                  </span>
                </span>
                {workshop.courseTitle ? (
                  <span className="rounded-full bg-(--accent)/10 px-2.5 py-1 text-xs font-medium text-(--accent)">
                    For {workshop.courseTitle} learners
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500"
            >
              {error}
            </div>
          ) : null}

          <section
            className={`${surfaceClass} p-5 sm:p-6`}
            aria-labelledby="workshop-sessions"
          >
            <h2
              id="workshop-sessions"
              className="text-base font-bold tracking-tight text-(--text)"
            >
              {workshop.sessions.length === 1
                ? "Session"
                : `${workshop.sessions.length} sessions`}
            </h2>
            <p className="mt-0.5 text-xs text-(--muted)">
              Times are shown in your time zone ({timeZone.replace(/_/g, " ")}).
            </p>
            {recordingSession ? (
              <div className="mt-4">
                <WorkshopRecordingPlayer
                  workshopId={workshop.id}
                  sessionId={recordingSession.id}
                  title={
                    recordingSession.title ??
                    formatSessionDay(recordingSession.startsAt, timeZone)
                  }
                  onClose={() => setRecordingSessionId(null)}
                />
              </div>
            ) : null}
            <ol className="mt-4 grid gap-3">
              {workshop.sessions.map((session, index) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-xs font-bold text-(--accent)">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-(--text)">
                        {session.title ??
                          formatSessionDay(session.startsAt, timeZone)}
                      </p>
                      <p className="text-[13px] text-(--muted)">
                        {session.title
                          ? `${formatSessionDay(session.startsAt, timeZone)} · `
                          : ""}
                        {formatSessionTime(session.startsAt, timeZone)} –{" "}
                        {formatSessionTime(session.endsAt, timeZone)}{" "}
                        {timeZoneShortName(
                          timeZone,
                          new Date(session.startsAt),
                        )}
                      </p>
                    </div>
                  </div>
                  {(() => {
                    const joinable = (viewerQuery.data?.joinable ?? []).find(
                      (entry) => entry.sessionId === session.id,
                    );
                    if (session.hasRecording) {
                      if (
                        session.recordingLessonPath &&
                        viewerQuery.data?.canWatchRecordings
                      ) {
                        const lessonPath = session.recordingLessonPath;
                        return (
                          <a
                            href={lessonPath}
                            onClick={(event) => {
                              event.preventDefault();
                              onNavigatePage?.(lessonPath);
                            }}
                            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl bg-(--accent) px-3.5 text-[13px] font-semibold text-(--on-accent) shadow-sm transition hover:opacity-90"
                          >
                            <PlayCircle size={16} weight="fill" />
                            Watch in course
                          </a>
                        );
                      }
                      return viewerQuery.data?.canWatchRecordings ? (
                        <button
                          type="button"
                          onClick={() => setRecordingSessionId(session.id)}
                          className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl bg-(--accent) px-3.5 text-[13px] font-semibold text-(--on-accent) shadow-sm transition hover:opacity-90"
                        >
                          <PlayCircle size={16} weight="fill" />
                          Watch recording
                        </button>
                      ) : (
                        <span className="rounded-full bg-(--canvas) px-2.5 py-1 text-[11px] font-semibold text-(--muted)">
                          Recording for registrants
                        </span>
                      );
                    }
                    return joinable ? (
                      <WorkshopJoinButton
                        workshopId={workshop.id}
                        joinable={joinable}
                        size="sm"
                        label={session.state === "live" ? "Join now" : "Join"}
                      />
                    ) : (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          session.state === "live"
                            ? "bg-emerald-500 text-white"
                            : "bg-(--canvas) text-(--muted)"
                        }`}
                      >
                        {sessionStateLabel(session.state)}
                      </span>
                    );
                  })()}
                </li>
              ))}
            </ol>
          </section>

          {workshop.description ? (
            <section
              className={`${surfaceClass} p-5 sm:p-6`}
              aria-labelledby="workshop-about"
            >
              <h2
                id="workshop-about"
                className="text-base font-bold tracking-tight text-(--text)"
              >
                About this workshop
              </h2>
              <div className="mt-3 text-[15px] leading-7 text-(--text)">
                <DiscussionMarkdown
                  label="Workshop description"
                  content={{
                    format: "markdown",
                    markdown: workshop.description,
                    plainText: workshop.description,
                  }}
                />
              </div>
            </section>
          ) : null}

          {workshop.resources.length > 0 ? (
            <section
              className={`${surfaceClass} p-5 sm:p-6`}
              aria-labelledby="workshop-resources"
            >
              <h2
                id="workshop-resources"
                className="text-base font-bold tracking-tight text-(--text)"
              >
                Resources
              </h2>
              <ul className="mt-3 grid gap-2">
                {workshop.resources.map((resource) => (
                  <li key={resource.url}>
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3.5 py-3 text-sm font-medium text-(--text) hover:border-(--accent) hover:bg-(--accent)/5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Link size={16} className="shrink-0 text-(--muted)" />
                        <span className="truncate">{resource.title}</span>
                      </span>
                      <ArrowSquareOut
                        size={16}
                        className="shrink-0 text-(--muted)"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <RegisterPanel
          workshop={workshop}
          viewer={viewerQuery.data}
          signedIn={signedIn}
          isBusy={isBusy}
          onRegister={() =>
            void act(
              () =>
                registerMutation.mutateAsync({
                  workshopId: workshop.id,
                  slug: workshop.slug,
                }),
              "You're registered. A confirmation is on its way.",
            )
          }
          onUnregister={() =>
            void act(
              () =>
                unregisterMutation.mutateAsync({
                  workshopId: workshop.id,
                  slug: workshop.slug,
                }),
              "Registration cancelled.",
            )
          }
          onSignIn={() =>
            onNavigatePage?.(
              buildLoginPath(`${WORKSHOPS_PATH}/${workshop.slug}`),
            )
          }
          onPaid={() =>
            setNotice?.("You're registered. A confirmation is on its way.")
          }
          onNavigatePage={onNavigatePage}
        />
      </div>
    </main>
  );
}
