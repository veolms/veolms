import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RocketIcon as Rocket } from "@phosphor-icons/react/Rocket";
import {
  CODING_LIMITS,
  type CodingExercise,
  type CodingDifficulty,
} from "@veolms/contracts";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { ElevatedCard } from "../../components/ElevatedCard";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { ThemedSelect } from "../../ThemedSelect";
import { getApiError } from "../../lib/api-error";
import { LessonDescriptionEditor } from "../../courses/CourseDescriptionEditor";
import { useAiAvailability } from "../../services/ai";
import {
  useCodingAiWriter,
  useDeleteCodingExercise,
  usePublishCodingExercise,
} from "../../services/coding-practice";
import { CodeEditor } from "../editor/CodeEditor";
import { createRunner, type RunReport } from "../runner/runner";
import {
  CODE_TONES,
  FIELD,
  HAIRLINE,
  KIND_LABELS,
  languageOf,
  MONO,
  PanelTabs,
  SELECT_TRIGGER,
} from "../shared/ui";
import { TestResultList, ProblemNotice } from "../learner/TestResults";
import { AiAssist } from "./AiAssist";
import { checkHasProblems, describeCheck } from "./aiCheckReport";
import { hasAnswer, runInputFor } from "./answer";
import { PracticeFormatFields } from "./PracticeFormatFields";
import { AnswerTab } from "./AnswerTab";
import { CasesTable } from "./CasesTable";
import { CheckSummary } from "./CheckSummary";
import { HintsEditor, MocksEditor } from "./ExtrasEditors";
import { FilesEditor } from "./FilesEditor";
import { useExerciseForm, type ExerciseForm } from "./useExerciseForm";

type EditorTab =
  | "statement"
  | "starter"
  | "answer"
  | "tests"
  | "hints"
  | "editorial"
  | "details";

const SCRIPT_HELP = `test("name", async () => { … })   test.hidden("name", …)
expect(x).toBe(y) .toEqual(y) .toContain(y) .toBeTruthy() .toThrow()   expect(x).not.toBe(y)
getByTestId("id")   getByText("text")   querySelector("css")   style(el).color
await click(el)   await input(el, "text")   await wait(ms)`;

const NODE_SCRIPT_HELP = `test("name", async () => { … })   test.hidden("name", …)   describe("group", () => { … })
const { Cart } = require("./index")      // a fresh copy for every test
expect(x).toBe(y) .toEqual(y) .toThrow("msg") .toHaveLength(n) .toMatch(/re/)   await expect(p).rejects.toThrow()
const { stdout, exitCode } = await run(["--name", "Asha"])   // runs the entry file as node index.js --name Asha
require("fs").readFileSync("out.txt", "utf8")   const spy = fn()   expect(spy).toHaveBeenCalledWith(1)`;

function SaveBadge({ state, error }: { state: string; error: string | null }) {
  const text =
    state === "saving"
      ? "Saving…"
      : state === "unsaved"
        ? "Unsaved changes"
        : state === "error"
          ? `Not saved: ${error ?? "try again"}`
          : "All changes saved";
  return (
    <span
      role="status"
      className={`text-xs font-semibold ${state === "error" ? "text-rose-500" : "text-(--muted)"}`}
    >
      {text}
    </span>
  );
}

function TryIt({
  exercise,
  form,
}: {
  exercise: CodingExercise;
  form: ExerciseForm;
}) {
  const runner = useMemo(() => createRunner(), []);
  useEffect(() => () => runner.dispose(), [runner]);
  const [report, setReport] = useState<RunReport | null>(null);
  const [running, setRunning] = useState(false);
  const answerWritten = hasAnswer(form);
  const [code, setCode] = useState<"starter" | "answer">(
    answerWritten ? "answer" : "starter",
  );
  const runOn = answerWritten ? code : "starter";
  const run = async () => {
    setRunning(true);
    const result = await runner.run(
      runInputFor(exercise.kind, form, runOn),
      setReport,
    );
    setReport(result);
    setRunning(false);
  };
  return (
    <ElevatedCard
      as="section"
      aria-label="Try it"
      className={`flex flex-col overflow-hidden ${CODE_TONES}`}
    >
      <div
        className={`flex flex-wrap items-center gap-2 border-b px-4 py-3 ${HAIRLINE}`}
      >
        <h2 className="text-sm font-bold text-(--text)">Try it</h2>
        <div
          role="radiogroup"
          aria-label="Code to run the tests on"
          className="flex gap-1 rounded-lg bg-[color-mix(in_srgb,var(--text)_6%,transparent)] p-0.5"
        >
          {(
            [
              ["starter", "Starter code"],
              ["answer", "Your answer"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={runOn === value}
              disabled={value === "answer" && !answerWritten}
              title={
                value === "answer" && !answerWritten
                  ? "Write your answer in the Answer tab first"
                  : undefined
              }
              onClick={() => {
                setCode(value);
                setReport(null);
              }}
              className={`h-7 cursor-pointer rounded-md px-2.5 text-xs! font-semibold! transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                runOn === value
                  ? "bg-(--surface) text-(--text) shadow-sm"
                  : "text-(--text-secondary) hover:text-(--text)"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          className="ml-auto h-9"
          variant="quiet"
          elevation="flat"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? <LoadingSpinnerIcon size={16} /> : null}
          Run all tests
        </Button>
      </div>
      <div className="max-h-[60vh] min-h-40 overflow-auto">
        {report?.problem ? <ProblemNotice problem={report.problem} /> : null}
        <TestResultList tests={report?.tests ?? []} showHiddenDetails />
        {report && report.console.length ? (
          <ol className={`border-t px-4 py-2 ${MONO} text-xs ${HAIRLINE}`}>
            {report.console.slice(0, 50).map((line, index) => (
              <li
                key={index}
                className="py-0.5 whitespace-pre-wrap text-(--text-secondary)"
              >
                {line.text}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </ElevatedCard>
  );
}

export interface ExerciseWorkbenchProps {
  exercise: CodingExercise;
  /** Inside another screen (the lesson editor): no sticky Try it panel. */
  embedded?: boolean;
  /** The heading row's left side; gets the title and a status line. */
  renderHeading?: (info: {
    titleId: string;
    title: string;
    status: string;
  }) => ReactNode;
  /** Shown under the heading row. */
  banner?: ReactNode;
  /** After a version is published. */
  onPublished?: () => void;
  /** Offers "Delete exercise" when given; called after it is deleted. */
  onDeleted?: () => void;
  /** Run Check tests as soon as it opens (a question AI just wrote). */
  autoCheck?: boolean;
  /** AI replaced the draft: the parent opens the editor on the new one. */
  onAiReplaced?: () => void;
}

/**
 * Everything an author needs for one exercise: problem, starter code,
 * solution, tests, hints and settings, with Try it, Check and
 * Publish. Used by the exercise page and inside a coding lesson in the
 * course editor.
 */
export function ExerciseWorkbench({
  exercise,
  embedded = false,
  renderHeading,
  banner,
  onPublished,
  onDeleted,
  autoCheck = false,
  onAiReplaced,
}: ExerciseWorkbenchProps) {
  const ids = useId();
  const { form, change, saveState, saveError, saveNow } =
    useExerciseForm(exercise);
  const courseId = exercise.assignments[0]?.courseId ?? "";
  const aiWriter = useCodingAiWriter(courseId);
  const aiAvailable = useAiAvailability().data?.available ?? false;
  const publish = usePublishCodingExercise();
  const remove = useDeleteCodingExercise();
  const runner = useMemo(() => createRunner(), []);
  useEffect(() => () => runner.dispose(), [runner]);
  const [tab, setTab] = useState<EditorTab>("statement");
  const [checking, setChecking] = useState(false);
  const [checkReport, setCheckReport] = useState<RunReport | null>(null);
  const [answerReport, setAnswerReport] = useState<RunReport | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editable = exercise.editable;
  const isDraft = !editable.publishedAt;
  const latestPublished = exercise.versions.find(
    (version) => version.publishedAt,
  );
  const testsWritten =
    form.tests.format === "cases"
      ? form.tests.cases.length > 0
      : form.tests.source.trim().length > 0;
  const [noTestsNote, setNoTestsNote] = useState(false);
  // Publish stopped because tests already pass on the starter code.
  const [heldBack, setHeldBack] = useState(false);

  const check = async (andPublish: boolean, anyway = false) => {
    setChecking(true);
    setPublishError(null);
    setHeldBack(false);
    try {
      const saved = await saveNow();
      if (!saved) {
        setPublishError(
          "Your changes could not be saved. Check the connection and try again.",
        );
        return;
      }
      // Without tests there is nothing to check: learners run their code
      // and mark the practice done.
      if (!testsWritten) {
        setCheckReport(null);
        setNoTestsNote(true);
        if (!andPublish) return;
        await publish.mutateAsync({
          exerciseId: exercise.id,
          payload: {
            suiteHash: saved.editable.suiteHash,
            solutionPassed: false,
            starterFailed: false,
          },
        });
        onPublished?.();
        return;
      }
      setNoTestsNote(false);
      const answered = hasAnswer(form);
      const answerResult = answered
        ? await runner.run(runInputFor(exercise.kind, form, "answer"))
        : null;
      const result = await runner.run(
        runInputFor(exercise.kind, form, "starter"),
      );
      setAnswerReport(answerResult);
      setCheckReport(result);
      const scriptTests =
        form.tests.format === "script" ? (result.discovered ?? []) : undefined;
      if (scriptTests && scriptTests.length === 0) {
        setPublishError(
          "No tests were found in the test file. Add test(...) calls, or empty it for free practice.",
        );
        return;
      }
      if (!andPublish) return;
      // Tests a correct answer fails would fail every right learner.
      if (
        answerResult &&
        (answerResult.problem ||
          answerResult.tests.some((test) => test.status !== "passed"))
      ) {
        setPublishError(
          "Not published: your answer does not pass every test. Fix the answer or the tests first.",
        );
        return;
      }
      // A test the starter code passes checks nothing the learner writes:
      // ask before learners see it.
      const starterPasses = result.tests.some(
        (test) => test.status === "passed",
      );
      if (starterPasses && !result.problem && !anyway) {
        setHeldBack(true);
        return;
      }
      await publish.mutateAsync({
        exerciseId: exercise.id,
        payload: {
          suiteHash: saved.editable.suiteHash,
          solutionPassed: false,
          starterFailed: false,
          scriptTests,
        },
      });
      onPublished?.();
    } catch (error) {
      setPublishError(getApiError(error).message);
    } finally {
      setChecking(false);
    }
  };

  // A question AI just wrote is checked at once: the author sees whether
  // the answer passes and the starter fails before reading anything.
  const autoChecked = useRef(false);
  useEffect(() => {
    if (!autoCheck || autoChecked.current) return;
    autoChecked.current = true;
    void check(false);
    // Once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck]);

  const reviseWithAi = async (instruction: string | null) => {
    const saved = await saveNow();
    if (!saved) {
      setPublishError(
        "Your changes could not be saved. Check the connection and try again.",
      );
      return;
    }
    const report = describeCheck(checkReport, answerReport);
    const updated = await aiWriter.revise(exercise.id, {
      ...(instruction ? { instruction } : {}),
      ...(report && !instruction ? { checkReport: report } : {}),
    });
    if (updated) onAiReplaced?.();
  };

  const title = form.title || "Untitled exercise";
  const status = `${KIND_LABELS[exercise.kind]} · ${languageOf(editable.entry.file)} · ${isDraft ? `draft of version ${editable.versionNumber}` : `version ${editable.versionNumber}, published`}${latestPublished && isDraft ? ` · version ${latestPublished.versionNumber} is live` : ""}`;

  return (
    <div
      role="group"
      aria-labelledby={`${ids}-title`}
      className={`@container grid w-full gap-5 ${CODE_TONES}`}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          {renderHeading ? (
            renderHeading({ titleId: `${ids}-title`, title, status })
          ) : (
            <>
              <h3
                id={`${ids}-title`}
                className="text-base font-bold break-words text-(--text)"
              >
                {title}
              </h3>
              <p className="text-xs text-(--muted)">{status}</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveBadge state={saveState} error={saveError} />
          <Button
            variant="quiet"
            elevation="flat"
            disabled={checking}
            onClick={() => void check(false)}
          >
            Check tests
          </Button>
          <Button
            disabled={checking || !isDraft}
            onClick={() => void check(true)}
          >
            {checking ? (
              <LoadingSpinnerIcon size={16} />
            ) : (
              <Rocket size={16} weight="bold" aria-hidden="true" />
            )}
            {isDraft
              ? `Publish version ${editable.versionNumber}`
              : "Published"}
          </Button>
        </div>
      </div>

      {banner}
      {aiAvailable ? (
        <AiAssist
          running={aiWriter.running}
          progress={aiWriter.progress}
          error={aiWriter.error}
          summary={aiWriter.summary}
          canFix={!checking && checkHasProblems(checkReport, answerReport)}
          onImprove={(instruction) => void reviseWithAi(instruction)}
          onFix={() => void reviseWithAi(null)}
          onCancel={aiWriter.cancel}
        />
      ) : null}
      {publish.isSuccess && !isDraft ? (
        <p
          role="status"
          className="rounded-xl bg-[color-mix(in_srgb,var(--code-pass)_10%,transparent)] px-4 py-3 text-sm font-semibold text-(--text)"
        >
          {embedded
            ? `Version ${editable.versionNumber} is published: learners on this lecture now get it (their code is kept).`
            : `Version ${editable.versionNumber} is published. Lessons that use the exercise can move to it from the course editor.`}
        </p>
      ) : null}
      {checkReport ? (
        <CheckSummary
          starter={checkReport}
          answer={answerReport}
          onPublishAnyway={heldBack ? () => void check(true, true) : undefined}
        />
      ) : null}
      {noTestsNote && !checkReport ? (
        <p
          role="status"
          className="rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-3 text-sm text-(--text-secondary)"
        >
          No tests yet, so nothing to check. Learners will run their code and
          mark the practice done. Add tests in the Tests tab if you want their
          code checked.
        </p>
      ) : null}
      {publishError ? (
        <p
          role="alert"
          className="rounded-xl bg-[color-mix(in_srgb,var(--code-fail)_9%,transparent)] px-4 py-3 text-sm text-(--text)"
        >
          {publishError}
        </p>
      ) : null}

      <div className="grid items-start gap-5 @5xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <ElevatedCard
          as="section"
          aria-label="Exercise"
          className="flex min-w-0 flex-col overflow-hidden"
        >
          <PanelTabs<EditorTab>
            idPrefix={`${ids}-editor`}
            label="Exercise parts"
            active={tab}
            onChange={setTab}
            tabs={[
              { id: "statement", label: "Problem" },
              { id: "starter", label: "Starter code" },
              { id: "answer", label: "Answer" },
              { id: "tests", label: "Tests" },
              { id: "hints", label: "Hints" },
              { id: "editorial", label: "Editorial" },
              { id: "details", label: "Settings" },
            ]}
          />
          <div
            id={`${ids}-editor-panel`}
            role="tabpanel"
            aria-labelledby={`${ids}-editor-tab-${tab}`}
            className="grid gap-4 p-4 sm:p-5"
          >
            {tab === "statement" ? (
              <LessonDescriptionEditor
                id={`practice-statement-${exercise.id}`}
                label="Problem statement"
                placeholder="Describe the task like a README: what to build, the rules, and examples. Headings, lists and code blocks work."
                value={form.statement}
                onChange={(statement) => change({ statement })}
                maxLength={CODING_LIMITS.maxStatementChars}
              />
            ) : null}
            {tab === "starter" ? (
              <>
                <p className="text-sm text-(--text-secondary)">
                  The code learners start from.{" "}
                  {exercise.kind === "web"
                    ? "CSS and JS files are added to the page for you."
                    : ""}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-semibold text-(--text-secondary)">
                    {exercise.kind === "web"
                      ? "Page (HTML file)"
                      : exercise.kind === "react"
                        ? "File that exports App"
                        : "File with the function"}
                    <ThemedSelect<string>
                      triggerClassName={SELECT_TRIGGER}
                      value={form.entry.file}
                      onValueChange={(file) =>
                        change({ entry: { ...form.entry, file } })
                      }
                      options={form.starterFiles.map(
                        (file) => [file.path, file.path] as [string, string],
                      )}
                      ariaLabel="Entry file"
                    />
                  </label>
                  {exercise.kind === "function" ? (
                    <label className="grid gap-1.5 text-xs font-semibold text-(--text-secondary)">
                      Function the tests call
                      <input
                        value={form.entry.name ?? ""}
                        onChange={(event) =>
                          change({
                            entry: {
                              ...form.entry,
                              name: event.target.value.trim() || undefined,
                            },
                          })
                        }
                        className={`${FIELD} h-10 font-mono!`}
                        placeholder="sum"
                      />
                    </label>
                  ) : null}
                </div>
                <FilesEditor
                  files={form.starterFiles}
                  onChange={(starterFiles) => change({ starterFiles })}
                  withFlags
                  label="Starter code"
                />
              </>
            ) : null}
            {tab === "answer" ? (
              <AnswerTab
                form={form}
                onChange={(solutionFiles) => change({ solutionFiles })}
              />
            ) : null}
            {tab === "tests" ? (
              form.tests.format === "cases" ? (
                <CasesTable
                  cases={form.tests.cases}
                  functionName={form.entry.name ?? ""}
                  onChange={(cases) =>
                    change({ tests: { format: "cases", cases } })
                  }
                />
              ) : (
                <>
                  <p className="text-sm text-(--text-secondary)">
                    Optional. Leave this empty for free practice. Tests run in
                    the learner&apos;s page; give elements a{" "}
                    <code className={MONO}>data-testid</code> in the starter or
                    say so in the problem.
                  </p>
                  <pre
                    className={`overflow-x-auto rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3 py-2.5 text-xs leading-relaxed text-(--text-secondary) ${MONO}`}
                  >
                    {exercise.kind === "node" ? NODE_SCRIPT_HELP : SCRIPT_HELP}
                  </pre>
                  <div
                    className={`h-96 overflow-hidden rounded-xl border ${HAIRLINE}`}
                  >
                    <CodeEditor
                      value={form.tests.source}
                      onChange={(source) =>
                        change({
                          tests: {
                            format: "script",
                            source,
                            tests: [],
                            timeoutMs:
                              form.tests.format === "script"
                                ? form.tests.timeoutMs
                                : undefined,
                          },
                        })
                      }
                      language="javascript"
                      label="Test file"
                    />
                  </div>
                </>
              )
            ) : null}
            {tab === "hints" ? (
              <HintsEditor
                hints={form.hints}
                onChange={(hints) => change({ hints })}
              />
            ) : null}
            {tab === "editorial" ? (
              <>
                <p className="text-sm text-(--text-secondary)">
                  How the answer works, as LeetCode&apos;s Editorial: the idea,
                  the steps, the code, its cost, common mistakes. Learners see
                  it with your answer when the rule in Settings allows.
                </p>
                <LessonDescriptionEditor
                  id={`practice-editorial-${exercise.id}`}
                  label="Editorial"
                  placeholder="## Approach&#10;Explain the idea step by step, then show the code."
                  value={form.editorial}
                  onChange={(editorial) => change({ editorial })}
                  maxLength={CODING_LIMITS.maxEditorialChars}
                />
              </>
            ) : null}
            {tab === "details" ? (
              <div className="grid gap-5">
                <PracticeFormatFields form={form} change={change} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1.5 text-xs font-semibold text-(--text-secondary) sm:col-span-3">
                    Title
                    <input
                      value={form.title}
                      onChange={(event) =>
                        change({ title: event.target.value })
                      }
                      className={`${FIELD} h-10`}
                      maxLength={160}
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-(--text-secondary)">
                    Difficulty
                    <ThemedSelect<CodingDifficulty>
                      triggerClassName={SELECT_TRIGGER}
                      value={form.difficulty}
                      onValueChange={(difficulty) => change({ difficulty })}
                      options={[
                        ["easy", "Easy"],
                        ["medium", "Medium"],
                        ["hard", "Hard"],
                      ]}
                      ariaLabel="Difficulty"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs font-semibold text-(--text-secondary)">
                    Minutes it takes
                    <input
                      type="number"
                      min={1}
                      max={240}
                      value={form.estimatedMinutes}
                      onChange={(event) =>
                        change({
                          estimatedMinutes: Math.min(
                            240,
                            Math.max(1, Number(event.target.value) || 1),
                          ),
                        })
                      }
                      className={`${FIELD} h-10`}
                    />
                  </label>
                </div>
                <div className="grid gap-3">
                  <Checkbox
                    checked={form.settings.showHiddenInputs}
                    onCheckedChange={(showHiddenInputs) =>
                      change({
                        settings: { ...form.settings, showHiddenInputs },
                      })
                    }
                    label="After a failed submit, show what hidden tests check"
                  />
                  <Checkbox
                    checked={form.settings.bestOnDesktop}
                    onCheckedChange={(bestOnDesktop) =>
                      change({ settings: { ...form.settings, bestOnDesktop } })
                    }
                    label="Tell phone learners it is easier on a bigger screen"
                  />
                </div>
                <section className={`grid gap-3 border-t pt-4 ${HAIRLINE}`}>
                  <h3 className="text-sm font-bold text-(--text)">
                    Network requests
                  </h3>
                  <MocksEditor
                    mocks={form.settings.mocks}
                    onChange={(mocks) =>
                      change({ settings: { ...form.settings, mocks } })
                    }
                  />
                </section>
                {onDeleted ? (
                  <section
                    className={`flex flex-wrap items-center gap-2 border-t pt-4 ${HAIRLINE}`}
                  >
                    {confirmDelete ? (
                      <>
                        <span className="text-sm text-(--text-secondary)">
                          Delete this exercise?
                        </span>
                        <Button
                          variant="danger"
                          disabled={remove.isPending}
                          onClick={() =>
                            remove.mutate(exercise.id, {
                              onSuccess: () => onDeleted(),
                            })
                          }
                        >
                          Delete
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="quiet"
                        elevation="flat"
                        onClick={() => setConfirmDelete(true)}
                      >
                        Delete exercise
                      </Button>
                    )}
                    {remove.error ? (
                      <span className="text-sm text-rose-500">
                        {getApiError(remove.error).message}
                      </span>
                    ) : null}
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </ElevatedCard>
        <div
          className={embedded ? "min-w-0" : "min-w-0 @5xl:sticky @5xl:top-4"}
        >
          <TryIt exercise={exercise} form={form} />
        </div>
      </div>
    </div>
  );
}
