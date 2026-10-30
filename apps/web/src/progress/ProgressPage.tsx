import { LockKeyIcon as LockKey } from "@phosphor-icons/react/LockKey";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type {
  LearningCommunityLearner,
  LearningHistoryCourse,
  LearningHistoryDay,
} from "@veolms/contracts";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { ElevatedCard } from "../components/ElevatedCard";
import { PageHeading } from "../components/PageHeading";
import { EmptyState } from "../components/analytics/StatTiles";
import { getApiError } from "../lib/api-error";
import {
  useLearningCommunity,
  useLearningHistory,
} from "../services/learning-goals";
import { LearnerAvatar } from "./LearnerAvatar";
import { ProgressCalendar } from "./ProgressCalendar";
import { ProgressCommunity } from "./ProgressCommunity";
import { ProgressDayDetail } from "./ProgressDayDetail";
import { ProgressMonthFigures } from "./ProgressMonthFigures";
import { ProgressPageSkeleton } from "./ProgressPageSkeleton";
import { ProgressSharingSwitch } from "./ProgressSharingSwitch";
import { ProgressToday } from "./ProgressToday";
import { ProgressWeekBars } from "./ProgressWeekBars";
import {
  addDays,
  dayOfMonth,
  daysBetween,
  deviceToday,
  firstDayOf,
  lastDayOf,
  monthOf,
} from "./progressDates";
import { hairlineClasses, monthFigures } from "./progressFormat";
import { progressPageClasses } from "./progressLayout";

interface ProgressPageProps {
  /** Whose progress, from `/progress/:username`. The viewer's own without. */
  username?: string;
  onNavigatePage?: (path: string) => void;
  onNavigateBack?: () => void;
  setNotice?: (message: string) => void;
}

const quietLinkClasses =
  "inline-flex h-9 shrink-0 cursor-pointer items-center rounded-lg bg-(--text)/6 px-3.5 text-sm font-semibold text-(--text) transition-colors hover:bg-(--text)/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

/**
 * A learner's progress over time, in three cards: today and the last
 * seven days against the goal; a month, its figures, its calendar and
 * the chosen day with the courses it went to; and the members who share
 * theirs.
 *
 * It is the viewer's own unless the address names someone else, who must
 * have chosen to share (an admin can see anyone's).
 */
export function ProgressPage(props: ProgressPageProps) {
  // Another learner is another page: the month and the chosen day start over.
  return <ProgressView key={props.username ?? ""} {...props} />;
}

function ProgressView({
  username,
  onNavigatePage,
  onNavigateBack,
  setNotice,
}: ProgressPageProps) {
  const learnerUsername = username?.trim().toLowerCase() || null;
  // The device's day, until the answer says what day it is for the learner.
  const [deviceDay] = useState(deviceToday);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  // One request covers what the page opens on: this month and the last
  // seven days, with a day to spare either side for a learner whose
  // calendar is a day ahead of or behind this device's.
  const currentMonth = monthOf(deviceDay);
  const weekStart = addDays(deviceDay, -7);
  const monthStart = firstDayOf(currentMonth);
  const tomorrow = addDays(deviceDay, 1);
  const monthEnd = lastDayOf(currentMonth);
  const recent = useLearningHistory({
    username: learnerUsername,
    from: weekStart < monthStart ? weekStart : monthStart,
    to: tomorrow > monthEnd ? tomorrow : monthEnd,
  });

  const shownMonth = pickedMonth ?? currentMonth;
  const isCurrentMonth = shownMonth === currentMonth;
  const earlier = useLearningHistory(
    {
      username: learnerUsername,
      from: firstDayOf(shownMonth),
      to: lastDayOf(shownMonth),
    },
    { enabled: !isCurrentMonth && recent.isSuccess },
  );
  const community = useLearningCommunity({ enabled: recent.isSuccess });

  const monthData = isCurrentMonth ? recent.data : earlier.data;
  const { dayByDate, courseById } = useMemo(() => {
    const days = new Map<string, LearningHistoryDay>();
    const courses = new Map<string, LearningHistoryCourse>();
    for (const history of [recent.data, earlier.data]) {
      for (const day of history?.days ?? []) days.set(day.date, day);
      for (const course of history?.courses ?? []) {
        courses.set(course.id, course);
      }
    }
    return { dayByDate: days, courseById: courses };
  }, [recent.data, earlier.data]);

  if (recent.isPending) return <ProgressPageSkeleton />;

  if (!recent.data) {
    const error = getApiError(recent.error);
    const isPrivate = error.status === 403;
    const isMissing = error.status === 404;
    return (
      <main
        className={progressPageClasses}
        aria-labelledby="progress-page-title"
      >
        <PageHeading
          id="progress-page-title"
          title="Progress"
          description="A learner's days of learning and the goals they have met."
          onNavigateBack={onNavigateBack}
        />
        <ElevatedCard>
          <EmptyState
            icon={
              isPrivate ? (
                <LockKey size={20} weight="duotone" aria-hidden="true" />
              ) : (
                <WarningCircle size={20} weight="duotone" aria-hidden="true" />
              )
            }
            title={
              isPrivate
                ? "This progress is private"
                : isMissing
                  ? "Learner not found"
                  : "Progress could not be loaded"
            }
            message={
              isPrivate
                ? "This learner has not chosen to share their progress."
                : isMissing
                  ? "There is no learner at this address."
                  : error.message
            }
            action={
              isPrivate || isMissing ? (
                learnerUsername ? (
                  <Button
                    motion="static"
                    className="h-9 text-xs"
                    onClick={() => onNavigatePage?.("/progress")}
                  >
                    See your progress
                  </Button>
                ) : undefined
              ) : (
                <Button
                  motion="static"
                  className="h-9 text-xs"
                  onClick={() => void recent.refetch()}
                >
                  Try again
                </Button>
              )
            }
          />
        </ElevatedCard>
      </main>
    );
  }

  const { learner, isOwn, shared, goalMinutes, today } = recent.data;
  const weekDates = daysBetween(addDays(today, -6), today);
  const monthDays = (monthData?.days ?? []).filter(
    (day) => monthOf(day.date) === shownMonth,
  );
  const todayMonth = monthOf(today);
  const daysSoFar =
    shownMonth === todayMonth
      ? dayOfMonth(today)
      : shownMonth < todayMonth
        ? dayOfMonth(lastDayOf(shownMonth))
        : 0;

  // The chosen day, as long as it is on show. Otherwise today; in an
  // earlier month, the last day of it that has something recorded.
  const selectedDate =
    pickedDate &&
    (monthOf(pickedDate) === shownMonth || weekDates.includes(pickedDate))
      ? pickedDate
      : shownMonth === todayMonth
        ? today
        : (monthDays.at(-1)?.date ?? null);

  const selectDate = (date: string) => {
    setPickedDate(date);
    // A bar of the week can belong to the month before the one on show.
    if (monthOf(date) !== shownMonth) setPickedMonth(monthOf(date));
  };
  const changeMonth = (month: string) => {
    setPickedMonth(month);
    setPickedDate(null);
  };
  const openLearner = (entry: LearningCommunityLearner) =>
    onNavigatePage?.(
      entry.isYou
        ? "/progress"
        : `/progress/${encodeURIComponent(entry.learner.username)}`,
    );

  return (
    <main className={progressPageClasses} aria-labelledby="progress-page-title">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-1">
        <div className="flex min-w-0 items-center gap-4">
          {isOwn ? null : <LearnerAvatar learner={learner} size="lg" />}
          <PageHeading
            id="progress-page-title"
            title={isOwn ? "Progress" : `${learner.name}'s progress`}
            description={
              isOwn
                ? "Your learning, day by day."
                : shared
                  ? "Shared with the academy's members."
                  : "Private. You can see it as an admin."
            }
            onNavigateBack={onNavigateBack}
          />
        </div>
        {isOwn ? (
          <ProgressSharingSwitch shared={shared} setNotice={setNotice} />
        ) : (
          <button
            type="button"
            className={quietLinkClasses}
            onClick={() => onNavigatePage?.("/progress")}
          >
            Your progress
          </button>
        )}
      </header>

      <ElevatedCard
        aria-label="Today and this week"
        className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-10"
      >
        <ProgressToday
          day={dayByDate.get(today)}
          goalMinutes={goalMinutes}
          isOwn={isOwn}
        />
        <ProgressWeekBars
          dates={weekDates}
          today={today}
          dayByDate={dayByDate}
          goalMinutes={goalMinutes}
          selectedDate={selectedDate}
          onSelectDate={selectDate}
          className={`border-t ${hairlineClasses} pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10`}
        />
      </ElevatedCard>

      <ElevatedCard
        aria-labelledby="progress-calendar-title"
        className="p-5 sm:p-7"
      >
        <ProgressMonthFigures
          figures={monthData ? monthFigures(monthDays, daysSoFar) : undefined}
        />
        <div
          className={`mt-6 grid gap-7 border-t ${hairlineClasses} pt-6 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:gap-10`}
        >
          <ProgressCalendar
            month={shownMonth}
            today={today}
            dayByDate={dayByDate}
            selectedDate={selectedDate}
            loading={!monthData}
            onSelectDate={selectDate}
            onChangeMonth={changeMonth}
          />
          <ProgressDayDetail
            date={selectedDate}
            day={selectedDate ? dayByDate.get(selectedDate) : undefined}
            goalMinutes={goalMinutes}
            courseById={courseById}
            onNavigatePage={onNavigatePage}
            className={`border-t ${hairlineClasses} pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10`}
          />
        </div>
      </ElevatedCard>

      <ProgressCommunity
        learners={community.data?.learners}
        loading={community.isPending}
        failed={community.isError}
        currentLearnerId={learner.id}
        onOpenLearner={openLearner}
      />
    </main>
  );
}
