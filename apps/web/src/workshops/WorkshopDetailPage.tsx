import { useState } from "react";
import type {
  WorkshopPublic,
  WorkshopSessionPublic,
  WorkshopViewer,
} from "@veolms/contracts";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CalendarCheckIcon as CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { LinkIcon as Link } from "@phosphor-icons/react/Link";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { DiscussionMarkdown } from "../learning/discussion-editor/DiscussionMarkdown";
import { getApiError } from "../lib/api-error";
import { buildLoginPath } from "../routing/routeAccess";
import type { NavigateTo } from "../routing/navigation";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
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
import { workshopEditPath } from "./WorkshopsAdminPage";
import { WORKSHOPS_PATH } from "./WorkshopsPage";
import {
  browserTimeZone,
  formatSessionDay,
  formatSessionTime,
  surfaceClass,
  timeZoneShortName,
} from "./workshopHelpers";
import { formatCountdown, JOIN_OPENS_MS, useNow } from "./useNow";

export interface WorkshopDetailPageProps {
  slug?: string | null;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const panelClass = `${surfaceClass} p-5 sm:p-6`;
const rowBorder =
  "border border-[color-mix(in_srgb,var(--text)_10%,transparent)]";

function whenLabel(session: WorkshopSessionPublic, timeZone: string): string {
  return `${formatSessionDay(session.startsAt, timeZone)} · ${formatSessionTime(
    session.startsAt,
    timeZone,
  )} – ${formatSessionTime(session.endsAt, timeZone)} ${timeZoneShortName(
    timeZone,
    new Date(session.startsAt),
  )}`;
}

/**
 * One workshop. The panel beside the title always offers the single thing
 * that makes sense now: when it starts, Join, the recording, or buying a
 * seat. Nobody registers; whoever it is for is in and has it in their
 * calendar from the invitation email.
 */
export function WorkshopDetailPage({
  slug,
  onNavigatePage,
  setNotice,
}: WorkshopDetailPageProps) {
  const { data: authUser, isFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const user = isFetched ? authUser : storeUser;
  const { can } = useCapabilities({ enabled: Boolean(user) });
  const workshopQuery = useWorkshopPublic(slug);
  const viewerQuery = useWorkshopViewer(slug, {
    enabled: Boolean(user),
    refetchInterval: workshopRefetchInterval(
      workshopQuery.data?.sessions ?? [],
    ),
  });
  const now = useNow();
  const timeZone = browserTimeZone();
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(
    null,
  );

  const workshop = workshopQuery.data;
  if (workshopQuery.isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1100px]">
        <CenteredLoadingSpinner
          label="Loading workshop"
          className="min-h-52 py-24"
        />
      </main>
    );
  }
  if (!workshop) {
    return (
      <main className="mx-auto grid w-full max-w-[1100px] gap-4">
        <div className={`${panelClass} grid place-items-center text-center`}>
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

  const viewer = viewerQuery.data;
  const isStaff = can("workshop.read") || can("workshop.manage");
  const upcoming = workshop.sessions.find(
    (session) => new Date(session.endsAt).getTime() > now,
  );
  const recordingSession = recordingSessionId
    ? workshop.sessions.find((session) => session.id === recordingSessionId)
    : undefined;
  const canWatch = Boolean(viewer?.canWatchRecordings);

  const openRecording = (session: WorkshopSessionPublic) => {
    if (session.recordingLessonPath) {
      onNavigatePage?.(session.recordingLessonPath);
      return;
    }
    setRecordingSessionId(session.id);
  };

  return (
    <main className="mx-auto grid w-full max-w-[1100px] gap-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          // Learners have no Workshops page in their menu: they come back
          // to their home, where the banner is.
          onClick={() => onNavigatePage?.(isStaff ? WORKSHOPS_PATH : "/")}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-(--muted) hover:text-(--text)"
        >
          <ArrowLeft size={16} weight="bold" />
          {isStaff ? "All workshops" : "Home"}
        </button>
        {can("workshop.manage") ? (
          <Button
            variant="quiet"
            elevation="flat"
            onClick={() => onNavigatePage?.(workshopEditPath(workshop.id))}
          >
            <PencilSimple size={15} />
            Edit workshop
          </Button>
        ) : null}
      </div>

      <section
        className={`${panelClass} grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start`}
      >
        <div className="flex min-w-0 gap-4">
          {workshop.coverUrl ? (
            <img
              src={workshop.coverUrl}
              alt=""
              className="hidden aspect-video w-44 shrink-0 rounded-xl object-cover sm:block"
            />
          ) : null}
          <div className="min-w-0">
            <p className="m-0 flex items-center gap-2 text-[12px] text-(--muted)">
              <WorkshopHostAvatar
                name={workshop.host.name}
                avatarUrl={workshop.host.avatarUrl}
                size={18}
              />
              {workshop.host.name}
              {workshop.courseTitle ? ` · ${workshop.courseTitle}` : ""}
            </p>
            <h1 className="m-0 mt-1 text-[clamp(1.5rem,2.2vw,1.9rem)] font-bold leading-tight tracking-[-0.03em] text-(--text)">
              {workshop.title}
            </h1>
            {workshop.summary ? (
              <p className="m-0 mt-1.5 text-[0.92rem] leading-6 text-(--muted)">
                {workshop.summary}
              </p>
            ) : null}
            {upcoming ? (
              <p className="m-0 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-(--text)">
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={15} className="text-(--muted)" />
                  {whenLabel(upcoming, timeZone)}
                </span>
                {viewer?.registered ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600">
                    <CalendarCheck size={15} weight="bold" />
                    You&apos;re in
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        <ActionPanel
          workshop={workshop}
          viewer={viewer}
          signedIn={Boolean(user)}
          upcoming={upcoming}
          now={now}
          onNavigatePage={onNavigatePage}
          setNotice={setNotice}
          onWatch={() => {
            const first = workshop.sessions.find(
              (session) => session.hasRecording,
            );
            if (first) openRecording(first);
          }}
        />
      </section>

      {recordingSession ? (
        <section className={panelClass}>
          <WorkshopRecordingPlayer
            workshopId={workshop.id}
            sessionId={recordingSession.id}
            title={
              recordingSession.title ??
              formatSessionDay(recordingSession.startsAt, timeZone)
            }
            onClose={() => setRecordingSessionId(null)}
          />
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className={panelClass} aria-labelledby="workshop-sessions">
          <h2
            id="workshop-sessions"
            className="m-0 text-base font-bold tracking-tight text-(--text)"
          >
            {workshop.sessions.length === 1
              ? "Session"
              : `${workshop.sessions.length} sessions`}
          </h2>
          <ol className="m-0 mt-3 grid list-none gap-2 p-0">
            {workshop.sessions.map((session, index) => (
              <SessionRow
                key={session.id}
                workshopId={workshop.id}
                session={session}
                index={index}
                viewer={viewer}
                canWatch={canWatch}
                now={now}
                timeZone={timeZone}
                onWatch={() => openRecording(session)}
              />
            ))}
          </ol>
        </section>

        {workshop.resources.length > 0 ? (
          <section className={panelClass} aria-labelledby="workshop-resources">
            <h2
              id="workshop-resources"
              className="m-0 text-base font-bold tracking-tight text-(--text)"
            >
              Resources
            </h2>
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {workshop.resources.map((resource) => (
                <li key={resource.url}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-(--text) hover:border-(--accent) ${rowBorder}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Link size={15} className="shrink-0 text-(--muted)" />
                      <span className="truncate">{resource.title}</span>
                    </span>
                    <ArrowSquareOut
                      size={15}
                      className="shrink-0 text-(--muted)"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {workshop.description ? (
        <section className={panelClass} aria-labelledby="workshop-about">
          <h2
            id="workshop-about"
            className="m-0 text-base font-bold tracking-tight text-(--text)"
          >
            About this workshop
          </h2>
          <div className="mt-3">
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
    </main>
  );
}

function SessionRow({
  workshopId,
  session,
  index,
  viewer,
  canWatch,
  now,
  timeZone,
  onWatch,
}: {
  workshopId: string;
  session: WorkshopSessionPublic;
  index: number;
  viewer: WorkshopViewer | undefined;
  canWatch: boolean;
  now: number;
  timeZone: string;
  onWatch: () => void;
}) {
  const starts = new Date(session.startsAt).getTime();
  const ends = new Date(session.endsAt).getTime();
  const joinable = viewer?.joinable.find(
    (entry) => entry.sessionId === session.id,
  );
  let right: React.ReactNode;
  if (now >= ends) {
    right =
      session.hasRecording && canWatch ? (
        <button
          type="button"
          onClick={onWatch}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-(--accent) hover:underline"
        >
          <PlayCircle size={16} weight="fill" />
          {session.recordingLessonPath ? "Watch in course" : "Watch recording"}
        </button>
      ) : (
        <span className="text-[12px] text-(--muted)">
          {session.hasRecording ? "Recording available" : "Ended"}
        </span>
      );
  } else if (joinable) {
    right = (
      <WorkshopJoinButton
        workshopId={workshopId}
        joinable={joinable}
        size="sm"
        label={now >= starts ? "Join now" : "Join"}
      />
    );
  } else {
    right = (
      <span className="text-[12px] text-(--muted)">
        {now >= starts
          ? "Live now"
          : `Starts ${formatCountdown(session.startsAt, now)}`}
      </span>
    );
  }
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-3 ${rowBorder}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-xs font-bold text-(--accent)">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-(--text)">
            {session.title ?? `Session ${index + 1}`}
          </p>
          <p className="m-0 text-[12px] text-(--muted)">
            {whenLabel(session, timeZone)}
          </p>
        </div>
      </div>
      {right}
    </li>
  );
}

/** The one thing to do now, and the quiet "not going" switch. */
function ActionPanel({
  workshop,
  viewer,
  signedIn,
  upcoming,
  now,
  onNavigatePage,
  setNotice,
  onWatch,
}: {
  workshop: WorkshopPublic;
  viewer: WorkshopViewer | undefined;
  signedIn: boolean;
  upcoming: WorkshopSessionPublic | undefined;
  now: number;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
  onWatch: () => void;
}) {
  const going = useRegisterForWorkshop();
  const notGoing = useUnregisterFromWorkshop();
  const [error, setError] = useState<string | null>(null);
  const busy = going.isPending || notGoing.isPending;

  const act = (run: () => Promise<unknown>, done: string) => {
    setError(null);
    void run()
      .then(() => setNotice?.(done))
      .catch((caught: unknown) =>
        setError(
          getApiError(caught)?.message ?? "That did not work. Try again.",
        ),
      );
  };

  const frame = (children: React.ReactNode) => (
    <div className={`grid gap-2.5 rounded-xl bg-(--canvas) p-4 ${rowBorder}`}>
      {children}
      {error ? (
        <p className="m-0 text-[13px] text-rose-500" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  if (workshop.status === "cancelled") {
    return frame(
      <>
        <p className="m-0 text-sm font-semibold text-rose-500">
          This workshop was cancelled
        </p>
        {workshop.cancelReason ? (
          <p className="m-0 text-[13px] text-(--muted)">
            {workshop.cancelReason}
          </p>
        ) : null}
      </>,
    );
  }

  if (!upcoming) {
    const hasRecording = workshop.sessions.some(
      (session) => session.hasRecording,
    );
    return frame(
      hasRecording && viewer?.canWatchRecordings ? (
        <Button onClick={onWatch} className="w-full">
          <PlayCircle size={17} weight="fill" />
          Watch the recording
        </Button>
      ) : (
        <>
          <p className="m-0 text-sm font-semibold text-(--text)">
            This workshop has ended
          </p>
          <p className="m-0 text-[13px] text-(--muted)">
            {hasRecording
              ? "The recording is for its attendees."
              : "The recording appears here once the host adds it."}
          </p>
        </>
      ),
    );
  }

  if (!signedIn) {
    // Signing in happens in the pop-up over this page, and a new visitor's
    // account is made there too, so "Join for free" is the whole step for
    // a free workshop open to everyone.
    const openToAll = !workshop.courseId;
    const free = !workshop.priceMinor;
    return frame(
      <>
        <Button
          className="w-full"
          onClick={() =>
            onNavigatePage?.(
              buildLoginPath(`${WORKSHOPS_PATH}/${workshop.slug}`, "workshop"),
            )
          }
        >
          {openToAll && free
            ? "Join for free"
            : openToAll
              ? "Get your seat"
              : "Sign in to join"}
        </Button>
        <p className="m-0 text-[13px] text-(--muted)">
          {openToAll
            ? "Your email or phone and a code. New here? Your account is made in the same step."
            : "You'll come back here after signing in."}
        </p>
      </>,
    );
  }

  if (!viewer) {
    return frame(
      <CenteredLoadingSpinner label="Checking your seat" className="py-4" />,
    );
  }

  if (viewer.reason === "full") {
    return frame(
      <p className="m-0 text-sm font-semibold text-(--text)">Sold out</p>,
    );
  }

  if (viewer.reason === "payment_required") {
    return frame(
      <WorkshopPayButton
        workshop={workshop}
        onRegistered={() =>
          setNotice?.("You're in. The invitation is on its way to your email.")
        }
      />,
    );
  }

  if (viewer.reason === "course_required") {
    return frame(
      <>
        <p className="m-0 text-sm font-semibold text-(--text)">
          For learners of {workshop.courseTitle ?? "its course"}
        </p>
        {workshop.courseSlug ? (
          <Button
            variant="quiet"
            elevation="flat"
            className="w-full"
            onClick={() => onNavigatePage?.(`/courses/${workshop.courseSlug}`)}
          >
            View the course
          </Button>
        ) : null}
      </>,
    );
  }

  if (viewer.declined) {
    return frame(
      <>
        <p className="m-0 text-sm font-semibold text-(--text)">
          You said you&apos;re not going
        </p>
        <p className="m-0 text-[13px] text-(--muted)">
          You won&apos;t get reminders. You can still join if plans change.
        </p>
        <Button
          variant="quiet"
          elevation="flat"
          className="w-full"
          disabled={busy}
          onClick={() =>
            act(
              () =>
                going.mutateAsync({
                  workshopId: workshop.id,
                  slug: workshop.slug,
                }),
              "Good to have you back. Reminders are on again.",
            )
          }
        >
          I&apos;m going after all
        </Button>
      </>,
    );
  }

  const joinable = viewer.joinable.find(
    (entry) => entry.sessionId === upcoming.id,
  );
  const startsAt = new Date(upcoming.startsAt).getTime();
  const opensIn = formatCountdown(
    new Date(startsAt - JOIN_OPENS_MS).toISOString(),
    now,
  );
  return frame(
    <>
      {joinable ? (
        <WorkshopJoinButton
          workshopId={workshop.id}
          joinable={joinable}
          label={now >= startsAt ? "Join now" : "Join"}
        />
      ) : (
        <div className="grid gap-0.5">
          <p className="m-0 text-base font-bold text-(--text)">
            Starts {formatCountdown(upcoming.startsAt, now)}
          </p>
          <p className="m-0 text-[13px] text-(--muted)">
            Join opens here {opensIn === "now" ? "any moment" : opensIn}, 15
            minutes before the start.
          </p>
        </div>
      )}
      <button
        type="button"
        className="cursor-pointer justify-self-start text-[13px] font-medium text-(--muted) hover:text-(--text) disabled:opacity-50"
        disabled={busy}
        onClick={() =>
          act(
            () =>
              notGoing.mutateAsync({
                workshopId: workshop.id,
                slug: workshop.slug,
              }),
            "Noted. No more reminders for this workshop.",
          )
        }
      >
        Can&apos;t make it? I&apos;m not going
      </button>
    </>,
  );
}
