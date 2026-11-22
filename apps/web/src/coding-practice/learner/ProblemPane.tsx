import { useMemo, useState, type ReactNode } from "react";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/ClockCounterClockwise";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { LightbulbIcon as Lightbulb } from "@phosphor-icons/react/Lightbulb";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import type { CodingFile, CodingLesson } from "@veolms/contracts";
import { Button } from "../../components/Button";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { TimeAgo } from "../../components/TimeAgo";
import { DiscussionMarkdown } from "../../learning/discussion-editor/DiscussionMarkdown";
import { createDiscussionDraft } from "../../learning/discussion-editor/types";
import { getApiError } from "../../lib/api-error";
import { useCodingSubmissions } from "../../services/coding-practice";
import { CodeEditor, languageForPath } from "../editor/CodeEditor";
import {
  CODE_TONES,
  DifficultyLabel,
  EYEBROW,
  FOCUS_RING,
  HAIRLINE,
  MONO,
  PanelTabs,
} from "../shared/ui";
import { readOpenedHints, writeOpenedHints } from "./deviceStore";

export type ProblemTab = "problem" | "hints" | "submissions";

function Markdown({ text, label }: { text: string; label: string }) {
  const content = useMemo(() => createDiscussionDraft(text), [text]);
  return <DiscussionMarkdown content={content} label={label} />;
}

function Examples({ lesson }: { lesson: CodingLesson }) {
  const { tests, entry } = lesson.exercise;
  if (tests.format !== "cases") return null;
  const visible = tests.cases.filter((test) => !test.hidden).slice(0, 4);
  if (visible.length === 0) return null;
  return (
    <section className="mt-5">
      <h3 className={EYEBROW}>Examples</h3>
      <ul className={`mt-2 grid gap-1.5 ${MONO} text-[0.8125rem]`}>
        {visible.map((test) => (
          <li
            key={test.id}
            className="rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3 py-2 break-all text-(--text)"
          >
            {entry.name}(
            {test.args.map((arg) => JSON.stringify(arg)).join(", ")})
            <span className="text-(--muted)"> → </span>
            {JSON.stringify(test.expected)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HintsList({ lesson }: { lesson: CodingLesson }) {
  const assignmentId = lesson.assignment.id;
  const [opened, setOpened] = useState<string[]>(() =>
    readOpenedHints(assignmentId),
  );
  const failed = lesson.state.failedAttempts;
  const hints = lesson.exercise.hints;
  if (hints.length === 0)
    return (
      <p className="text-sm text-(--muted)">This exercise has no hints.</p>
    );
  return (
    <ol className="grid gap-3">
      {hints.map((hint, index) => {
        const unlocked =
          failed >= hint.unlockAfterFailedSubmits || lesson.state.passed;
        const isOpen = opened.includes(hint.id);
        return (
          <li
            key={hint.id}
            className={`rounded-xl px-4 py-3 ${isOpen ? "bg-[color-mix(in_srgb,var(--text)_5%,transparent)]" : `border ${HAIRLINE}`}`}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-(--text)">
              <Lightbulb
                size={16}
                weight="bold"
                aria-hidden="true"
                className="text-(--accent-ink,var(--accent))"
              />
              Hint {index + 1}
            </p>
            {isOpen ? (
              <div className="mt-2 text-sm">
                <Markdown text={hint.body} label={`Hint ${index + 1}`} />
              </div>
            ) : unlocked ? (
              <button
                type="button"
                onClick={() => {
                  const next = [...opened, hint.id];
                  setOpened(next);
                  writeOpenedHints(assignmentId, next);
                }}
                className={`mt-2 cursor-pointer rounded-md text-sm! font-semibold! text-(--accent-ink,var(--accent)) underline underline-offset-2 ${FOCUS_RING}`}
              >
                Show hint {index + 1}
              </button>
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-(--muted)">
                <LockSimple size={14} aria-hidden="true" />
                Opens after {hint.unlockAfterFailedSubmits} failed submit
                {hint.unlockAfterFailedSubmits === 1 ? "" : "s"} ({failed} so
                far).
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FileViewer({ files }: { files: CodingFile[] }) {
  const [active, setActive] = useState(files[0]?.path ?? "");
  const file = files.find((item) => item.path === active) ?? files[0];
  if (!file) return null;
  return (
    <div className={`overflow-hidden rounded-xl border ${HAIRLINE}`}>
      {files.length > 1 ? (
        <div
          className={`flex gap-1 overflow-x-auto border-b px-2 py-1 ${HAIRLINE}`}
        >
          {files.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => setActive(item.path)}
              className={`cursor-pointer rounded px-2 py-1 text-xs! font-semibold! font-mono! ${FOCUS_RING} ${item.path === file.path ? "bg-(--hover) text-(--text)" : "text-(--text-secondary)"}`}
            >
              {item.path}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-96 overflow-auto">
        <CodeEditor
          key={file.path}
          value={file.content}
          language={languageForPath(file.path)}
          readOnly
          label={`Solution, ${file.path}`}
        />
      </div>
    </div>
  );
}

function SubmissionsList({
  lesson,
  onLoadCode,
}: {
  lesson: CodingLesson;
  onLoadCode: (files: CodingFile[]) => void;
}) {
  const submissions = useCodingSubmissions(lesson.assignment.id);
  if (submissions.isLoading)
    return (
      <span
        className="text-(--muted)"
        role="status"
        aria-label="Loading your submissions"
      >
        <LoadingSpinnerIcon size={20} />
      </span>
    );
  if (submissions.error)
    return (
      <p className="text-sm text-(--code-fail)">
        {getApiError(submissions.error).message}
      </p>
    );
  const rows = submissions.data ?? [];
  if (rows.length === 0)
    return (
      <p className="text-sm text-(--muted)">
        Your submits will be listed here.
      </p>
    );
  return (
    <ul
      className={`divide-y divide-[color-mix(in_srgb,var(--text)_7%,transparent)]`}
    >
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
        >
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              row.passed
                ? "bg-[color-mix(in_srgb,var(--code-pass)_15%,transparent)] text-(--code-pass)"
                : "bg-[color-mix(in_srgb,var(--code-fail)_13%,transparent)] text-(--code-fail)"
            }`}
          >
            {row.passed ? "Passed" : `${row.passedCount}/${row.totalCount}`}
          </span>
          <TimeAgo
            value={row.createdAt}
            className="text-sm text-(--text-secondary)"
          />
          {row.files ? (
            <button
              type="button"
              onClick={() => onLoadCode(row.files!)}
              className={`ml-auto cursor-pointer rounded text-sm! font-semibold! text-(--accent-ink,var(--accent)) underline underline-offset-2 ${FOCUS_RING}`}
            >
              Load this code
            </button>
          ) : (
            <span className="ml-auto text-xs text-(--muted)">
              Code not kept
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProblemPane({
  lesson,
  idPrefix,
  tab,
  onTabChange,
  onLoadCode,
  actions,
}: {
  lesson: CodingLesson;
  idPrefix: string;
  tab: ProblemTab;
  onTabChange: (tab: ProblemTab) => void;
  onLoadCode: (files: CodingFile[]) => void;
  /** Buttons at the end of the tab row (maximise). */
  actions?: ReactNode;
}) {
  const { exercise, state } = lesson;
  return (
    <div className={`flex h-full min-h-0 flex-col ${CODE_TONES}`}>
      <PanelTabs<ProblemTab>
        idPrefix={idPrefix}
        label="Exercise"
        active={tab}
        onChange={onTabChange}
        trailing={actions}
        tabs={[
          {
            id: "problem",
            label: "Problem",
            icon: <FileText size={15} weight="bold" aria-hidden="true" />,
          },
          {
            id: "hints",
            label: "Hints",
            icon: <Lightbulb size={15} weight="bold" aria-hidden="true" />,
            disabled: exercise.hints.length === 0,
          },
          {
            id: "submissions",
            label: "Submits",
            icon: (
              <ClockCounterClockwise
                size={15}
                weight="bold"
                aria-hidden="true"
              />
            ),
          },
        ]}
      />
      <div
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
      >
        {tab === "problem" ? (
          <article>
            <div className="flex flex-wrap items-center gap-2">
              <DifficultyLabel difficulty={exercise.difficulty} />
              <span className="text-xs font-medium text-(--muted)">
                About {exercise.estimatedMinutes} min
              </span>
              {state.passed ? (
                <span className="text-xs font-semibold text-(--code-pass)">
                  Passed
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-lg font-bold text-(--text) text-balance">
              {exercise.title}
            </h2>
            <div className="mt-3 text-[0.9375rem]">
              <Markdown text={exercise.statement} label="Problem" />
            </div>
            <Examples lesson={lesson} />
            {exercise.settings.bestOnDesktop ? (
              <p className="mt-5 text-sm text-(--muted) sm:hidden">
                This exercise is easier on a bigger screen, but it works here
                too.
              </p>
            ) : null}
          </article>
        ) : null}
        {tab === "hints" ? <HintsList lesson={lesson} /> : null}
        {tab === "submissions" ? (
          <SubmissionsList lesson={lesson} onLoadCode={onLoadCode} />
        ) : null}
      </div>
    </div>
  );
}
