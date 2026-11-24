import type { RunReport } from "../runner/runner";

const line = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 300);

/**
 * What Check tests found, in words the AI can act on: which tests the
 * answer fails (with why) and which the starter already passes.
 */
export function describeCheck(
  starter: RunReport | null,
  answer: RunReport | null,
): string {
  const parts: string[] = [];
  if (answer?.problem)
    parts.push(`The answer does not run: ${line(answer.problem.message)}`);
  const answerFails = (answer?.tests ?? []).filter(
    (test) => test.status !== "passed",
  );
  if (answerFails.length)
    parts.push(
      `The answer fails ${answerFails.length} test(s):\n${answerFails
        .slice(0, 12)
        .map(
          (test) =>
            `- "${test.name}"${test.call ? ` (${test.call})` : ""}: ${line(test.message ?? "failed")}`,
        )
        .join("\n")}`,
    );
  if (starter?.problem && !starter.tests.length)
    parts.push(`The starter does not run: ${line(starter.problem.message)}`);
  const starterPasses = (starter?.tests ?? []).filter(
    (test) => test.status === "passed",
  );
  if (starterPasses.length)
    parts.push(
      `The starter code already passes ${starterPasses.length} test(s), so they check nothing the learner writes: ${starterPasses
        .slice(0, 12)
        .map((test) => `"${test.name}"`)
        .join(", ")}`,
    );
  if (starter && starter.discovered && starter.discovered.length === 0)
    parts.push("No tests were found in the test file.");
  return parts.join("\n\n").slice(0, 7_500);
}

/** Check found something the AI could fix. */
export function checkHasProblems(
  starter: RunReport | null,
  answer: RunReport | null,
) {
  return describeCheck(starter, answer).length > 0;
}
