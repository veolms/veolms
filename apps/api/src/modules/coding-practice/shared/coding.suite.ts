import crypto from "node:crypto";
import type {
  CodingEntry,
  CodingExerciseKind,
  CodingLanguage,
  CodingFile,
  CodingHint,
  CodingSettings,
  CodingTests,
} from "@veolms/contracts";

/** Everything a version holds besides its number and dates. */
export interface CodingContent {
  statement: string;
  starterFiles: CodingFile[];
  solutionFiles: CodingFile[];
  entry: CodingEntry;
  tests: CodingTests;
  hints: CodingHint[];
  settings: CodingSettings;
}

/** JSON with object keys sorted, so equal content always hashes equal. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

/**
 * The fingerprint of what grading depends on: the kind, the entry, the
 * tests, the files the tests rely on and the mocked network. A submission
 * sends back the fingerprint it was graded with, so one graded against an
 * older or edited suite is refused.
 */
export function suiteHash(kind: CodingExerciseKind, content: CodingContent) {
  const supportFiles = content.starterFiles
    .filter((file) => file.hidden)
    .map((file) => ({ path: file.path, content: file.content }));
  return crypto
    .createHash("sha256")
    .update(
      canonicalJson({
        kind,
        entry: content.entry,
        tests: content.tests,
        supportFiles,
        mocks: content.settings.mocks,
      }),
    )
    .digest("hex");
}

/** The ids of the tests a submission must report, in suite order. */
export function expectedTests(tests: CodingTests) {
  return tests.format === "cases"
    ? tests.cases.map((test) => ({
        id: test.id,
        name: test.name,
        hidden: test.hidden,
      }))
    : tests.tests;
}

/** Whether the author wrote any tests (practice without tests is allowed). */
export function hasTests(tests: CodingTests) {
  return tests.format === "cases"
    ? tests.cases.length > 0
    : tests.source.trim().length > 0;
}

export function totalBytes(files: readonly CodingFile[]) {
  return files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
    0,
  );
}

/** What each kind's tests look like. */
export function testsFormatFor(kind: CodingExerciseKind) {
  return kind === "function" ? "cases" : "script";
}

/**
 * A blank exercise to start from, per kind and language. Only a React
 * component starts with code: the runner renders the file's default export.
 */
export function templateFor(
  kind: CodingExerciseKind,
  language: CodingLanguage = "javascript",
): CodingContent {
  const ts = language === "typescript";
  const settings: CodingSettings = {
    mocks: [],
    bestOnDesktop: false,
    showHiddenInputs: false,
  };
  const empty = {
    statement: "",
    solutionFiles: [],
    hints: [],
    settings,
  };
  const script: CodingTests = { format: "script", source: "", tests: [] };
  if (kind === "function" || kind === "node") {
    const file = ts ? "index.ts" : "index.js";
    return {
      ...empty,
      starterFiles: [{ path: file, content: "" }],
      entry: { file },
      tests: kind === "function" ? { format: "cases", cases: [] } : script,
    };
  }
  if (kind === "web")
    return {
      ...empty,
      starterFiles: [
        { path: "index.html", content: "" },
        { path: "style.css", content: "" },
        { path: ts ? "script.ts" : "script.js", content: "" },
      ],
      entry: { file: "index.html" },
      tests: script,
    };
  const file = ts ? "App.tsx" : "App.jsx";
  return {
    ...empty,
    starterFiles: [
      {
        path: file,
        content: "export default function App() {\n  return <div></div>;\n}\n",
      },
    ],
    entry: { file },
    tests: script,
  };
}
