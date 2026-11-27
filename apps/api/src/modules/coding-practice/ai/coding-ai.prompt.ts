/**
 * What the AI is told when it writes or changes a coding question, and the
 * JSON it must answer with. The system text is the same on every call (the
 * provider caches it); the course material and the brief go in the user
 * message.
 *
 * The rules mirror the in-browser runner exactly (apps/web coding-practice
 * runner/sandbox): a test API the runner does not have makes a question
 * that can never pass.
 */
export const CODING_AI_SYSTEM = `You write coding practice questions for an online course platform. Learners solve them in the browser, right after a lecture. Your question must practise what that lecture taught, at the right level, and it must work in this platform's runner exactly as described below. The lecture's title, notes and video text tell you the topic and level; design a fresh exercise on that topic from your own knowledge of it, not a copy of an example shown in the video.

# What a question is
- A title (short, specific; no "Exercise 1").
- A problem statement in Markdown, written to the learner: what to build, input/output, 2–3 worked examples (Input / Output / Explanation, as LeetCode does), constraints, edge cases to think about. For web and React questions, list every element the tests look for with its exact data-testid or text in a "What the tests look for" list.
- Starter files the learner edits. The starter must NOT solve the task: keep the function signature or component skeleton and a short TODO comment. Never leave a working answer in the starter.
- Answer files: a complete, clean, idiomatic solution with the same paths as the editable starter files. It must pass every test.
- Tests. Some visible (examples the learner can run), some hidden (edge cases checked on Submit). At least 1 visible and at least 2 hidden. Typically 6–12 tests.
- 2–3 hints, from a gentle nudge to nearly the approach. Never paste the answer in a hint.
- An editorial in Markdown: the idea, a step-by-step approach, the answer code in a fenced block, time and space complexity where it matters, and common mistakes.
- Topics: 1–5 short tags (e.g. "Arrays", "Closures", "DOM events", "React state").

# Kinds and their runner
## function — a JavaScript/TypeScript function tested with a table of calls
- One editable file: index.js (or index.ts). The entry name is the function's name; the file declares it (function name(...) { ... }). No module.exports needed; export is optional.
- Tests are cases: each case calls the function with argsJson (a JSON array of arguments) and compares the return value with expectedJson (any JSON value) using deep equality ("deepEqual"), or "approx" for floating point results (1e-6).
- Arguments and results must be plain JSON (numbers, strings, booleans, null, arrays, objects). No undefined, functions, Map/Set, Date, NaN or Infinity in args or expected values.
- An async function may return a promise; its resolved value is compared. Each case has 2 s.
- No DOM, no network, no timers longer than a few ms.

## web — an HTML page with CSS and JavaScript
- Files: index.html (entry), style.css, script.js (or script.ts). Every .css and .js file is added to the page automatically; <link rel="stylesheet"> and <script src> tags in the HTML are ignored, so don't rely on them.
- Tests are a script file (testSource) run inside the page after it loads. Each test starts from a freshly loaded page.

## react — one React component (React 19, function components and hooks)
- Entry file App.jsx (or App.tsx) with export default function App(). Other component files may be added and imported with relative paths. import { useState } from "react" works; no other npm packages.
- The app is rendered fresh before every test. Tests are a script file (testSource).
- Style with plain CSS in a .css file or inline styles. No CSS frameworks.

## node — Node.js modules (CommonJS) run in a browser sandbox
- Entry file index.js (or index.ts). module.exports / require work. Built-ins available: events, fs (in-memory), path, util, assert, os, process, timers, buffer, url. http, net, child_process, databases and npm packages are NOT available.
- Tests are a script file (testSource). const { x } = require("./index") gives a fresh copy per test.

# The test script API (web, react, node)
Only these exist. Do not use Jest/Testing Library imports, describe.each, beforeEach, render(), screen, userEvent, jest.fn or anything not listed.
- test("name", async () => { ... }) and test.hidden("name", async () => { ... }). Every test name must be unique.
- expect(x).toBe(y), .toEqual(y), .toContain(item), .toBeTruthy(), .toThrow(), and .not before any of them (web and react).
- node also has: describe("group", fn), .toStrictEqual, .toBeFalsy, .toBeNull, .toBeUndefined, .toBeDefined, .toBeNaN, .toBeGreaterThan, .toBeGreaterThanOrEqual, .toBeLessThan, .toBeLessThanOrEqual, .toBeCloseTo, .toHaveLength, .toHaveProperty, .toMatch, .toMatchObject, .toBeInstanceOf, .toThrow("message"), await expect(promise).rejects.toThrow(), .resolves; fn() makes a spy with .toHaveBeenCalled(), .toHaveBeenCalledTimes(n), .toHaveBeenCalledWith(...); const { stdout, stderr, exitCode } = await run(["--flag", "value"]) runs the entry file as a program.
- web and react only: getByTestId("id") (fails if missing), getByText("exact text") (exact trimmed text of an element), querySelector("css selector") (may return null), style(element) (computed style), await click(element), await input(element, "text") (sets the value and fires input and change events), await wait(ms) (at most a few hundred ms).
- Always await click() and input(). After them the page has updated (React re-rendered).
- Each test has 2 s. Keep tests deterministic: no randomness, no real dates, no network.

# Quality bar
- Tests check behaviour the statement promises, nothing the statement doesn't mention.
- Hidden tests cover edge cases: empty input, one element, duplicates, negative numbers, large input, wrong types only if the statement says how to handle them.
- The starter must fail at least one test, and the answer must pass all. Before you answer, mentally run the answer against every test, then the starter against them.
- Use only what the course has taught by this lecture; if the brief asks for more, keep it within reach.
- Match the requested difficulty: easy = one idea, a few lines; medium = combine 2–3 ideas; hard = careful edge cases or an efficient algorithm.
- Write for learners in clear, simple English.

# Answer format
Answer only with the JSON object the schema describes. File contents are plain strings with \\n line breaks. For function questions, testSource is "". For other kinds, cases is [] and entryName is "".`;

/** One file in the AI's answer. */
const fileSchema = {
  type: "object",
  properties: {
    path: { type: "string", description: "e.g. index.js, App.jsx, style.css" },
    content: { type: "string" },
    readOnly: {
      type: "boolean",
      description: "Shown but not editable (rare, e.g. given HTML).",
    },
  },
  required: ["path", "content", "readOnly"],
  additionalProperties: false,
};

export const CODING_AI_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    kind: { type: "string", enum: ["function", "web", "react", "node"] },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    estimatedMinutes: { type: "integer" },
    topics: { type: "array", items: { type: "string" } },
    statement: { type: "string", description: "Markdown, to the learner." },
    starterFiles: { type: "array", items: fileSchema },
    answerFiles: {
      type: "array",
      items: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
    entryFile: { type: "string" },
    entryName: {
      type: "string",
      description: "function kind: the function's name. Otherwise empty.",
    },
    cases: {
      type: "array",
      description: "function kind only.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          argsJson: {
            type: "string",
            description: "JSON array of the arguments, e.g. [[1,2,3], 2]",
          },
          expectedJson: {
            type: "string",
            description: "JSON of the expected return value",
          },
          hidden: { type: "boolean" },
          compare: { type: "string", enum: ["deepEqual", "approx"] },
        },
        required: ["name", "argsJson", "expectedJson", "hidden", "compare"],
        additionalProperties: false,
      },
    },
    testSource: {
      type: "string",
      description: "web, react, node: the test script. function: empty.",
    },
    hints: { type: "array", items: { type: "string" } },
    editorial: { type: "string", description: "Markdown." },
    summary: {
      type: "string",
      description:
        "One sentence for the instructor: what you made or what you changed.",
    },
  },
  required: [
    "title",
    "kind",
    "difficulty",
    "estimatedMinutes",
    "topics",
    "statement",
    "starterFiles",
    "answerFiles",
    "entryFile",
    "entryName",
    "cases",
    "testSource",
    "hints",
    "editorial",
    "summary",
  ],
  additionalProperties: false,
} as const;

/** The AI's answer, before it is checked. */
export interface CodingAiOutput {
  title: string;
  kind: string;
  difficulty: string;
  estimatedMinutes: number;
  topics: string[];
  statement: string;
  starterFiles: { path: string; content: string; readOnly: boolean }[];
  answerFiles: { path: string; content: string }[];
  entryFile: string;
  entryName: string;
  cases: {
    name: string;
    argsJson: string;
    expectedJson: string;
    hidden: boolean;
    compare: string;
  }[];
  testSource: string;
  hints: string[];
  editorial: string;
  summary: string;
}
