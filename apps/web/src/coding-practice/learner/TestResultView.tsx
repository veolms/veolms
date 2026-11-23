import { useState } from "react";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import type { RunReport, TestRow } from "../runner/runner";
import { FOCUS_RING, MONO } from "../shared/ui";
import { ProblemNotice, TestResultList } from "./TestResults";

export type Verdict =
  | "Accepted"
  | "Wrong Answer"
  | "Runtime Error"
  | "Compile Error"
  | "Time Limit Exceeded";

const TIMEOUT = /did not (settle|finish)|ran out of time|within \d/i;

/** A run's verdict in LeetCode's words; null while it runs or with no tests. */
export function verdictOf(report: RunReport | null): Verdict | null {
  if (!report || !report.finished) return null;
  if (report.problem)
    return /SyntaxError|Unexpected token|Unterminated/i.test(
      report.problem.message,
    )
      ? "Compile Error"
      : "Runtime Error";
  const checked = report.tests.filter((test) => !isOwnCase(test));
  if (checked.length === 0) return null;
  const failed = checked.filter((test) => test.status === "failed");
  if (failed.length === 0) return "Accepted";
  if (failed.some((test) => TIMEOUT.test(test.message ?? "")))
    return "Time Limit Exceeded";
  return "Wrong Answer";
}

/** A case the learner edited or added: run, not checked. */
export const isOwnCase = (test: Pick<TestRow, "id">) =>
  test.id.startsWith("own:");

export function VerdictHeading({
  verdict,
  report,
}: {
  verdict: Verdict;
  report: RunReport;
}) {
  const good = verdict === "Accepted";
  const checked = report.tests.filter((test) => !isOwnCase(test));
  const passed = checked.filter((test) => test.status === "passed").length;
  const runtime = checked.reduce((sum, test) => sum + (test.ms ?? 0), 0);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3">
      <h3
        className={`text-lg font-bold ${good ? "text-(--code-pass)" : "text-(--code-fail)"}`}
      >
        {verdict}
      </h3>
      {checked.length ? (
        <span className="text-sm text-(--text-secondary)">
          {passed} / {checked.length} passed
        </span>
      ) : null}
      {runtime > 0 && !report.problem ? (
        <span className="text-sm text-(--muted)">Runtime: {runtime} ms</span>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "fail" | "pass";
}) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold text-(--text-secondary)">
        {label}
      </span>
      <pre
        className={`overflow-x-auto rounded-lg bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-3 py-2 text-[0.8125rem] whitespace-pre-wrap break-all ${MONO} ${
          tone === "fail"
            ? "text-(--code-fail)"
            : tone === "pass"
              ? "text-(--code-pass)"
              : "text-(--text)"
        }`}
      >
        {value}
      </pre>
    </div>
  );
}

const outputOf = (test: TestRow) =>
  test.actual ??
  (test.value !== undefined ? JSON.stringify(test.value) : undefined);

/**
 * Function questions: Case 1, Case 2… with a pass/fail mark, and for the
 * chosen case its Input, Output and Expected, as LeetCode shows them.
 */
function CaseResults({
  tests,
  showHiddenDetails,
}: {
  tests: TestRow[];
  showHiddenDetails: boolean;
}) {
  const visible = tests.filter((test) => !test.hidden || showHiddenDetails);
  const firstFailed = Math.max(
    0,
    visible.findIndex((test) => test.status === "failed"),
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const index = Math.min(chosen ?? firstFailed, visible.length - 1);
  const test = visible[index];
  if (!test) return null;
  const output = outputOf(test);
  const own = isOwnCase(test);
  return (
    <div className="grid gap-3 p-3">
      <div role="tablist" aria-label="Cases" className="flex flex-wrap gap-1.5">
        {visible.map((item, at) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={at === index}
            onClick={() => setChosen(at)}
            className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[0.8125rem]! font-semibold! ${FOCUS_RING} ${
              at === index
                ? "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-(--text)"
                : "text-(--text-secondary) hover:bg-(--hover)"
            }`}
          >
            {item.status === "running" ? (
              <LoadingSpinnerIcon size={12} />
            ) : (
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  isOwnCase(item)
                    ? "bg-(--muted)"
                    : item.status === "passed"
                      ? "bg-(--code-pass)"
                      : item.status === "failed"
                        ? "bg-(--code-fail)"
                        : "bg-(--muted)"
                }`}
              />
            )}
            {item.hidden ? "Hidden" : `Case ${at + 1}`}
            <span className="sr-only">
              {isOwnCase(item) ? "your case" : item.status}
            </span>
          </button>
        ))}
      </div>
      {test.call ? <Field label="Input" value={test.call} /> : null}
      {output !== undefined ? (
        <Field
          label="Output"
          value={output}
          tone={own ? undefined : test.status === "failed" ? "fail" : undefined}
        />
      ) : test.status === "failed" && test.message ? (
        <Field label="Error" value={test.message} tone="fail" />
      ) : null}
      {!own && test.expected !== undefined ? (
        <Field label="Expected" value={test.expected} tone="pass" />
      ) : null}
      {own ? (
        <p className="text-xs text-(--muted)">
          Your own case: there is no expected answer to compare with.
        </p>
      ) : null}
    </div>
  );
}

/** Test Result tab: the verdict, then per case (functions) or per test. */
export function TestResultView({
  report,
  kind,
  showHiddenDetails,
  onGoToLine,
}: {
  report: RunReport | null;
  kind: "function" | "web" | "react" | "node";
  showHiddenDetails: boolean;
  onGoToLine: (file: string, line: number) => void;
}) {
  if (!report)
    return (
      <p className="px-4 py-6 text-sm text-(--muted)">
        You must run your code first. Press Run (Ctrl + &apos;).
      </p>
    );
  const verdict = verdictOf(report);
  return (
    <div>
      {verdict ? <VerdictHeading verdict={verdict} report={report} /> : null}
      {report.problem ? (
        <ProblemNotice problem={report.problem} onGoToLine={onGoToLine} />
      ) : null}
      {kind === "function" && report.tests.some((test) => test.call) ? (
        <CaseResults
          key={report.durationMs}
          tests={report.tests}
          showHiddenDetails={showHiddenDetails}
        />
      ) : (
        <TestResultList
          tests={report.tests}
          showHiddenDetails={showHiddenDetails}
          onGoToLine={onGoToLine}
        />
      )}
    </div>
  );
}
