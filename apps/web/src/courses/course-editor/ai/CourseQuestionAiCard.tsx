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
import { SlideOverPanel } from "../../../components/SlideOverPanel";
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

/** A run's state in one plain line. */
function runSummary(job: QuestionGenerationJob, running: boolean) {
  if (running)
    return `Writing questions: ${job.doneItems} of ${job.totalItems} lectures`;
  if (job.status === "done")
    return `Done: ${job.quizzesCreated} quiz${job.quizzesCreated === 1 ? "" : "zes"} and ${job.codingCreated} coding question${job.codingCreated === 1 ? "" : "s"}`;
  if (job.status === "cancelled")
    return `Stopped after ${job.doneItems} of ${job.totalItems} lectures`;
  return "Stopped";
}

function RunIcon({
  job,
  running,
}: {
  job: QuestionGenerationJob;
  running: boolean;
}) {
  if (running) return <LoadingSpinnerIcon size={15} />;
  return job.status === "done" ? (
    <CheckCircle
      size={16}
      weight="fill"
      className="shrink-0 text-(--success,#22c55e)"
      aria-hidden="true"
    />
  ) : (
    <WarningCircle
      size={16}
      weight="fill"
      className="shrink-0 text-(--danger,#e11d48)"
      aria-hidden="true"
    />
  );
}

function ProgressBar({ share }: { share: number }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
      <span
        className="block h-full rounded-full bg-(--accent) transition-[width] duration-500"
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </span>
  );
}

/**
 * The curriculum's "Quizzes and coding questions with AI": a slim row that
 * says where things stand, and a drawer with the rest. In the drawer: the
 * run's setup (what to make, per section), then its progress and every
 * lecture's drafts to review (open the lecture to edit by hand or with AI,
 * try a coding question as a student) and publish. Students see nothing
 * until it is published. Which model writes is set in Platform → AI.
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
  const ai = useAiAvailability().data;
  // Whole-course runs use the model chosen "for a whole course".
  const available =
    Boolean(
      ai?.enabled && ai.tiers.find((tier) => tier.id === "balanced")?.available,
    ) && capabilities.can("quiz.create");
  const seesCost = capabilities.can("platform.settings.read");
  const latest = useLatestQuestionJob(available ? courseId : null);
  const start = useStartQuestionJob(courseId);
  const cancel = useCancelQuestionJob(courseId);
  const publish = usePublishGeneratedQuizzes(courseId);
  const [drawer, setDrawer] = useState<null | "setup" | "run">(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const job: QuestionGenerationJob | null = latest.data ?? null;

  if (!available) return null;
  const running = job?.status === "queued" || job?.status === "running";
  const draftQuizzes =
    job?.items.filter((item) => item.quiz?.status === "draft").length ?? 0;
  const share = job && job.totalItems ? job.doneItems / job.totalItems : 0;
  const close = () => {
    setDrawer(null);
    setConfirmPublish(false);
  };

  return (
    <>
      <ElevatedCard as="section" className="grid gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent)">
            <Sparkle size={16} weight="fill" aria-hidden="true" />
          </span>
          <div className="min-w-[min(100%,14rem)] flex-1">
            <h3 className="m-0 text-sm font-bold text-(--text)">
              Quizzes and coding questions with AI
            </h3>
            <p className="m-0 flex items-center gap-1.5 text-xs text-(--muted)">
              {job ? (
                <>
                  <RunIcon job={job} running={running} />
                  <span className="truncate">
                    {runSummary(job, running)}
                    {!running && draftQuizzes > 0
                      ? ` · ${draftQuizzes} quiz${draftQuizzes === 1 ? "" : "zes"} not published yet`
                      : ""}
                  </span>
                </>
              ) : (
                "A draft quiz and coding question for every lecture, for you to check and publish."
              )}
            </p>
          </div>
          <Button
            variant={job ? "quiet" : undefined}
            elevation={job ? "flat" : undefined}
            className="h-9 px-3.5"
            onClick={() => setDrawer(job ? "run" : "setup")}
          >
            {job ? "Open" : "Set up"}
          </Button>
        </div>
        {running ? <ProgressBar share={share} /> : null}
      </ElevatedCard>

      {drawer ? (
        <SlideOverPanel
          label="Quizzes and coding questions with AI"
          title="Quizzes and coding questions with AI"
          closeLabel="Close"
          onClose={close}
          className="max-w-[640px]"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {drawer === "setup" && !running ? (
              <QuestionRunSetup
                courseId={courseId}
                sections={sections}
                starting={start.isPending}
                error={start.error ? getApiError(start.error).message : null}
                onCancel={() => (job ? setDrawer("run") : close())}
                onStart={(settings) =>
                  start.mutate(settings, { onSuccess: () => setDrawer("run") })
                }
              />
            ) : job ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <RunIcon job={job} running={running} />
                  <span className="font-semibold text-(--text)">
                    {runSummary(job, running)}
                  </span>
                  {seesCost ? (
                    <span className="text-xs text-(--muted) tabular-nums">
                      Spent $
                      {job.spentUsd < 0.1
                        ? job.spentUsd.toFixed(3)
                        : job.spentUsd.toFixed(2)}
                    </span>
                  ) : null}
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
                </div>
                {running ? <ProgressBar share={share} /> : null}
                <div className="flex flex-wrap gap-2">
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
                  ) : (
                    <>
                      {draftQuizzes > 0 ? (
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
                            className="h-8 px-3"
                            onClick={() => setConfirmPublish(true)}
                          >
                            Publish all quizzes
                          </Button>
                        )
                      ) : null}
                      <Button
                        variant="quiet"
                        elevation="flat"
                        className="h-8 px-3"
                        onClick={() => setDrawer("setup")}
                      >
                        Run again
                      </Button>
                    </>
                  )}
                </div>
                {job.error ? (
                  <p
                    role="alert"
                    className="m-0 text-sm text-(--danger,#e11d48)"
                  >
                    {job.error}
                  </p>
                ) : null}
                {confirmPublish ? (
                  <p className="m-0 text-xs text-(--muted)">
                    Students will see these quizzes on their lectures. Coding
                    questions are checked and published one by one in each
                    lecture&apos;s Practice tab.
                  </p>
                ) : null}
                {publish.error ? (
                  <p
                    role="alert"
                    className="m-0 text-sm text-(--danger,#e11d48)"
                  >
                    {getApiError(publish.error).message}
                  </p>
                ) : null}
                <ul className="m-0 grid list-none gap-1.5 p-0">
                  {job.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      courseId={courseId}
                      jobRunning={running}
                      onOpenLesson={(lessonId) => {
                        close();
                        onOpenLesson(lessonId);
                      }}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </SlideOverPanel>
      ) : null}
    </>
  );
}

export default CourseQuestionAiCard;
