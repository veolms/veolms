import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ArrowsInSimpleIcon as ArrowsIn } from "@phosphor-icons/react/ArrowsInSimple";
import { ArrowsOutSimpleIcon as ArrowsOut } from "@phosphor-icons/react/ArrowsOutSimple";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CodeIcon as CodeGlyph } from "@phosphor-icons/react/Code";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { FlaskIcon as Flask } from "@phosphor-icons/react/Flask";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import type {
  CodingFile,
  CodingLesson,
  SubmitCodingResponse,
} from "@veolms/contracts";
import { Button } from "../../components/Button";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import {
  CodeEditor,
  languageForPath,
  type CodeEditorHandle,
} from "../editor/CodeEditor";
import { SymbolBar } from "../editor/SymbolBar";
import {
  createRunner,
  type ConsoleEntry,
  type PreviewInput,
  type RunReport,
} from "../runner/runner";
import {
  CODE_TONES,
  EYEBROW,
  FOCUS_RING,
  HAIRLINE,
  IconAction,
  MONO,
} from "../shared/ui";
import { ProblemPane, type ProblemTab, type SubmitResult } from "./ProblemPane";
import { ResultsPane, type ResultsTab } from "./ResultsPane";
import { TestcasePanel } from "./TestcasePanel";
import {
  draftsFrom,
  isUnchanged,
  parameterNames,
  parseArgs,
  type CaseDraft,
} from "./testcases";
import { editableOnly, useCodingDraft } from "./useCodingDraft";
import { useActiveTime } from "./useActiveTime";
import { usePracticeTimer } from "./usePracticeTimer";
import { ShortcutsButton } from "./ShortcutsPanel";
import {
  QuestionNavigator,
  SaveStatusBadge,
  TimerControl,
  type QuestionNavigation,
} from "./WorkspaceHeaderParts";
import { useKeyboardOpen } from "./useKeyboardOpen";
import { useSubmitWithRetry } from "./useSubmitWithRetry";
import {
  FONT_SIZES,
  useWorkspaceLayout,
  type WorkspacePane,
} from "./useWorkspaceLayout";

const PANE_NAMES: Record<WorkspacePane, string> = {
  problem: "the problem",
  editor: "the code editor",
  results: "the results",
};

/** Maximise or restore one pane (wider screens; a phone shows one at a time). */
function MaximizeButton({
  pane,
  maximized,
  onToggle,
}: {
  pane: WorkspacePane;
  maximized: WorkspacePane | null;
  onToggle: (pane: WorkspacePane) => void;
}) {
  const isMax = maximized === pane;
  return (
    <span className="@max-2xl:hidden">
      <IconAction
        label={
          isMax ? `Restore ${PANE_NAMES[pane]}` : `Maximise ${PANE_NAMES[pane]}`
        }
        onClick={() => onToggle(pane)}
      >
        {isMax ? (
          <ArrowsIn size={15} weight="bold" aria-hidden="true" />
        ) : (
          <ArrowsOut size={15} weight="bold" aria-hidden="true" />
        )}
      </IconAction>
    </span>
  );
}

/** A bar between two panes that is dragged (or moved with arrow keys). */
function Divider({
  axis,
  value,
  min,
  max,
  label,
  className,
  onPointerDown,
  onKeyDown,
  onReset,
}: {
  axis: "width" | "height";
  value: number;
  min: number;
  max: number;
  label: string;
  className: string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onReset: () => void;
}) {
  const vertical = axis === "width";
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      className={`group relative z-[1] shrink-0 touch-none select-none ${FOCUS_RING} ${
        vertical ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute bg-[color-mix(in_srgb,var(--text)_9%,transparent)] transition-colors group-hover:bg-(--accent) group-focus-visible:bg-(--accent) group-active:bg-(--accent) ${
          vertical
            ? "inset-y-0 left-1/2 w-px -translate-x-1/2 group-hover:w-0.5"
            : "inset-x-0 top-1/2 h-px -translate-y-1/2 group-hover:h-0.5"
        }`}
      />
    </div>
  );
}

type PhoneView = "problem" | "code" | "result";

export interface CodingWorkspaceProps {
  lesson: CodingLesson;
  /** "Practice · Anchors". */
  context: string;
  /** The exercise was passed (or, without tests, marked done). */
  onPassed: () => void;
  onContinue?: () => void;
  onReload: () => void;
  /** Fills its container (the full-screen practice view) instead of a stage height. */
  fill?: boolean;
  /** Shows a Back button in the header (as the quiz does). */
  onClose?: () => void;
  /** The course's other questions: list, previous, next. */
  nav?: QuestionNavigation;
}

/** Merges a checked run and a run of the learner's own cases, in case order. */
function mergeReports(
  checked: RunReport,
  own: RunReport | null,
  order: string[],
): RunReport {
  if (!own) return checked;
  const rows = new Map(
    [...checked.tests, ...own.tests].map((row) => [row.id, row]),
  );
  return {
    ...checked,
    tests: order.flatMap((id) => {
      const row = rows.get(id);
      return row ? [row] : [];
    }),
    console: [...checked.console, ...own.console].slice(0, 1000),
    problem: checked.problem ?? own.problem,
    errors: [...checked.errors, ...own.errors],
    durationMs: checked.durationMs + own.durationMs,
    finished: checked.finished && own.finished,
  };
}

/**
 * Where a learner solves one exercise: the problem, the editor and the
 * results side by side on a wide screen, stacked on a tablet, and as three
 * tabs on a phone. Run checks the visible tests on the device; Submit runs
 * every test and records the result.
 */
export function CodingWorkspace({
  lesson,
  context,
  onPassed,
  onContinue,
  onReload,
  fill = false,
  onClose,
  nav,
}: CodingWorkspaceProps) {
  const ids = useId();
  const { exercise } = lesson;
  /**
   * Staff trying the newest version as a student: Run and Submit work in
   * the browser; no code, submit, time or progress is saved.
   */
  const preview = lesson.preview === true;
  const activeTime = useActiveTime();
  const draft = useCodingDraft(lesson, activeTime);
  // Starts when the learner does (types, runs or submits), not on open.
  const timer = usePracticeTimer(
    preview ? `preview:${lesson.assignment.id}` : lesson.assignment.id,
    exercise.settings.mode === "machine_coding"
      ? (exercise.settings.timeLimitMinutes ?? 45)
      : null,
    {
      solved: lesson.state.passed,
      bestSolveSeconds: lesson.state.bestSolveSeconds,
    },
  );
  // Stable, unlike `timer` (a new object every second).
  const { touch: touchTimer, pause: pauseTimer } = timer;
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  // Function questions: the examples as editable cases (Testcase tab).
  const [caseDrafts, setCaseDrafts] = useState<CaseDraft[]>(() =>
    exercise.tests.format === "cases" ? draftsFrom(exercise.tests.cases) : [],
  );
  const parameters = useMemo(
    () =>
      parameterNames(
        exercise.starterFiles,
        exercise.entry.file,
        exercise.entry.name,
      ),
    [exercise],
  );
  const runner = useMemo(() => createRunner(), []);
  useEffect(() => () => runner.dispose(), [runner]);

  const [activePath, setActivePath] = useState(
    exercise.starterFiles.find(
      (file) => file.path === exercise.entry.file && !file.readOnly,
    )?.path ??
      exercise.starterFiles.find((file) => !file.readOnly)?.path ??
      exercise.starterFiles[0]?.path ??
      "",
  );
  const [problemTab, setProblemTab] = useState<ProblemTab>("problem");
  // Without tests, practice is free-form: Run shows the output, and
  // Submit ("Mark as done") records it as done.
  const withTests =
    exercise.tests.format === "cases"
      ? exercise.tests.cases.length > 0
      : exercise.tests.tests.length > 0;
  const outputTab: ResultsTab =
    exercise.kind === "function" || exercise.kind === "node"
      ? "console"
      : "preview";
  const hasCasePanel = exercise.kind === "function" && caseDrafts.length > 0;
  const [resultsTab, setResultsTab] = useState<ResultsTab>(
    hasCasePanel
      ? "testcase"
      : withTests && outputTab === "console"
        ? "tests"
        : outputTab,
  );
  const [phoneView, setPhoneView] = useState<PhoneView>("problem");
  const [report, setReport] = useState<RunReport | null>(null);
  const [consoleLines, setConsoleLines] = useState<ConsoleEntry[]>([]);
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const editor = useRef<CodeEditorHandle | null>(null);
  const pendingLine = useRef<number | null>(null);
  const { keyboardOpen, visibleHeight } = useKeyboardOpen(editorFocused);
  const panelRef = useRef<HTMLElement | null>(null);
  const layout = useWorkspaceLayout();
  const max = layout.maximized;
  const { restore } = layout;
  // Escape gives a maximised pane its place back (outside the editor, where
  // Escape belongs to the editor).
  useEffect(() => {
    if (!max) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".cm-editor")) return;
      restore();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [max, restore]);

  const recorded = useCallback(
    (response: SubmitCodingResponse) => {
      draft.markSaved(editableOnly(draft.files));
      setSubmitResult((current) =>
        current
          ? {
              ...current,
              passed: response.passed,
              passedCount: response.passedCount,
              totalCount: response.totalCount,
              attempts: response.state.attempts,
              pending: false,
            }
          : current,
      );
      if (response.passed) {
        // Solved (the server's word, also for a submit sent again later).
        pauseTimer();
        onPassed();
        setAnnouncement(
          response.totalCount === 0
            ? "Marked as done."
            : `All ${response.totalCount} tests passed. Practice done.`,
        );
      } else {
        setAnnouncement(
          `${response.passedCount} of ${response.totalCount} tests passed.`,
        );
      }
    },
    [draft, onPassed, pauseTimer],
  );
  const submitter = useSubmitWithRetry(lesson, recorded);

  const activeFile =
    draft.files.find((file) => file.path === activePath) ?? draft.files[0];
  const supportFiles = exercise.supportFiles;

  const previewInput = useMemo<PreviewInput | null>(
    () =>
      exercise.kind === "function" || exercise.kind === "node"
        ? null
        : {
            kind: exercise.kind,
            files: draft.files,
            supportFiles,
            entry: exercise.entry,
            mocks: exercise.settings.mocks,
          },
    [exercise, draft.files, supportFiles],
  );

  // A ref, not the state: two clicks in one moment must not start two runs.
  const runningRef = useRef(false);
  const run = useCallback(
    async (scope: "visible" | "all") => {
      if (runningRef.current) return null;
      runningRef.current = true;
      touchTimer();
      setRunning(scope === "all" ? "submit" : "run");
      setResultsTab(withTests ? "tests" : outputTab);
      setPhoneView("result");
      submitter.clearOutcome();
      setAnnouncement(
        scope === "all"
          ? "Running all tests."
          : withTests
            ? "Running the examples."
            : "Running your code.",
      );
      const files = draft.latestFiles();
      const base = {
        kind: exercise.kind,
        files,
        supportFiles,
        entry: exercise.entry,
        mocks: exercise.settings.mocks,
      };
      let result: Awaited<ReturnType<typeof runner.run>>;
      try {
        // Run on a function question uses the Testcase tab: unchanged
        // examples are checked, edited and added cases only run.
        const casesRun =
          scope === "visible" &&
          exercise.tests.format === "cases" &&
          caseDrafts.length > 0;
        if (casesRun && exercise.tests.format === "cases") {
          const checked = caseDrafts
            .filter(isUnchanged)
            .map((item) => item.source!);
          const own = caseDrafts.flatMap((item, index) => {
            if (isUnchanged(item)) return [];
            const parsed = parseArgs(item);
            if (!parsed.ok) return [];
            return [
              {
                id: `own:${index + 1}`,
                name: `Case ${index + 1}`,
                args: parsed.args,
                expected: null,
                compare: "deepEqual" as const,
                hidden: false,
              },
            ];
          });
          const order = caseDrafts.map((item, index) =>
            isUnchanged(item) ? item.source!.id : `own:${index + 1}`,
          );
          const checkedReport = await runner.run(
            {
              ...base,
              tests: { format: "cases", cases: checked },
              scope: "visible",
            },
            own.length ? undefined : setReport,
          );
          const ownReport = own.length
            ? await runner.run({
                ...base,
                tests: { format: "cases", cases: own },
                scope: "visible",
                collect: true,
              })
            : null;
          result = mergeReports(checkedReport, ownReport, order);
        } else {
          result = await runner.run(
            { ...base, tests: exercise.tests, scope },
            setReport,
          );
        }
      } finally {
        // Whatever happened, Run works again.
        runningRef.current = false;
        setRunning(null);
      }
      setReport(result);
      setConsoleLines(result.console);
      if (scope === "visible") {
        const passed = result.tests.filter(
          (test) => test.status === "passed",
        ).length;
        setAnnouncement(
          result.problem
            ? `Your code has an error: ${result.problem.message}`
            : withTests
              ? `${passed} of ${result.tests.length} examples passed.`
              : "Your code ran. See the output.",
        );
      }
      return { result, files };
    },
    [
      runner,
      exercise,
      draft,
      supportFiles,
      submitter,
      withTests,
      outputTab,
      caseDrafts,
      touchTimer,
    ],
  );

  const submit = useCallback(async () => {
    const ran = await run("all");
    if (!ran) return;
    // The code that was tested, not whatever the editor holds by now.
    const { result, files } = ran;
    const results = result.tests.map((test) => ({
      id: test.id,
      passed: test.status === "passed",
      ms: test.ms,
      message: test.message?.slice(0, 500),
    }));
    const failed = result.tests.find((test) => test.status !== "passed");
    const passedCount = results.filter((item) => item.passed).length;
    // The verdict shows at once, from this run; the server records it in
    // the background (and again later when offline).
    setSubmitResult({
      passed: !result.problem && passedCount === results.length,
      passedCount,
      totalCount: results.length,
      firstFailure: failed
        ? {
            name: failed.name,
            hidden: failed.hidden && !exercise.settings.showHiddenInputs,
            message:
              failed.hidden && !exercise.settings.showHiddenInputs
                ? undefined
                : failed.message,
          }
        : result.problem
          ? {
              name: "Your code",
              hidden: false,
              message: result.problem.message,
            }
          : null,
      runtimeMs: result.tests.reduce((sum, test) => sum + (test.ms ?? 0), 0),
      solveSeconds: timer.seconds,
      attempts: lesson.state.attempts + 1,
      pending: !preview,
    });
    setProblemTab("result");
    setPhoneView("problem");
    if (!result.problem && passedCount === results.length) timer.pause();
    if (preview) {
      setAnnouncement(
        `${passedCount} of ${results.length} tests passed. Preview: nothing was saved.`,
      );
      return;
    }
    submitter.submit({
      versionId: exercise.versionId,
      suiteHash: exercise.suiteHash,
      files: editableOnly(files),
      results,
      durationMs: result.durationMs,
      solveSeconds: timer.seconds,
      activeSeconds: activeTime.take(),
    });
  }, [
    run,
    submitter,
    exercise,
    timer,
    lesson.state.attempts,
    activeTime,
    preview,
  ]);

  // LeetCode's keys anywhere on the screen; inside the editor, the editor
  // handles them itself.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // The target may be the window or the document, which have no
      // `closest` (pressing the keys with nothing focused threw here).
      const target = event.target;
      if (target instanceof Element && target.closest(".cm-editor")) return;
      if (event.key === "'") {
        event.preventDefault();
        void run("visible");
      } else if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, submit]);

  const goToLine = useCallback((file: string, line: number) => {
    setPhoneView("code");
    setActivePath(file);
    pendingLine.current = line;
    window.setTimeout(() => {
      if (pendingLine.current) editor.current?.goToLine(pendingLine.current);
      pendingLine.current = null;
    }, 0);
  }, []);

  const loadCode = useCallback(
    (files: CodingFile[]) => {
      draft.replaceFiles(files);
      setPhoneView("code");
    },
    [draft],
  );

  // On a phone with the keyboard up, the editor takes the visible screen.
  useEffect(() => {
    if (keyboardOpen) panelRef.current?.scrollIntoView({ block: "start" });
  }, [keyboardOpen]);

  const errorLine =
    report?.problem?.file === activeFile?.path
      ? report?.problem?.line
      : report?.tests.find(
          (test) => test.status === "failed" && test.file === activeFile?.path,
        )?.line;

  const busy = running !== null || submitter.sending;
  const outcome = submitter.outcome;
  const visibleFiles = draft.files;

  return (
    <section
      ref={panelRef}
      aria-label={`Coding exercise: ${exercise.title}`}
      className={`@container relative flex w-full min-w-0 flex-col border-b text-(--text) ${HAIRLINE} ${CODE_TONES} ${
        keyboardOpen
          ? ""
          : fill
            ? "h-full"
            : "h-[calc(100dvh-8rem)] min-h-120 sm:h-[min(88dvh,860px)] lg:h-[min(80dvh,780px)]"
      }`}
      style={
        keyboardOpen && visibleHeight ? { height: visibleHeight } : undefined
      }
    >
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
      {layout.dragging ? (
        // Keeps the pointer over the page, not the preview frame.
        <div
          aria-hidden="true"
          className={`fixed inset-0 z-50 ${layout.dragging === "width" ? "cursor-col-resize" : "cursor-row-resize"}`}
        />
      ) : null}

      {preview && !keyboardOpen ? <PreviewBanner /> : null}
      {keyboardOpen ? null : (
        <header
          className={`flex min-h-12 items-center gap-2 border-b px-3.5 sm:px-5 ${HAIRLINE}`}
        >
          {onClose ? (
            // The quiz's way back: a quiet arrow and a word.
            <button
              type="button"
              onClick={onClose}
              className={`-ml-2 inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem]! font-semibold! text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) active:scale-[0.98] ${FOCUS_RING}`}
            >
              <ArrowLeft size={15} weight="bold" aria-hidden="true" />
              <span>Back</span>
            </button>
          ) : null}
          {nav ? (
            <QuestionNavigator nav={nav} />
          ) : (
            <>
              <CodeGlyph
                size={16}
                weight="bold"
                aria-hidden="true"
                className="shrink-0 text-(--accent-ink,var(--accent))"
              />
              <span className={`${EYEBROW} min-w-0 truncate whitespace-nowrap`}>
                {context}
              </span>
            </>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-(--text) @max-4xl:hidden">
            {exercise.title}
          </span>
          {/* Run and Submit sit in the top bar, as LeetCode's. */}
          <div className="ml-auto flex items-center gap-1.5 @max-2xl:hidden @4xl:ml-0">
            <Button
              variant="quiet"
              elevation="flat"
              className="h-9 px-3 text-sm! font-semibold!"
              disabled={busy}
              title="Run the examples (Ctrl + ')"
              onClick={() => void run("visible")}
            >
              {running === "run" ? (
                <LoadingSpinnerIcon size={16} />
              ) : (
                <Play size={15} weight="fill" aria-hidden="true" />
              )}
              Run
            </Button>
            <Button
              className="h-9 px-3.5 text-sm! font-semibold!"
              disabled={busy}
              title="Run every test and record it (Ctrl + Enter)"
              onClick={() => void submit()}
            >
              {running === "submit" || submitter.sending ? (
                <LoadingSpinnerIcon size={16} />
              ) : null}
              {withTests ? "Submit" : "Mark as done"}
            </Button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {preview ? null : <SaveStatusBadge status={draft.saveStatus} />}
            <ShortcutsButton />
            {preview ? null : <TimerControl timer={timer} />}
            {lesson.state.passed ? (
              <span
                title={withTests ? "You solved this question" : "Done"}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--code-pass)_14%,transparent)] px-2 py-0.5 text-xs font-bold text-(--code-pass)"
              >
                <CheckCircle size={13} weight="fill" aria-hidden="true" />
                <span className="@max-sm:sr-only">
                  {withTests ? "Solved" : "Done"}
                </span>
              </span>
            ) : null}
          </div>
        </header>
      )}

      {draft.fromOlderVersion ? (
        <div
          role="status"
          className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm ${HAIRLINE} bg-[color-mix(in_srgb,var(--code-warn)_10%,transparent)]`}
        >
          <span className="text-(--text)">
            This exercise was updated. Your code is kept.
          </span>
          <button
            type="button"
            onClick={draft.resetToStarter}
            className={`cursor-pointer rounded font-semibold text-(--accent-ink,var(--accent)) underline underline-offset-2 ${FOCUS_RING}`}
          >
            Start from the new starter
          </button>
          <button
            type="button"
            onClick={draft.dismissOlderVersion}
            className={`cursor-pointer rounded text-(--text-secondary) underline underline-offset-2 ${FOCUS_RING}`}
          >
            Keep my code
          </button>
        </div>
      ) : null}

      <div
        ref={layout.setContainer}
        style={
          {
            "--problem-w": `${layout.layout.problemWidth}%`,
            "--results-h": `${layout.layout.resultsHeight}%`,
            "--code-font-size": `${layout.layout.fontSize}px`,
          } as CSSProperties
        }
        className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] ${
          max
            ? ""
            : "@2xl:@max-4xl:grid-rows-[minmax(0,2fr)_minmax(0,5fr)] @4xl:grid-cols-[minmax(0,var(--problem-w))_auto_minmax(0,1fr)]"
        }`}
      >
        <div
          className={`min-h-0 overflow-hidden @2xl:@max-4xl:border-b ${HAIRLINE} ${phoneView === "problem" ? "" : "@max-2xl:hidden"} ${keyboardOpen ? "hidden" : ""} ${max && max !== "problem" ? "@2xl:hidden" : ""}`}
        >
          <ProblemPane
            lesson={lesson}
            idPrefix={`${ids}-problem`}
            tab={problemTab}
            onTabChange={setProblemTab}
            onLoadCode={loadCode}
            result={submitResult}
            actions={
              <MaximizeButton
                pane="problem"
                maximized={max}
                onToggle={layout.toggleMaximized}
              />
            }
          />
        </div>

        {max ? null : (
          <Divider
            axis="width"
            value={layout.layout.problemWidth}
            min={layout.limits.problemWidth[0]}
            max={layout.limits.problemWidth[1]}
            label="Resize the problem and the code"
            className={`hidden @4xl:block ${keyboardOpen ? "@4xl:hidden" : ""}`}
            onPointerDown={layout.startDrag("width")}
            onKeyDown={layout.dividerKeys("width")}
            onReset={() => layout.resetSize("width")}
          />
        )}

        <div
          className={`flex min-h-0 min-w-0 flex-col ${phoneView === "problem" ? "@max-2xl:hidden" : ""} ${max === "problem" ? "@2xl:hidden" : ""}`}
        >
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col ${phoneView === "code" ? "" : "@max-2xl:hidden"} ${max === "results" ? "@2xl:hidden" : ""}`}
          >
            <div
              className={`flex min-h-11 items-center gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] ${HAIRLINE}`}
              role="tablist"
              aria-label="Files"
            >
              {visibleFiles.map((file) => {
                const selected = file.path === activeFile?.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActivePath(file.path)}
                    className={`inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem]! font-semibold! font-mono! ${FOCUS_RING} ${
                      selected
                        ? "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)"
                        : "text-(--text-secondary) hover:bg-(--hover)"
                    }`}
                  >
                    {file.readOnly ? (
                      <LockSimple
                        size={12}
                        weight="bold"
                        aria-label="read-only"
                      />
                    ) : null}
                    {file.path}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-1">
                {confirmReset ? (
                  <>
                    <span className="text-xs text-(--text-secondary) whitespace-nowrap">
                      Reset all files?
                    </span>
                    <Button
                      variant="danger"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => {
                        draft.resetToStarter();
                        setConfirmReset(false);
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      variant="quiet"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => setConfirmReset(false)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div
                      role="group"
                      aria-label="Code text size"
                      className="flex items-center"
                    >
                      <IconAction
                        label="Smaller code text"
                        disabled={layout.layout.fontSize <= FONT_SIZES.min}
                        onClick={() => layout.changeFontSize(-1)}
                      >
                        <span aria-hidden="true" className="text-xs font-bold">
                          A−
                        </span>
                      </IconAction>
                      <button
                        type="button"
                        title="Reset the code text size"
                        aria-label={`Code text size ${layout.layout.fontSize} pixels. Reset`}
                        onClick={layout.resetFontSize}
                        className={`h-8 min-w-7 cursor-pointer rounded-md px-1 text-[0.6875rem]! font-semibold! text-(--muted) tabular-nums hover:bg-(--hover) hover:text-(--text) ${FOCUS_RING}`}
                      >
                        {layout.layout.fontSize}
                      </button>
                      <IconAction
                        label="Larger code text"
                        disabled={layout.layout.fontSize >= FONT_SIZES.max}
                        onClick={() => layout.changeFontSize(1)}
                      >
                        <span aria-hidden="true" className="text-sm font-bold">
                          A+
                        </span>
                      </IconAction>
                    </div>
                    <IconAction
                      label="Reset to the starter code"
                      onClick={() => setConfirmReset(true)}
                    >
                      <ArrowCounterClockwise size={16} aria-hidden="true" />
                    </IconAction>
                    <MaximizeButton
                      pane="editor"
                      maximized={max}
                      onToggle={layout.toggleMaximized}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {activeFile ? (
                <CodeEditor
                  key={activeFile.path}
                  value={activeFile.content}
                  onChange={(value) => draft.updateFile(activeFile.path, value)}
                  onUserEdit={touchTimer}
                  language={languageForPath(activeFile.path)}
                  readOnly={Boolean(activeFile.readOnly)}
                  label={`Code editor, ${activeFile.path}${activeFile.readOnly ? ", read-only" : ""}`}
                  onRun={() => void run("visible")}
                  onSubmit={() => void submit()}
                  onFocusChange={setEditorFocused}
                  errorLine={errorLine}
                  handleRef={(handle) => {
                    editor.current = handle;
                  }}
                />
              ) : null}
            </div>
            {editorFocused && keyboardOpen ? (
              <SymbolBar onInsert={(text) => editor.current?.insert(text)} />
            ) : null}
          </div>

          {max || keyboardOpen ? null : (
            <Divider
              axis="height"
              value={layout.layout.resultsHeight}
              min={layout.limits.resultsHeight[0]}
              max={layout.limits.resultsHeight[1]}
              label="Resize the code and the results"
              className="hidden @2xl:block"
              onPointerDown={layout.startDrag("height")}
              onKeyDown={layout.dividerKeys("height")}
              onReset={() => layout.resetSize("height")}
            />
          )}
          <div
            className={`min-h-0 ${phoneView === "result" ? "@max-2xl:flex-1" : "@max-2xl:hidden"} ${keyboardOpen ? "hidden" : ""} ${
              max === "results"
                ? "@2xl:flex-1"
                : max === "editor"
                  ? "@2xl:hidden"
                  : `@max-2xl:border-t ${HAIRLINE} @2xl:h-(--results-h)`
            }`}
          >
            <ResultsPane
              testcasePanel={
                hasCasePanel ? (
                  <TestcasePanel
                    drafts={caseDrafts}
                    parameters={parameters}
                    onChange={setCaseDrafts}
                  />
                ) : undefined
              }
              actions={
                <MaximizeButton
                  pane="results"
                  maximized={max}
                  onToggle={layout.toggleMaximized}
                />
              }
              kind={exercise.kind}
              withTests={withTests}
              idPrefix={`${ids}-results`}
              tab={resultsTab}
              onTabChange={setResultsTab}
              report={report}
              consoleLines={consoleLines}
              onClearConsole={() => setConsoleLines([])}
              onPreviewMessage={(message) => {
                if (message.type === "console")
                  setConsoleLines((lines) =>
                    lines.length >= 1000
                      ? lines
                      : [
                          ...lines,
                          {
                            level:
                              (message.level as ConsoleEntry["level"]) ?? "log",
                            text: String(message.text ?? ""),
                          },
                        ],
                  );
                else if (message.type === "error")
                  setConsoleLines((lines) =>
                    lines.length >= 1000
                      ? lines
                      : [
                          ...lines,
                          {
                            level: "error",
                            text: `${message.message ?? "Error"}${message.line ? ` (line ${message.line})` : ""}`,
                          },
                        ],
                  );
              }}
              previewInput={previewInput}
              showHiddenDetails={
                exercise.settings.showHiddenInputs && running === null
              }
              onGoToLine={goToLine}
            />
          </div>
        </div>
      </div>

      {keyboardOpen ? (
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => void run("visible")}
          disabled={busy}
          aria-label="Run the examples"
          className={`absolute right-3 bottom-14 z-10 inline-flex h-11 items-center gap-1.5 rounded-full bg-(--accent) px-4 text-sm! font-semibold! text-(--on-accent) shadow-lg ${FOCUS_RING}`}
        >
          {running === "run" ? (
            <LoadingSpinnerIcon size={16} />
          ) : (
            <Play size={16} weight="fill" aria-hidden="true" />
          )}
          Run
        </button>
      ) : (
        <footer
          className={`border-t ${HAIRLINE} ${outcome ? "" : "@2xl:hidden"}`}
        >
          <OutcomeBar
            outcome={outcome}
            onContinue={onContinue}
            onReload={onReload}
          />
          {/* Phones only: the views and Run/Submit. On wider screens these
              are in the top bar and the shortcuts behind its keyboard
              button, so this row takes no room. */}
          <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5 @2xl:hidden">
            <div
              role="tablist"
              aria-label="Views"
              className="flex gap-1 @2xl:hidden"
            >
              {(
                [
                  [
                    "problem",
                    "Problem",
                    <FileText
                      key="p"
                      size={16}
                      weight="bold"
                      aria-hidden="true"
                    />,
                  ],
                  [
                    "code",
                    "Code",
                    <CodeGlyph
                      key="c"
                      size={16}
                      weight="bold"
                      aria-hidden="true"
                    />,
                  ],
                  [
                    "result",
                    "Result",
                    <Flask
                      key="r"
                      size={16}
                      weight="bold"
                      aria-hidden="true"
                    />,
                  ],
                ] as const
              ).map(([view, label, icon]) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={phoneView === view}
                  onClick={() => setPhoneView(view)}
                  className={`inline-flex h-10 cursor-pointer flex-col items-center justify-center rounded-md px-2.5 text-[0.6875rem]! font-semibold! ${FOCUS_RING} ${
                    phoneView === view
                      ? "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)"
                      : "text-(--text-secondary)"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 @2xl:hidden">
              <Button
                variant="quiet"
                elevation="flat"
                className="text-sm! font-semibold! @max-2xl:px-3"
                disabled={busy}
                onClick={() => void run("visible")}
              >
                {running === "run" ? (
                  <LoadingSpinnerIcon size={16} />
                ) : (
                  <Play size={16} weight="fill" aria-hidden="true" />
                )}
                <span className="@max-sm:sr-only">Run</span>
              </Button>
              <Button
                className="text-sm! font-semibold! @max-2xl:px-3"
                disabled={busy}
                onClick={() => void submit()}
              >
                {running === "submit" || submitter.sending ? (
                  <LoadingSpinnerIcon size={16} />
                ) : null}
                {withTests ? "Submit" : "Mark as done"}
              </Button>
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}

/** Over a preview: what staff are looking at, and that nothing is kept. */
function PreviewBanner() {
  return (
    <div
      role="note"
      className="flex items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--code-warn)_30%,transparent)] bg-[color-mix(in_srgb,var(--code-warn)_12%,transparent)] px-3.5 py-2 text-[0.8125rem] sm:px-5"
    >
      <Eye
        size={16}
        weight="bold"
        aria-hidden="true"
        className="shrink-0 text-(--code-warn)"
      />
      <p className="min-w-0 flex-1 text-(--text)">
        <b className="font-semibold">Student preview.</b>{" "}
        <span className="text-(--text-secondary)">
          The newest version, as a student will see it. Run and Submit work;
          nothing is saved, and students see it only once it is published.
        </span>
      </p>
    </div>
  );
}

function OutcomeBar({
  outcome,
  onContinue,
  onReload,
}: {
  outcome: ReturnType<typeof useSubmitWithRetry>["outcome"];
  onContinue?: () => void;
  onReload: () => void;
}) {
  if (!outcome) return null;
  const base = `flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2.5 text-sm sm:px-5 ${HAIRLINE}`;
  if (outcome.kind === "passed") {
    return (
      <div
        className={`${base} bg-[color-mix(in_srgb,var(--code-pass)_11%,transparent)]`}
      >
        <CheckCircle
          size={18}
          weight="fill"
          aria-hidden="true"
          className="text-(--code-pass)"
        />
        <span className="font-semibold text-(--text)">
          {outcome.response.totalCount === 0
            ? "Marked as done. Run it again any time."
            : `All ${outcome.response.totalCount} tests passed. Practice done.`}
        </span>
        {onContinue ? (
          <Button className="ml-auto h-9" onClick={onContinue}>
            Next lesson
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    );
  }
  if (outcome.kind === "failed") {
    return (
      <div
        className={`${base} bg-[color-mix(in_srgb,var(--code-fail)_9%,transparent)]`}
      >
        <span className="font-semibold text-(--text)">
          {outcome.response.passedCount} of {outcome.response.totalCount} tests
          passed.
        </span>
        <span className="text-(--text-secondary)">
          Fix the failing tests and submit again.
        </span>
      </div>
    );
  }
  if (outcome.kind === "saving") {
    return (
      <div
        role="status"
        className={`${base} bg-[color-mix(in_srgb,var(--code-warn)_10%,transparent)]`}
      >
        <span className="font-semibold text-(--text)">
          {outcome.passed ? "Passed. Saving…" : "Saving your submit…"}
        </span>
        <span className="text-(--text-secondary)">
          We could not reach the server. Your code is safe on this device and
          will be sent when you are back online.
        </span>
      </div>
    );
  }
  if (outcome.kind === "updated") {
    return (
      <div
        role="alert"
        className={`${base} bg-[color-mix(in_srgb,var(--code-warn)_10%,transparent)]`}
      >
        <span className="text-(--text)">
          This exercise was just updated. Reload it to get the new tests; your
          code is kept.
        </span>
        <Button
          variant="quiet"
          elevation="flat"
          className="h-9"
          onClick={onReload}
        >
          Reload
        </Button>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className={`${base} bg-[color-mix(in_srgb,var(--code-fail)_9%,transparent)]`}
    >
      <span className="text-(--text)">{outcome.message}</span>
    </div>
  );
}
