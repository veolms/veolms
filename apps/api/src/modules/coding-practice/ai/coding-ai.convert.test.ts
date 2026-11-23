import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CODING_SETTINGS } from "../shared/coding.suite.ts";
import { convertAiOutput } from "./coding-ai.convert.ts";

const settings = DEFAULT_CODING_SETTINGS;

function functionAnswer(overrides: Record<string, unknown> = {}) {
  return {
    title: "Sum of an array",
    kind: "function",
    difficulty: "easy",
    estimatedMinutes: 10,
    topics: ["Arrays", "Loops"],
    statement: "Return the sum of `nums`.",
    starterFiles: [
      {
        path: "index.js",
        content: "function sum(nums) {\n  // TODO\n}\n",
        readOnly: false,
      },
    ],
    answerFiles: [
      {
        path: "index.js",
        content:
          "function sum(nums) {\n  return nums.reduce((a, b) => a + b, 0);\n}\n",
      },
    ],
    entryFile: "index.js",
    entryName: "sum",
    cases: [
      {
        name: "three numbers",
        argsJson: "[[1,2,3]]",
        expectedJson: "6",
        hidden: false,
        compare: "deepEqual",
      },
      {
        name: "empty",
        argsJson: "[[]]",
        expectedJson: "0",
        hidden: true,
        compare: "deepEqual",
      },
    ],
    testSource: "",
    hints: ["Start from 0.", "Add each number."],
    editorial: "Loop and add.",
    summary: "A sum question.",
    ...overrides,
  };
}

void test("an AI function question becomes a draft's content", () => {
  const { problems, question } = convertAiOutput(
    JSON.stringify(functionAnswer()),
    { settings },
  );
  assert.deepEqual(problems, []);
  assert.ok(question);
  assert.equal(question.kind, "function");
  assert.equal(question.content.entry.name, "sum");
  assert.equal(question.content.tests.format, "cases");
  if (question.content.tests.format === "cases") {
    assert.deepEqual(question.content.tests.cases[0]?.args, [[1, 2, 3]]);
    assert.equal(question.content.tests.cases[1]?.hidden, true);
  }
  assert.deepEqual(
    question.content.hints.map((hint) => hint.unlockAfterFailedSubmits),
    [0, 1],
  );
  assert.equal(question.content.editorial, "Loop and add.");
});

void test("broken case JSON and answers on unknown files are reported for the AI to fix", () => {
  const { problems, question } = convertAiOutput(
    JSON.stringify(
      functionAnswer({
        cases: [
          {
            name: "bad",
            argsJson: "[1,",
            expectedJson: "1",
            hidden: false,
            compare: "deepEqual",
          },
        ],
        answerFiles: [{ path: "other.js", content: "x" }],
      }),
    ),
    { settings },
  );
  assert.equal(question, undefined);
  assert.ok(
    problems.some((problem) => problem.includes("argsJson is not valid JSON")),
  );
  assert.ok(problems.some((problem) => problem.includes("other.js")));
});

void test("a revision must keep the question's kind", () => {
  const { problems } = convertAiOutput(JSON.stringify(functionAnswer()), {
    settings,
    requiredKind: "react",
  });
  assert.ok(problems.some((problem) => problem.includes('must stay "react"')));
});

void test("script tests need hidden tests and only the runner's API", () => {
  const { problems } = convertAiOutput(
    JSON.stringify({
      ...functionAnswer(),
      kind: "react",
      starterFiles: [
        {
          path: "App.jsx",
          content: "export default function App(){return null}",
          readOnly: false,
        },
      ],
      answerFiles: [
        {
          path: "App.jsx",
          content: "export default function App(){return <p>Hi</p>}",
        },
      ],
      entryFile: "App.jsx",
      entryName: "",
      cases: [],
      testSource:
        'import { render, screen } from "@testing-library/react";\ntest("shows hi", () => { render(); });',
    }),
    { settings },
  );
  assert.ok(problems.some((problem) => problem.includes("test.hidden")));
  assert.ok(problems.some((problem) => problem.includes("Testing Library")));
});

void test("an answer that is not JSON is refused", () => {
  assert.deepEqual(convertAiOutput("not json", { settings }).problems, [
    "The answer was not valid JSON.",
  ]);
});
