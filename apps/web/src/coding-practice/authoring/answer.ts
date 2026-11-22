import type { CodingFile } from "@veolms/contracts";
import type { RunInput } from "../runner/runner";
import type { ExerciseForm } from "./useExerciseForm";

/**
 * The author's own answer: code that solves the question, saved with it as
 * its solution files and never sent to learners. Tests are run on it to
 * show they accept a correct answer, and on the starter code to show they
 * do not accept an empty one.
 */
export function hasAnswer(form: ExerciseForm) {
  return form.solutionFiles.some((file) => file.content.trim().length > 0);
}

/** The answer to start from: the learner's visible starter files. */
export function answerFromStarter(form: ExerciseForm): CodingFile[] {
  return form.starterFiles
    .filter((file) => !file.hidden)
    .map((file) => ({ path: file.path, content: file.content }));
}

/** What the learner sees, or the author's answer in its place. */
export function runInputFor(
  kind: RunInput["kind"],
  form: ExerciseForm,
  code: "starter" | "answer",
): RunInput {
  const visible = form.starterFiles.filter((file) => !file.hidden);
  const files =
    code === "starter"
      ? visible
      : [
          ...visible.map(
            (file) =>
              form.solutionFiles.find((answer) => answer.path === file.path) ??
              file,
          ),
          ...form.solutionFiles.filter(
            (answer) => !visible.some((file) => file.path === answer.path),
          ),
        ];
  return {
    kind,
    files,
    supportFiles: form.starterFiles.filter((file) => file.hidden),
    entry: form.entry,
    tests: form.tests,
    mocks: form.settings.mocks,
    scope: "all",
    discover: form.tests.format === "script",
  };
}
