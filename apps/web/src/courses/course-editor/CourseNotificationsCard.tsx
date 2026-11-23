import { BellRingingIcon as BellRinging } from "@phosphor-icons/react/BellRinging";
import { useState } from "react";

import { Button } from "../../components/Button";
import { getApiError } from "../../lib/api-error";
import {
  useNotifyCourseLearners,
  useUpsertSettings,
} from "../../services/courses";
import { SettingsToggle } from "../../settings/SettingsControls";

/**
 * Whether the course's learners see its quizzes at all (owner, 23 Nov
 * 2026: draft or published per course, on by default; each quiz also has
 * its own visibility), and what they are told (22 Nov 2026): about its
 * quizzes (a new quiz, a result), off until the admin turns it on; and,
 * once it is published, about the course itself, sent by hand.
 */
export function CourseNotificationsCard({
  courseId,
  isPublished,
  quizNotificationsEnabled,
  quizzesPublished,
  onToast,
}: {
  courseId: string | null;
  isPublished: boolean;
  quizNotificationsEnabled: boolean;
  quizzesPublished: boolean;
  onToast: (message: string) => void;
}) {
  const upsertSettings = useUpsertSettings();
  const notifyLearners = useNotifyCourseLearners();
  // Shown at once; the saved value takes over again on a failure.
  const [quizOn, setQuizOn] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);
  const quizChecked = quizOn ?? quizNotificationsEnabled;
  const [quizzesShown, setQuizzesShown] = useState<boolean | null>(null);
  const quizzesChecked = quizzesShown ?? quizzesPublished;

  const toggleQuizzesShown = (next: boolean) => {
    if (!courseId) return;
    setQuizzesShown(next);
    upsertSettings.mutate(
      { courseId, payload: { quizzesPublished: next } },
      {
        onSuccess: (settings) => {
          const shown = settings.quizzesPublished !== false;
          setQuizzesShown(shown);
          onToast(
            shown
              ? "Learners can see this course's published quizzes."
              : "This course's quizzes are hidden from learners (draft).",
          );
        },
        onError: (error) => {
          setQuizzesShown(null);
          onToast(getApiError(error).message);
        },
      },
    );
  };

  const toggleQuiz = (next: boolean) => {
    if (!courseId) return;
    setQuizOn(next);
    upsertSettings.mutate(
      { courseId, payload: { quizNotificationsEnabled: next } },
      {
        onSuccess: (settings) => {
          setQuizOn(settings.quizNotificationsEnabled === true);
          onToast(
            settings.quizNotificationsEnabled === true
              ? "Learners will be notified about quizzes."
              : "Quiz notifications are off for this course.",
          );
        },
        onError: (error) => {
          setQuizOn(null);
          onToast(getApiError(error).message);
        },
      },
    );
  };

  const send = () => {
    if (!courseId) return;
    notifyLearners.mutate(courseId, {
      onSuccess: () => {
        setConfirming(false);
        onToast("Notification sent to the course's learners.");
      },
      onError: (error) => onToast(getApiError(error).message),
    });
  };

  const row =
    "flex items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] px-4.5 py-3.5 max-[480px]:flex-wrap";

  return (
    <div className="flex h-fit w-full flex-col rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--surface) p-5 pb-6 shadow-(--card-shadow)">
      <div className="mb-4.5">
        <h3 className="m-0 mb-1 text-[1.05rem] font-bold text-(--text)">
          Quizzes and notifications
        </h3>
        <p className="m-0 text-[0.83rem] text-(--muted)">
          Choose whether learners see this course&apos;s quizzes and what they
          are notified about.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div className={row}>
          <div className="flex min-w-0 flex-col pr-3">
            <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
              Show quizzes to learners
            </strong>
            <p className="m-0 text-[0.8rem] text-(--muted)">
              {quizzesChecked
                ? "Published: learners see each quiz that is itself published."
                : "Draft: every quiz in this course is hidden from learners."}
            </p>
          </div>
          <SettingsToggle
            checked={quizzesChecked}
            disabled={!courseId || upsertSettings.isPending}
            onChange={toggleQuizzesShown}
            label="Show quizzes to learners"
          />
        </div>
        <div className={row}>
          <div className="flex min-w-0 flex-col pr-3">
            <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
              Quiz notifications
            </strong>
            <p className="m-0 text-[0.8rem] text-(--muted)">
              Tell learners when a quiz is added and when they pass or run out
              of attempts.
            </p>
          </div>
          <SettingsToggle
            checked={quizChecked}
            disabled={!courseId || upsertSettings.isPending}
            onChange={toggleQuiz}
            label="Quiz notifications"
          />
        </div>
        <div className={row}>
          <div className="flex min-w-0 flex-col pr-3">
            <strong className="mb-0.5 block text-[0.9rem] font-[650] text-(--text)">
              Notify learners about this course
            </strong>
            <p className="m-0 text-[0.8rem] text-(--muted)">
              {isPublished
                ? "Sends a notification to everyone enrolled now."
                : "Available once the course is published."}
            </p>
          </div>
          {confirming ? (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="quiet"
                onClick={() => setConfirming(false)}
                disabled={notifyLearners.isPending}
              >
                Cancel
              </Button>
              <Button onClick={send} disabled={notifyLearners.isPending}>
                {notifyLearners.isPending ? "Sending…" : "Send now"}
              </Button>
            </div>
          ) : (
            <Button
              variant="quiet"
              className="shrink-0"
              disabled={!courseId || !isPublished}
              onClick={() => setConfirming(true)}
            >
              <BellRinging size={16} aria-hidden="true" />
              Send notification
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
