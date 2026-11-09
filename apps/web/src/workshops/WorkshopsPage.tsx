import { useState } from "react";
import type { WorkshopPublicListItem } from "@veolms/contracts";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { Button } from "../components/Button";
import type { NavigateTo } from "../routing/navigation";
import { useWorkshopsPublic } from "../services/workshops";
import { WorkshopPublicCard } from "./WorkshopPublicCard";
import { browserTimeZone, surfaceClass } from "./workshopHelpers";

export const WORKSHOPS_PATH = "/workshops";

export interface WorkshopsPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

function CardSkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="animate-pulse overflow-hidden rounded-2xl bg-(--canvas)"
        >
          <div className="aspect-video w-full bg-[color-mix(in_srgb,var(--text)_6%,transparent)]" />
          <div className="grid gap-2 p-4">
            <div className="h-4 w-3/4 rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)]" />
            <div className="h-3 w-full rounded bg-[color-mix(in_srgb,var(--text)_6%,transparent)]" />
            <div className="h-3 w-1/2 rounded bg-[color-mix(in_srgb,var(--text)_6%,transparent)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The learner's Workshops page: what is coming up, then what has ended. */
export function WorkshopsPage({ onNavigatePage }: WorkshopsPageProps) {
  const list = useWorkshopsPublic();
  const [showPast, setShowPast] = useState(false);
  const timeZone = browserTimeZone();

  const open = (workshop: WorkshopPublicListItem) =>
    onNavigatePage?.(`${WORKSHOPS_PATH}/${workshop.slug}`);

  const upcoming = list.data?.upcoming ?? [];
  const past = list.data?.past ?? [];

  return (
    <main
      className="mx-auto grid w-full max-w-[1800px] gap-6"
      aria-labelledby="workshops-title"
    >
      <header className="border-b border-(--border) pt-2 pb-4.5 sm:pt-0 sm:pb-7">
        <h1
          id="workshops-title"
          className="text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)"
        >
          Workshops
        </h1>
        <p className="mt-1.5 max-w-2xl text-[0.88rem] leading-6 text-(--muted)">
          Live sessions with the instructors. Register once, get a reminder
          before each session, and join from the workshop page.
        </p>
      </header>

      {list.isError ? (
        <section
          className={`${surfaceClass} grid place-items-center p-10 text-center`}
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <VideoConference size={24} weight="bold" />
          </span>
          <h2 className="mt-3 text-base font-semibold">
            Could not load workshops
          </h2>
          <p className="mt-1 max-w-sm text-sm text-(--muted)">
            {list.error?.message || "Try again in a moment."}
          </p>
          <div className="mt-4">
            <Button onClick={() => void list.refetch()}>Retry</Button>
          </div>
        </section>
      ) : list.isLoading ? (
        <CardSkeletons />
      ) : upcoming.length === 0 && past.length === 0 ? (
        <section
          className={`${surfaceClass} grid place-items-center p-10 text-center`}
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
            <VideoConference size={24} weight="duotone" />
          </span>
          <h2 className="mt-3 text-base font-semibold">
            No workshops scheduled yet
          </h2>
          <p className="mt-1 max-w-sm text-sm text-(--muted)">
            When a live session is announced it appears here. Check back soon.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="workshops-upcoming" className="grid gap-4">
            <h2
              id="workshops-upcoming"
              className="text-base font-bold tracking-tight text-(--text) sm:text-lg"
            >
              Upcoming
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-(--muted)">
                Nothing scheduled right now. Past workshops are below.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {upcoming.map((workshop) => (
                  <WorkshopPublicCard
                    key={workshop.id}
                    workshop={workshop}
                    timeZone={timeZone}
                    onOpen={open}
                  />
                ))}
              </div>
            )}
          </section>

          {past.length > 0 ? (
            <section aria-labelledby="workshops-past" className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="workshops-past"
                  className="text-base font-bold tracking-tight text-(--text) sm:text-lg"
                >
                  Past workshops
                </h2>
                <Button
                  variant="quiet"
                  elevation="flat"
                  onClick={() => setShowPast((v) => !v)}
                >
                  {showPast ? "Hide" : `Show ${past.length}`}
                </Button>
              </div>
              {showPast ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {past.map((workshop) => (
                    <WorkshopPublicCard
                      key={workshop.id}
                      workshop={workshop}
                      timeZone={timeZone}
                      onOpen={open}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
