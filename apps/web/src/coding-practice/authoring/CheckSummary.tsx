import type { ReactNode } from "react";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Button } from "../../components/Button";
import type { RunReport } from "../runner/runner";
import { CODE_TONES } from "../shared/ui";
import { ProblemNotice } from "../learner/TestResults";

function Line({
  tone,
  children,
}: {
  tone: "pass" | "fail" | "note";
  children: ReactNode;
}) {
  return (
    <p className="flex items-start gap-2 font-semibold text-(--text)">
      {tone === "pass" ? (
        <CheckCircle
          size={17}
          weight="fill"
          className="mt-px shrink-0 text-(--code-pass)"
          aria-hidden="true"
        />
      ) : tone === "fail" ? (
        <WarningCircle
          size={17}
          weight="fill"
          className="mt-px shrink-0 text-(--code-fail)"
          aria-hidden="true"
        />
      ) : (
        <Info
          size={17}
          weight="fill"
          className="mt-px shrink-0 text-(--muted)"
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </p>
  );
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * What Check tests found. Good tests pass on the author's answer and fail on
 * the starter code: the answer shows a correct solution is accepted, the
 * starter that doing nothing is not.
 */
export function CheckSummary({
  starter,
  answer,
  onPublishAnyway,
}: {
  starter: RunReport;
  /** Null: the author has not written an answer yet. */
  answer: RunReport | null;
  /** Publishing stopped at the starter warning: the author may go ahead. */
  onPublishAnyway?: () => void;
}) {
  const answerFailing =
    answer?.tests.filter((test) => test.status !== "passed") ?? [];
  const starterPassing = starter.tests.filter(
    (test) => test.status === "passed",
  );
  return (
    <div
      className={`grid gap-3 rounded-xl bg-[color-mix(in_srgb,var(--text)_5%,transparent)] px-4 py-3 text-sm ${CODE_TONES}`}
    >
      {/* On the answer: every test must pass. */}
      {answer === null ? (
        <Line tone="note">
          No answer yet. Write one in the Answer tab to make sure your tests
          accept a correct solution.
        </Line>
      ) : answer.problem ? (
        <div className="grid gap-2">
          <Line tone="fail">Your answer could not run.</Line>
          <ProblemNotice problem={answer.problem} />
        </div>
      ) : answerFailing.length === 0 ? (
        <Line tone="pass">
          Your answer passes all {plural(answer.tests.length, "test")}.
        </Line>
      ) : (
        <div className="grid gap-1">
          <Line tone="fail">
            Your answer fails {plural(answerFailing.length, "test")}, so a
            correct learner would fail too. Fix the answer or the tests:
          </Line>
          <ul className="list-disc pl-11 text-(--text-secondary)">
            {answerFailing.map((test) => (
              <li key={test.id}>
                {test.name}
                {test.message ? ` — ${test.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* On the starter code: tests should fail. */}
      {starter.problem ? (
        <div className="grid gap-2">
          <Line tone="fail">The starter code could not run.</Line>
          <ProblemNotice problem={starter.problem} />
        </div>
      ) : starterPassing.length === 0 ? (
        <Line tone="pass">
          The starter code fails all {plural(starter.tests.length, "test")}, as
          it should.
        </Line>
      ) : (
        <div className="grid gap-1 rounded-lg bg-[color-mix(in_srgb,var(--code-warn)_14%,transparent)] px-3 py-2 text-(--text)">
          <p className="font-semibold">
            {starterPassing.length === starter.tests.length
              ? "Every test already passes on the starter code."
              : "These tests already pass on the starter code:"}
          </p>
          <ul className="list-disc pl-5 text-(--text-secondary)">
            {starterPassing.map((test) => (
              <li key={test.id}>{test.name}</li>
            ))}
          </ul>
          <p className="text-(--text-secondary)">
            A learner could pass them without writing anything. Make each test
            check the work: for example, click Increment first, then Reset, and
            expect 0. Each test starts from a fresh page. (A test like
            &ldquo;starts at 0&rdquo; may pass on purpose.)
          </p>
          {onPublishAnyway ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-semibold">
                Not published yet. Fix the tests, or publish as they are.
              </span>
              <Button
                variant="quiet"
                elevation="flat"
                className="h-8 px-2.5 text-xs!"
                onClick={onPublishAnyway}
              >
                Publish anyway
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
