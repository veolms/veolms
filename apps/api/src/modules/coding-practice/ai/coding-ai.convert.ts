import {
  CODING_LIMITS,
  codingDifficultySchema,
  codingEntrySchema,
  codingExerciseKindSchema,
  codingFilesSchema,
  codingHintSchema,
  codingTestsSchema,
  codingTopicSchema,
  type CodingDifficulty,
  type CodingExerciseKind,
  type CodingFile,
  type CodingSettings,
  type CodingTests,
} from "@veolms/contracts";
import { testsFormatFor, type CodingContent } from "../shared/coding.suite.ts";
import type { CodingAiOutput } from "./coding-ai.prompt.ts";

export interface ConvertedQuestion {
  title: string;
  kind: CodingExerciseKind;
  difficulty: CodingDifficulty;
  estimatedMinutes: number;
  topics: string[];
  content: CodingContent;
  summary: string;
}

const slug = (text: string, index: number) =>
  `${
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "case"
  }-${index + 1}`;

/**
 * Checks the AI's answer against what the platform accepts and turns it
 * into a question's content. Returns the problems in words the AI can fix
 * (they are sent back to it once), or the question.
 */
export function convertAiOutput(
  raw: string,
  options: {
    settings: CodingSettings;
    /** A revision keeps the question's kind. */
    requiredKind?: CodingExerciseKind;
  },
): { problems: string[]; question?: ConvertedQuestion } {
  let output: CodingAiOutput;
  try {
    output = JSON.parse(raw) as CodingAiOutput;
  } catch {
    return { problems: ["The answer was not valid JSON."] };
  }
  const problems: string[] = [];

  const kind = codingExerciseKindSchema.safeParse(output.kind);
  if (!kind.success) return { problems: [`Unknown kind "${output.kind}".`] };
  if (options.requiredKind && kind.data !== options.requiredKind)
    problems.push(
      `The kind must stay "${options.requiredKind}" (you returned "${kind.data}").`,
    );
  const difficulty = codingDifficultySchema.safeParse(output.difficulty);

  const title = String(output.title ?? "").trim();
  if (!title) problems.push("The title is empty.");
  if (title.length > CODING_LIMITS.maxTitleChars)
    problems.push(
      `The title is longer than ${CODING_LIMITS.maxTitleChars} characters.`,
    );
  if (!String(output.statement ?? "").trim())
    problems.push("The statement is empty.");
  if ((output.statement ?? "").length > CODING_LIMITS.maxStatementChars)
    problems.push("The statement is too long.");

  const starter = codingFilesSchema.safeParse(
    (output.starterFiles ?? []).map((file) => ({
      path: String(file.path ?? "").trim(),
      content: String(file.content ?? ""),
      ...(file.readOnly ? { readOnly: true } : {}),
    })),
  );
  if (!starter.success)
    problems.push(
      `Starter files: ${starter.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  const starterFiles: CodingFile[] = starter.success ? starter.data : [];
  if (starter.success && starterFiles.length === 0)
    problems.push("There are no starter files.");

  const answer = codingFilesSchema.safeParse(
    (output.answerFiles ?? []).map((file) => ({
      path: String(file.path ?? "").trim(),
      content: String(file.content ?? ""),
    })),
  );
  if (!answer.success)
    problems.push(
      `Answer files: ${answer.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  const solutionFiles: CodingFile[] = answer.success ? answer.data : [];
  const editable = new Set(
    starterFiles.filter((file) => !file.readOnly).map((file) => file.path),
  );
  for (const file of solutionFiles)
    if (!editable.has(file.path))
      problems.push(
        `Answer file ${file.path} is not an editable starter file (answer files use the editable starter paths).`,
      );
  if (solutionFiles.length === 0) problems.push("There is no answer.");

  const entry = codingEntrySchema.safeParse({
    file: String(output.entryFile ?? "").trim(),
    ...(kind.data === "function" && output.entryName
      ? { name: String(output.entryName).trim() }
      : {}),
  });
  if (!entry.success)
    problems.push(
      `Entry: ${entry.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  else if (!starterFiles.some((file) => file.path === entry.data.file))
    problems.push(`The entry file ${entry.data.file} is not a starter file.`);
  if (kind.data === "function" && !output.entryName)
    problems.push("A function question needs entryName.");

  let tests: CodingTests | null = null;
  if (testsFormatFor(kind.data) === "cases") {
    const cases = (output.cases ?? []).map((item, index) => {
      let args: unknown = null;
      let expected: unknown = null;
      try {
        args = JSON.parse(item.argsJson);
      } catch {
        problems.push(`Case "${item.name}": argsJson is not valid JSON.`);
      }
      try {
        expected = JSON.parse(item.expectedJson);
      } catch {
        problems.push(`Case "${item.name}": expectedJson is not valid JSON.`);
      }
      if (args !== null && !Array.isArray(args))
        problems.push(`Case "${item.name}": argsJson must be a JSON array.`);
      return {
        id: slug(item.name ?? "", index),
        name:
          String(item.name ?? `Case ${index + 1}`).slice(0, 160) ||
          `Case ${index + 1}`,
        args: Array.isArray(args) ? args : [],
        expected,
        compare:
          item.compare === "approx"
            ? ("approx" as const)
            : ("deepEqual" as const),
        hidden: Boolean(item.hidden),
      };
    });
    if (cases.length === 0) problems.push("There are no test cases.");
    if (cases.length > 0 && cases.every((item) => item.hidden))
      problems.push("At least one case must be visible.");
    const parsed = codingTestsSchema.safeParse({ format: "cases", cases });
    if (!parsed.success)
      problems.push(
        `Cases: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
      );
    else tests = parsed.data;
  } else {
    const source = String(output.testSource ?? "");
    if (!/\btest(\.hidden)?\s*\(/.test(source))
      problems.push("The test script has no test(...) calls.");
    if (!/\btest\.hidden\s*\(/.test(source))
      problems.push("Add hidden tests with test.hidden(...).");
    if (
      /\bfrom\s+["']@testing-library|\brender\s*\(|\bscreen\.|\bjest\./.test(
        source,
      )
    )
      problems.push(
        "The test script uses an API the runner does not have (Testing Library, render, screen or jest). Use only the listed functions.",
      );
    if (source.length > CODING_LIMITS.maxTestSourceBytes)
      problems.push("The test script is too long.");
    tests = { format: "script", source, tests: [] };
  }

  const hints = (output.hints ?? [])
    .map((body) => String(body ?? "").trim())
    .filter(Boolean)
    .slice(0, CODING_LIMITS.maxHints)
    .map((body, index) =>
      codingHintSchema.parse({
        id: `hint-${index + 1}`,
        body: body.slice(0, 4_000),
        unlockAfterFailedSubmits: index,
      }),
    );

  const topics = (output.topics ?? [])
    .map((topic) => String(topic ?? "").trim())
    .filter((topic) => codingTopicSchema.safeParse(topic).success)
    .slice(0, 8);

  if (problems.length > 0 || !tests || !entry.success)
    return {
      problems: problems.length ? problems : ["The answer is incomplete."],
    };

  return {
    problems: [],
    question: {
      title: title.slice(0, CODING_LIMITS.maxTitleChars),
      kind: kind.data,
      difficulty: difficulty.success ? difficulty.data : "easy",
      estimatedMinutes: Math.min(
        240,
        Math.max(1, Math.round(Number(output.estimatedMinutes) || 15)),
      ),
      topics,
      content: {
        statement: output.statement,
        starterFiles,
        solutionFiles,
        entry: entry.data,
        tests,
        hints,
        settings: options.settings,
        editorial: String(output.editorial ?? "").slice(
          0,
          CODING_LIMITS.maxEditorialChars,
        ),
      },
      summary: String(output.summary ?? "").slice(0, 300),
    },
  };
}
