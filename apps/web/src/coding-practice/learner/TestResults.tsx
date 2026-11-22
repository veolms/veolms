import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon as Circle } from "@phosphor-icons/react/Circle";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import type { CodeProblem } from "../runner/transform";
import type { TestRow } from "../runner/runner";
import { CODE_TONES, FOCUS_RING, MONO } from "../shared/ui";

function StatusIcon({ status }: { status: TestRow["status"] }) {
  if (status === "passed")
    return (
      <CheckCircle
        size={18}
        weight="fill"
        aria-hidden="true"
        className="text-(--code-pass)"
      />
    );
  if (status === "failed")
    return (
      <XCircle
        size={18}
        weight="fill"
        aria-hidden="true"
        className="text-(--code-fail)"
      />
    );
  if (status === "running")
    return (
      <span className="text-(--muted)" aria-hidden="true">
        <LoadingSpinnerIcon size={16} />
      </span>
    );
  return (
    <Circle
      size={18}
      aria-hidden="true"
      className="text-(--muted) opacity-60"
    />
  );
}

const STATUS_TEXT: Record<TestRow["status"], string> = {
  passed: "Passed",
  failed: "Failed",
  running: "Running",
  pending: "Not run yet",
};

/** "Line 4" that moves the editor to the line. */
export function LineLink({
  file,
  line,
  onGoToLine,
}: {
  file?: string;
  line?: number;
  onGoToLine?: (file: string, line: number) => void;
}) {
  if (!line || !file) return null;
  return (
    <button
      type="button"
      onClick={() => onGoToLine?.(file, line)}
      className={`cursor-pointer rounded text-xs! font-semibold! text-(--accent-ink,var(--accent)) underline underline-offset-2 ${FOCUS_RING}`}
    >
      {file}, line {line}
    </button>
  );
}

export function ProblemNotice({
  problem,
  onGoToLine,
}: {
  problem: CodeProblem;
  onGoToLine?: (file: string, line: number) => void;
}) {
  return (
    <div
      role="alert"
      className={`mx-3 mt-3 rounded-lg px-3 py-2.5 text-sm ${CODE_TONES} bg-[color-mix(in_srgb,var(--code-fail)_11%,transparent)] text-(--text)`}
    >
      <p
        className={`${MONO} text-[0.8125rem] leading-relaxed break-words text-(--code-fail)`}
      >
        {problem.message}
      </p>
      <LineLink
        file={problem.file}
        line={problem.line}
        onGoToLine={onGoToLine}
      />
    </div>
  );
}

/** An assertion says what was expected; a hidden test keeps that to itself. */
const ASSERTION_MESSAGE = /^(AssertionError:\s*)?Expected\b/;

/**
 * The tests, one row each. A hidden test shows its name only, unless the
 * exercise allows showing what it checks after a failure.
 */
export function TestResultList({
  tests,
  showHiddenDetails,
  onGoToLine,
}: {
  tests: TestRow[];
  showHiddenDetails: boolean;
  onGoToLine?: (file: string, line: number) => void;
}) {
  if (tests.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-(--muted)">
        Press Run to check your code against the examples.
      </p>
    );
  }
  return (
    <ul className={`grid gap-1 p-2 ${CODE_TONES}`}>
      {tests.map((test) => {
        const details = !test.hidden || showHiddenDetails;
        return (
          <li
            key={test.id}
            className={`flex gap-3 rounded-lg px-3 py-2.5 ${
              test.status === "failed"
                ? "bg-[color-mix(in_srgb,var(--code-fail)_7%,transparent)]"
                : "bg-[color-mix(in_srgb,var(--text)_3.5%,transparent)]"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              <StatusIcon status={test.status} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-(--text)">
                {test.hidden ? (
                  <span className="inline-flex items-center gap-1 text-(--muted)">
                    <LockSimple size={13} weight="bold" aria-hidden="true" />
                    Hidden test
                  </span>
                ) : null}
                <span className="break-words">{test.name}</span>
                <span className="sr-only">{STATUS_TEXT[test.status]}</span>
                {test.ms !== undefined && test.status !== "pending" ? (
                  <span className="text-xs font-normal text-(--muted)">
                    {test.ms} ms
                  </span>
                ) : null}
              </p>
              {details && test.call ? (
                <p
                  className={`${MONO} mt-0.5 text-xs break-all text-(--text-secondary)`}
                >
                  {test.call} → {test.expected}
                </p>
              ) : null}
              {test.status === "failed" && test.message ? (
                <p
                  className={`${MONO} mt-1 text-xs leading-relaxed break-words text-(--code-fail)`}
                >
                  {details || !ASSERTION_MESSAGE.test(test.message)
                    ? test.message
                    : "Your answer is not the expected one."}
                </p>
              ) : null}
              {test.status === "failed" ? (
                <LineLink
                  file={test.file}
                  line={test.line}
                  onGoToLine={onGoToLine}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
