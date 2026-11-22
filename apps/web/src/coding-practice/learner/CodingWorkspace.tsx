import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
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
import { PaperPlaneRightIcon as PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
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
import { ProblemPane, type ProblemTab } from "./ProblemPane";
import { ResultsPane, type ResultsTab } from "./ResultsPane";
import { editableOnly, useCodingDraft } from "./useCodingDraft";
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
}: CodingWorkspaceProps) {
  const ids = useId();
  const { exercise } = lesson;
  const draft = useCodingDraft(lesson);
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
  const [resultsTab, setResultsTab] = useState<ResultsTab>(
    withTests && outputTab === "console" ? "tests" : outputTab,
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
      if (response.passed) {
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
    [draft, onPassed],
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

  const run = useCallback(
    async (scope: "visible" | "all") => {
      if (running) return null;
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
      const result = await runner.run(
        {
          kind: exercise.kind,
          files: draft.files,
          supportFiles,
          entry: exercise.entry,
          tests: exercise.tests,
          mocks: exercise.settings.mocks,
          scope,
        },
        setReport,
      );
      setReport(result);
      setConsoleLines(result.console);
      setRunning(null);
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
      return result;
    },
    [
      running,
      runner,
      exercise,
      draft.files,
      supportFiles,
      submitter,
      withTests,
      outputTab,
    ],
  );

  const submit = useCallback(async () => {
    const result = await run("all");
    if (!result) return;
    submitter.submit({
      versionId: exercise.versionId,
      suiteHash: exercise.suiteHash,
      files: editableOnly(draft.files),
      results: result.tests.map((test) => ({
        id: test.id,
        passed: test.status === "passed",
        ms: test.ms,
        message: test.message?.slice(0, 500),
      })),
      durationMs: result.durationMs,
    });
  }, [run, submitter, exercise, draft.files]);

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
          <CodeGlyph
            size={16}
            weight="bold"
            aria-hidden="true"
            className="shrink-0 text-(--accent-ink,var(--accent))"
          />
          <span className={EYEBROW}>{context}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-(--text) @max-2xl:hidden">
            {exercise.title}
          </span>
          {lesson.state.passed ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--code-pass)_14%,transparent)] px-2 py-0.5 text-xs font-bold text-(--code-pass)">
              <CheckCircle size={13} weight="fill" aria-hidden="true" />
              {withTests ? "Passed" : "Done"}
            </span>
          ) : null}
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
        <footer className={`border-t ${HAIRLINE}`}>
          <OutcomeBar
            outcome={outcome}
            onContinue={onContinue}
            onReload={onReload}
          />
          <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5">
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
            <p className="hidden text-xs text-(--muted) @4xl:block">
              <kbd className={MONO}>Ctrl</kbd>+<kbd className={MONO}>Enter</kbd>{" "}
              to run · add <kbd className={MONO}>Shift</kbd> to submit ·{" "}
              <kbd className={MONO}>Esc</kbd> then{" "}
              <kbd className={MONO}>Tab</kbd> leaves the editor
            </p>
            <div className="ml-auto flex items-center gap-2">
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
                ) : (
                  <PaperPlaneRight
                    size={16}
                    weight="fill"
                    aria-hidden="true"
                    className="@max-sm:hidden"
                  />
                )}
                {withTests ? "Submit" : "Mark as done"}
              </Button>
            </div>
          </div>
        </footer>
      )}
    </section>
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
