import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserIcon as BrowserGlyph } from "@phosphor-icons/react/Browser";
import { FlaskIcon as Flask } from "@phosphor-icons/react/Flask";
import { TerminalWindowIcon as TerminalWindow } from "@phosphor-icons/react/TerminalWindow";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import type { CodingExerciseKind } from "@veolms/contracts";
import {
  createPreview,
  type ConsoleEntry,
  type PreviewInput,
  type RunReport,
} from "../runner/runner";
import type { CodeProblem } from "../runner/transform";
import {
  CODE_TONES,
  HAIRLINE,
  IconAction,
  MONO,
  PanelTabs,
} from "../shared/ui";
import { ProblemNotice, TestResultList } from "./TestResults";

export type ResultsTab = "tests" | "console" | "preview";

const LEVEL_TONE: Record<ConsoleEntry["level"], string> = {
  log: "text-(--text)",
  info: "text-(--text-secondary)",
  debug: "text-(--muted)",
  warn: "text-(--code-warn)",
  error: "text-(--code-fail)",
};

const PREVIEW_DELAY_MS = 600;

export function ResultsPane({
  kind,
  withTests = true,
  idPrefix,
  tab,
  onTabChange,
  report,
  consoleLines,
  onClearConsole,
  onPreviewMessage,
  previewInput,
  showHiddenDetails,
  onGoToLine,
  actions,
}: {
  /** Buttons at the end of the tab row (maximise). */
  actions?: ReactNode;
  kind: CodingExerciseKind;
  /** False for free practice: no Tests tab. */
  withTests?: boolean;
  idPrefix: string;
  tab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
  report: RunReport | null;
  consoleLines: ConsoleEntry[];
  onClearConsole: () => void;
  onPreviewMessage: (message: {
    type: string;
    level?: string;
    text?: string;
    message?: string;
    file?: string;
    line?: number;
  }) => void;
  previewInput: PreviewInput | null;
  showHiddenDetails: boolean;
  onGoToLine: (file: string, line: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const previewRef = useRef<ReturnType<typeof createPreview> | null>(null);
  const [previewProblem, setPreviewProblem] = useState<CodeProblem | null>(
    null,
  );
  const messageRef = useRef(onPreviewMessage);
  messageRef.current = onPreviewMessage;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const preview = createPreview(frame, (message) =>
      messageRef.current(message),
    );
    previewRef.current = preview;
    return () => {
      preview.dispose();
      previewRef.current = null;
    };
  }, []);

  // The preview follows the code a moment after typing stops, and only
  // while it is shown: a hidden preview is brought up to date when opened.
  const renderedInput = useRef<PreviewInput | null>(null);
  useEffect(() => {
    if (!previewInput || tab !== "preview") return undefined;
    if (renderedInput.current === previewInput) return undefined;
    const delay = renderedInput.current ? PREVIEW_DELAY_MS : 0;
    const timer = window.setTimeout(() => {
      renderedInput.current = previewInput;
      void previewRef.current?.render(previewInput).then(setPreviewProblem);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [previewInput, tab]);

  const passed =
    report?.tests.filter((test) => test.status === "passed").length ?? 0;
  const total = report?.tests.length ?? 0;
  const hasPreview = kind === "web" || kind === "react";

  return (
    <div className={`flex h-full min-h-0 flex-col ${CODE_TONES}`}>
      <PanelTabs<ResultsTab>
        idPrefix={idPrefix}
        label="Results"
        active={tab}
        onChange={onTabChange}
        tabs={[
          ...(withTests
            ? [
                {
                  id: "tests" as const,
                  label: "Tests",
                  icon: <Flask size={15} weight="bold" aria-hidden="true" />,
                  badge:
                    report && total > 0 ? (
                      <span
                        className={`rounded-full px-1.5 text-[0.6875rem] font-bold ${
                          passed === total
                            ? "bg-[color-mix(in_srgb,var(--code-pass)_16%,transparent)] text-(--code-pass)"
                            : "bg-[color-mix(in_srgb,var(--code-fail)_14%,transparent)] text-(--code-fail)"
                        }`}
                      >
                        {passed}/{total}
                      </span>
                    ) : undefined,
                },
              ]
            : []),
          {
            id: "console",
            label: "Console",
            icon: <TerminalWindow size={15} weight="bold" aria-hidden="true" />,
            badge: consoleLines.length ? (
              <span className="text-[0.6875rem] font-bold text-(--muted)">
                {Math.min(consoleLines.length, 999)}
              </span>
            ) : undefined,
          },
          ...(hasPreview
            ? [
                {
                  id: "preview" as const,
                  label: "Preview",
                  icon: (
                    <BrowserGlyph size={15} weight="bold" aria-hidden="true" />
                  ),
                },
              ]
            : []),
        ]}
        trailing={
          <>
            {tab === "console" && consoleLines.length ? (
              <IconAction label="Clear the console" onClick={onClearConsole}>
                <Trash size={15} aria-hidden="true" />
              </IconAction>
            ) : null}
            {actions}
          </>
        }
      />
      <div
        id={`${idPrefix}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${tab}`}
        className="relative min-h-0 flex-1 overflow-auto"
      >
        {tab === "tests" ? (
          <>
            {report?.problem ? (
              <ProblemNotice problem={report.problem} onGoToLine={onGoToLine} />
            ) : null}
            <TestResultList
              tests={report?.tests ?? []}
              showHiddenDetails={showHiddenDetails}
              onGoToLine={onGoToLine}
            />
            {report && !report.problem && report.errors.length > 0 ? (
              <div className={`border-t px-4 py-3 ${HAIRLINE}`}>
                <p className="text-xs font-semibold text-(--text-secondary)">
                  Errors while the page ran
                </p>
                {report.errors.slice(0, 3).map((error, index) => (
                  <p
                    key={index}
                    className={`${MONO} mt-1 text-xs break-words text-(--code-fail)`}
                  >
                    {error.message}
                    {error.line ? ` (line ${error.line})` : ""}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
        {tab === "console" ? (
          consoleLines.length === 0 ? (
            <p className="px-4 py-6 text-sm text-(--muted)">
              What your code prints with console.log appears here.
            </p>
          ) : (
            <ol
              className={`${MONO} divide-y divide-[color-mix(in_srgb,var(--text)_7%,transparent)] text-[0.8125rem]`}
            >
              {consoleLines.map((line, index) => (
                <li
                  key={index}
                  className={`px-4 py-1.5 leading-relaxed whitespace-pre-wrap break-words ${LEVEL_TONE[line.level]}`}
                >
                  {line.text}
                </li>
              ))}
            </ol>
          )
        ) : null}
        {hasPreview ? (
          <div
            className={
              tab === "preview" ? "flex h-full min-h-60 flex-col" : "hidden"
            }
          >
            {previewProblem ? (
              <ProblemNotice problem={previewProblem} onGoToLine={onGoToLine} />
            ) : null}
            <iframe
              ref={frameRef}
              title="Preview of your page"
              sandbox="allow-scripts"
              className="min-h-60 w-full flex-1 border-0 bg-white"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
