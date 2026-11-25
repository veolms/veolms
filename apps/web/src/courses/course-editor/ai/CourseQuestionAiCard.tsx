import { useState } from "react";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react/ListChecks";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import {
  type QuestionGenerationItem,
  type QuestionGenerationJob,
} from "@veolms/contracts";
import { Button } from "../../../components/Button";
import { ElevatedCard } from "../../../components/ElevatedCard";
import { LoadingSpinnerIcon } from "../../../components/LoadingSpinner";
import { getApiError } from "../../../lib/api-error";
import { useAiAvailability } from "../../../services/ai";
import { useCapabilities } from "../../../services/authorization";
import {
  useCancelQuestionJob,
  useLatestQuestionJob,
  usePublishGeneratedQuizzes,
  useStartQuestionJob,
} from "../../../services/question-ai";
import { QuestionRunSetup, type QuestionAiSection } from "./QuestionRunSetup";

export type { QuestionAiSection };

const STATUS_WORDS: Record<QuestionGenerationItem["status"], string> = {
  pending: "Waiting",
  running: "Writing…",
  done: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

/** A small status chip, the curriculum's look. */
function Chip({
  tone,
  children,
}: {
  tone: "draft" | "live" | "muted" | "fail";
  children: React.ReactNode;
}) {
  const tones = {
    draft:
      "bg-[color-mix(in_srgb,#f59e0b_15%,transparent)] text-[color-mix(in_srgb,#f59e0b_55%,var(--text))]",
    live: "bg-[color-mix(in_srgb,var(--success,#22c55e)_15%,transparent)] text-[color-mix(in_srgb,var(--success,#22c55e)_55%,var(--text))]",
    muted:
      "bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--text-secondary)",
    fail: "bg-[color-mix(in_srgb,var(--danger,#e11d48)_14%,transparent)] text-[color-mix(in_srgb,var(--danger,#e11d48)_60%,var(--text))]",
  };
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[0.6875rem] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** One lecture of a run: what was made, with ways to check it. */
function ItemRow({
  item,
  courseId,
  jobRunning,
  onOpenLesson,
}: {
  item: QuestionGenerationItem;
  courseId: string;
  /** False once the run stopped: a lecture not reached is "Not done". */
  jobRunning: boolean;
  onOpenLesson: (lessonId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-[color-mix(in_srgb,var(--text)_2.5%,transparent)] px-3 py-2.5">
      <span className="w-6 shrink-0 text-xs font-bold text-(--muted) tabular-nums">
        {item.position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-(--text)">
          {item.lessonTitle}
        </span>
        {item.message ? (
          <span className="block truncate text-xs text-(--muted)">
            {item.message}
          </span>
        ) : item.sectionTitle ? (
          <span className="block truncate text-xs text-(--muted)">
            {item.sectionTitle}
          </span>
        ) : null}
      </span>
      {item.quiz ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary)">
          <ListChecks size={14} weight="bold" aria-hidden="true" />
          {item.quiz.questionCount} questions
          <Chip tone={item.quiz.status === "published" ? "live" : "draft"}>
            {item.quiz.status === "published" ? "Published" : "Draft"}
          </Chip>
        </span>
      ) : null}
      {item.coding ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-(--text-secondary)">
          <CodeGlyph size={14} weight="bold" aria-hidden="true" />
          <Chip tone={item.coding.status === "published" ? "live" : "draft"}>
            {item.coding.status === "published" ? "Published" : "Draft"}
          </Chip>
          {item.coding.assignmentId ? (
            <a
              href={`/practice/${encodeURIComponent(courseId)}/${encodeURIComponent(item.coding.assignmentId)}?preview=1`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-(--accent) no-underline hover:underline"
            >
              Try as student
              <ArrowSquareOut size={12} weight="bold" aria-hidden="true" />
            </a>
          ) : null}
        </span>
      ) : null}
      {item.status === "done" || item.status === "skipped" ? null : (
        <Chip
          tone={
            item.status === "failed"
              ? "fail"
              : item.status === "running" && jobRunning
                ? "draft"
                : "muted"
          }
        >
          {!jobRunning &&
          (item.status === "pending" || item.status === "running")
            ? "Not done"
            : STATUS_WORDS[item.status]}
        </Chip>
      )}
      {item.quiz || item.coding ? (
        <Button
          variant="quiet"
          elevation="flat"
          className="h-8 px-2.5 text-xs"
          onClick={() => onOpenLesson(item.lessonId)}
        >
          Review
        </Button>
      ) : null}
    </li>
  );
}

/**
 * The curriculum's "Create quizzes and coding questions with AI": one press
 * makes a draft quiz for every lecture, and a coding question where the
 * lecture teaches code, in course order. It runs on the server; this card
 * shows how far it got and lists what was made, to review (open the
 * lecture to edit by hand or with AI, try a coding question as a student)
 * and publish. Students see nothing until it is published.
 */
export function CourseQuestionAiCard({
  courseId,
  sections,
  onOpenLesson,
}: {
  courseId: string;
  sections: QuestionAiSection[];
  onOpenLesson: (lessonId: string) => void;
}) {
  const capabilities = useCapabilities();
  const available =
    (useAiAvailability().data?.available ?? false) &&
    capabilities.can("quiz.create");
  const latest = useLatestQuestionJob(available ? courseId : null);
  const start = useStartQuestionJob(courseId);
  const cancel = useCancelQuestionJob(courseId);
  const publish = usePublishGeneratedQuizzes(courseId);
  const [setup, setSetup] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const job: QuestionGenerationJob | null = latest.data ?? null;

  if (!available) return null;
  const running = job?.status === "queued" || job?.status === "running";
  const draftQuizzes =
    job?.items.filter((item) => item.quiz?.status === "draft").length ?? 0;
  const share = job && job.totalItems ? job.doneItems / job.totalItems : 0;

  return (
    <ElevatedCard as="section" padded className="grid gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent)">
          <Sparkle size={18} weight="fill" aria-hidden="true" />
        </span>
        {/* Wide enough to keep its words together; the button wraps
            under it on a phone. */}
        <div className="min-w-[min(100%,16rem)] flex-1">
          <h3 className="m-0 text-base font-bold text-(--text)">
            Quizzes and coding questions with AI
          </h3>
          <p className="m-0 mt-0.5 text-sm text-(--muted)">
            AI reads every lecture (its notes and what the video says) and
            writes a quiz, and a coding question where the lecture teaches code,
            in course order. Everything is a draft until you publish it.
          </p>
        </div>
        {!setup && !running ? (
          <Button className="h-9 px-3.5" onClick={() => setSetup(true)}>
            {job ? "Run again" : "Set up"}
          </Button>
        ) : null}
      </div>

      {setup && !running ? (
        <QuestionRunSetup
          courseId={courseId}
          sections={sections}
          starting={start.isPending}
          error={start.error ? getApiError(start.error).message : null}
          onCancel={() => setSetup(false)}
          onStart={(settings) =>
            start.mutate(settings, { onSuccess: () => setSetup(false) })
          }
        />
      ) : null}

      {job ? (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {running ? (
                <LoadingSpinnerIcon size={15} />
              ) : job.status === "done" ? (
                <CheckCircle
                  size={16}
                  weight="fill"
                  className="text-(--success,#22c55e)"
                  aria-hidden="true"
                />
              ) : (
                <WarningCircle
                  size={16}
                  weight="fill"
                  className="text-(--danger,#e11d48)"
                  aria-hidden="true"
                />
              )}
              <span className="font-semibold text-(--text)">
                {running
                  ? `Writing questions: ${job.doneItems} of ${job.totalItems} lectures`
                  : job.status === "done"
                    ? `Done: ${job.quizzesCreated} quiz${job.quizzesCreated === 1 ? "" : "zes"} and ${job.codingCreated} coding question${job.codingCreated === 1 ? "" : "s"}`
                    : job.status === "cancelled"
                      ? `Stopped after ${job.doneItems} of ${job.totalItems} lectures`
                      : "Stopped"}
              </span>
              <span className="text-xs text-(--muted) tabular-nums">
                Spent $
                {job.spentUsd < 0.1
                  ? job.spentUsd.toFixed(3)
                  : job.spentUsd.toFixed(2)}
              </span>
              {job.skippedItems ? (
                <span className="text-xs text-(--muted)">
                  {job.skippedItems} skipped
                </span>
              ) : null}
              {job.failedItems ? (
                <span className="text-xs text-(--danger,#e11d48)">
                  {job.failedItems} failed
                </span>
              ) : null}
              <span className="ml-auto flex gap-2">
                {running ? (
                  <Button
                    variant="quiet"
                    elevation="flat"
                    className="h-8 px-3"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(job.id)}
                  >
                    Stop
                  </Button>
                ) : draftQuizzes > 0 ? (
                  confirmPublish ? (
                    <>
                      <Button
                        className="h-8 px-3"
                        disabled={publish.isPending}
                        onClick={() =>
                          publish.mutate(
                            { jobId: job.id },
                            { onSuccess: () => setConfirmPublish(false) },
                          )
                        }
                      >
                        Publish {draftQuizzes} quiz
                        {draftQuizzes === 1 ? "" : "zes"} now
                      </Button>
                      <Button
                        variant="quiet"
                        elevation="flat"
                        className="h-8 px-3"
                        onClick={() => setConfirmPublish(false)}
                      >
                        Not yet
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="quiet"
                      elevation="flat"
                      className="h-8 px-3"
                      onClick={() => setConfirmPublish(true)}
                    >
                      Publish all quizzes
                    </Button>
                  )
                ) : null}
              </span>
            </div>
            {running ? (
              <span className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
                <span
                  className="block h-full rounded-full bg-(--accent) transition-[width] duration-500"
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </span>
            ) : null}
            {job.error ? (
              <p role="alert" className="text-sm text-(--danger,#e11d48)">
                {job.error}
              </p>
            ) : null}
            {confirmPublish ? (
              <p className="text-xs text-(--muted)">
                Students will see these quizzes on their lectures. Coding
                questions are checked and published one by one in each
                lecture&apos;s Practice tab.
              </p>
            ) : null}
            {publish.error ? (
              <p role="alert" className="text-sm text-(--danger,#e11d48)">
                {getApiError(publish.error).message}
              </p>
            ) : null}
          </div>
          <ul className="grid max-h-[28rem] gap-1.5 overflow-y-auto">
            {job.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                courseId={courseId}
                jobRunning={running}
                onOpenLesson={onOpenLesson}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </ElevatedCard>
  );
}

export default CourseQuestionAiCard;
