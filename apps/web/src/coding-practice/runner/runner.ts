import type {
  CodingEntry,
  CodingExerciseKind,
  CodingFile,
  CodingMockRoute,
  CodingScriptTest,
  CodingTests,
} from "@veolms/contracts";
import { CODING_LIMITS } from "@veolms/contracts";
import {
  brokerDocument,
  makeNonce,
  pageDocument,
  NODE_WORKER_SOURCE,
  WORKER_SOURCE,
} from "./frames";
import {
  CodeTransformError,
  compileModule,
  findSyntaxError,
  guardLoops,
  needsCompile,
  type CodeProblem,
} from "./transform";

export type TestStatus = "pending" | "running" | "passed" | "failed";

export interface TestRow {
  id: string;
  name: string;
  hidden: boolean;
  status: TestStatus;
  message?: string;
  file?: string;
  line?: number;
  ms?: number;
  /** function kind: the call, for the results list ("findMissing([3, 0, 1])"). */
  call?: string;
  /** With `collect`: what the function returned, as JSON. */
  value?: unknown;
  expected?: string;
}

export interface ConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
}

export interface RunReport {
  tests: TestRow[];
  console: ConsoleEntry[];
  /** Code that could not run at all (syntax error, crash while loading). */
  problem: CodeProblem | null;
  /** Errors the page reported outside a test (web and React). */
  errors: CodeProblem[];
  /** Tests a script suite declared (author validation). */
  discovered: CodingScriptTest[] | null;
  durationMs: number;
  finished: boolean;
}

export interface RunInput {
  kind: CodingExerciseKind;
  /** The learner's files (editable and read-only). */
  files: CodingFile[];
  /** Hidden files the tests use. */
  supportFiles: CodingFile[];
  entry: CodingEntry;
  tests: CodingTests;
  mocks: CodingMockRoute[];
  /** "visible": Run. "all": Submit and author validation. */
  scope: "visible" | "all";
  /** Report the tests a script suite declares (author validation). */
  discover?: boolean;
  /** function kind: return each call's value instead of comparing it. */
  collect?: boolean;
}

const SUITE_TIMEOUT_MS = 10_000;
const PAGE_READY_TIMEOUT_MS = 6_000;
const MAX_CONSOLE_LINES = 1_000;

type Listener = (message: Record<string, unknown>) => void;
const listeners = new Map<
  string,
  { source: () => Window | null; listener: Listener }
>();
let listening = false;

function listen(
  nonce: string,
  source: () => Window | null,
  listener: Listener,
) {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("message", (event) => {
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data.nonce !== "string") return;
      const entry = listeners.get(data.nonce);
      if (!entry || event.source !== entry.source()) return;
      entry.listener(data);
    });
  }
  listeners.set(nonce, { source, listener });
  return () => listeners.delete(nonce);
}

/** A frame no one sees, for the broker and for test pages. */
function hiddenFrame(srcdoc: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "Code runner";
  // Laid out (not display:none) so computed styles and layout are real.
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;visibility:hidden;pointer-events:none";
  frame.srcdoc = srcdoc;
  document.body.appendChild(frame);
  return frame;
}

function describeArgs(args: unknown[]) {
  return args
    .map((arg) => {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(", ");
}

/** The test rows a run starts with, before any result arrives. */
function initialRows(input: RunInput): TestRow[] {
  const visible = (hidden: boolean) => input.scope === "all" || !hidden;
  if (input.tests.format === "cases") {
    return input.tests.cases
      .filter((test) => visible(test.hidden))
      .map((test) => ({
        id: test.id,
        name: test.name,
        hidden: test.hidden,
        status: "pending" as const,
        call: `${input.entry.name ?? "fn"}(${describeArgs(test.args)})`,
        expected: JSON.stringify(test.expected),
      }));
  }
  return input.tests.tests
    .filter((test) => visible(test.hidden))
    .map((test) => ({ ...test, status: "pending" as const }));
}

function emptyReport(input: RunInput): RunReport {
  return {
    tests: initialRows(input),
    console: [],
    problem: null,
    errors: [],
    discovered: null,
    durationMs: 0,
    finished: false,
  };
}

async function prepareModule(file: CodingFile, guard: boolean) {
  let code = file.content;
  if (needsCompile(file.path, code))
    code = await compileModule(file.path, code);
  if (guard) code = await guardLoops(file.path, code);
  return code;
}

export interface Runner {
  run(
    input: RunInput,
    onProgress?: (report: RunReport) => void,
  ): Promise<RunReport>;
  cancel(): void;
  dispose(): void;
}

/**
 * Runs exercises in sandboxed frames. JavaScript function exercises run in
 * a worker started by a warm broker frame; page exercises (web, React) run
 * in a fresh page frame per run. One run at a time; a new run cancels the
 * previous one.
 */
export function createRunner(): Runner {
  let broker: {
    frame: HTMLIFrameElement;
    nonce: string;
    ready: Promise<void>;
  } | null = null;
  let cancelCurrent: (() => void) | null = null;

  function ensureBroker() {
    if (broker && broker.frame.isConnected) return broker;
    const nonce = makeNonce();
    const frame = hiddenFrame(brokerDocument(nonce));
    let resolveReady: () => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      setTimeout(
        () =>
          reject(new Error("The code runner did not start. Reload the page.")),
        8_000,
      );
    });
    listen(
      nonce,
      () => frame.contentWindow,
      (message) => {
        if (message.type === "broker-ready") resolveReady();
        else brokerHandler?.(message);
      },
    );
    broker = { frame, nonce, ready };
    return broker;
  }
  let brokerHandler: Listener | null = null;

  function apply(report: RunReport, message: Record<string, unknown>) {
    const type = message.type;
    if (type === "console") {
      if (report.console.length < MAX_CONSOLE_LINES)
        report.console.push({
          level: (message.level as ConsoleEntry["level"]) ?? "log",
          text: String(message.text ?? ""),
        });
      else if (report.console.length === MAX_CONSOLE_LINES)
        report.console.push({ level: "warn", text: "… more output was cut." });
      return;
    }
    if (type === "discovered") {
      const tests = (message.tests as CodingScriptTest[]) ?? [];
      report.discovered = tests;
      report.tests = tests.map((test) => ({ ...test, status: "pending" }));
      return;
    }
    if (type === "test-start" || type === "test-result") {
      const id = String(message.id);
      const row = report.tests.find((test) => test.id === id);
      if (!row) return;
      if (type === "test-start") {
        row.status = "running";
        return;
      }
      row.status = message.passed ? "passed" : "failed";
      row.message = message.message ? String(message.message) : undefined;
      row.file = message.file ? String(message.file) : undefined;
      row.line = typeof message.line === "number" ? message.line : undefined;
      row.ms = typeof message.ms === "number" ? message.ms : undefined;
      if ("value" in message) row.value = message.value;
      return;
    }
    if (type === "error") {
      if (report.errors.length < 20)
        report.errors.push({
          message: String(message.message ?? "Error"),
          file: message.file ? String(message.file) : "",
          line: typeof message.line === "number" ? message.line : undefined,
        });
      return;
    }
    if (type === "fatal") {
      report.problem = {
        message: String(message.message ?? "Your code could not run."),
        file: message.file ? String(message.file) : "",
        line: typeof message.line === "number" ? message.line : undefined,
      };
    }
  }

  /** Every test not finished counts as failed, with the reason given. */
  function closeOut(report: RunReport, reason: string) {
    for (const row of report.tests) {
      if (row.status === "pending" || row.status === "running") {
        row.status = "failed";
        row.message = row.message ?? reason;
      }
    }
  }

  /** Runs a job in a fresh worker of the broker frame, reporting as it goes. */
  async function sendToBroker(
    workerSource: string,
    job: Record<string, unknown>,
    report: RunReport,
    progress: () => void,
  ) {
    const current = ensureBroker();
    await current.ready;
    const runId = makeNonce();
    await new Promise<void>((resolve) => {
      const guard = setTimeout(() => {
        current.frame.contentWindow?.postMessage(
          { type: "cancel", runId, nonce: current.nonce },
          "*",
        );
        closeOut(report, "Stopped: the tests ran out of time.");
        resolve();
      }, SUITE_TIMEOUT_MS + 4_000);
      cancelCurrent = () => {
        clearTimeout(guard);
        current.frame.contentWindow?.postMessage(
          { type: "cancel", runId, nonce: current.nonce },
          "*",
        );
        closeOut(report, "Stopped.");
        resolve();
      };
      brokerHandler = (message) => {
        if (message.runId !== runId) return;
        apply(report, message);
        if (message.type === "done") {
          clearTimeout(guard);
          resolve();
        } else progress();
      };
      current.frame.contentWindow?.postMessage(
        {
          type: "run",
          nonce: current.nonce,
          runId,
          workerSource,
          job,
        },
        "*",
      );
    });
    brokerHandler = null;
  }

  /**
   * A Node.js exercise: CommonJS modules and Node's built-in modules in the
   * broker's worker, tested with a script suite (test, expect, run).
   */
  async function runNode(
    input: RunInput,
    report: RunReport,
    progress: () => void,
  ) {
    const all = [...input.files, ...input.supportFiles];
    const code: Record<string, string> = {};
    const raw: Record<string, string> = {};
    for (const file of all) {
      raw[file.path] = file.content;
      code[file.path] =
        /\.(js|cjs|mjs|ts)$/.test(file.path) &&
        needsCompile(file.path, file.content)
          ? await compileModule(file.path, file.content)
          : file.content;
    }
    const tests = input.tests.format === "script" ? input.tests : null;
    // A TypeScript question's tests are TypeScript too.
    const testsPath = /\.tsx?$/.test(input.entry.file)
      ? "tests.ts"
      : "tests.js";
    const testSource =
      tests && tests.source.trim()
        ? needsCompile(testsPath, tests.source)
          ? await compileModule(testsPath, tests.source)
          : tests.source
        : "";
    await sendToBroker(
      NODE_WORKER_SOURCE,
      {
        kind: "node",
        code,
        raw,
        entry: input.entry,
        testSource,
        // Known up front unless the suite is being discovered (the author's
        // Check tests): the broker restarts a stopped worker for the rest.
        cases: report.tests.map((row) => ({ id: row.id, hidden: row.hidden })),
        only: input.scope,
        discover: Boolean(input.discover),
        defaultTimeoutMs:
          (tests && tests.timeoutMs) || CODING_LIMITS.defaultTestTimeoutMs,
        suiteTimeoutMs: SUITE_TIMEOUT_MS,
        paths: Object.keys(code),
      },
      report,
      progress,
    );
    if (report.problem && !report.problem.line) {
      const located = await findSyntaxError(
        all
          .filter((file) => /\.(js|cjs|mjs|ts)$/.test(file.path))
          .map((file) => ({ path: file.path, content: file.content })),
      ).catch(() => null);
      if (located) report.problem = located;
    }
  }

  async function runFunction(
    input: RunInput,
    report: RunReport,
    progress: () => void,
  ) {
    const files: Record<string, string> = {};
    for (const file of [...input.files, ...input.supportFiles]) {
      files[file.path] = needsCompile(file.path, file.content)
        ? await compileModule(file.path, file.content)
        : file.content;
    }
    if (input.tests.format !== "cases") return;
    const cases = input.tests.cases
      .filter((test) => input.scope === "all" || !test.hidden)
      .map((test) => ({
        id: test.id,
        args: test.args,
        expected: test.expected,
        compare: test.compare,
        timeoutMs: test.timeoutMs,
      }));
    await sendToBroker(
      WORKER_SOURCE,
      {
        files,
        entry: input.entry,
        cases,
        mocks: input.mocks,
        defaultTimeoutMs: CODING_LIMITS.defaultTestTimeoutMs,
        suiteTimeoutMs: SUITE_TIMEOUT_MS,
        paths: Object.keys(files),
        collect: Boolean(input.collect),
      },
      report,
      progress,
    );
    if (report.problem && !report.problem.line) {
      const located = await findSyntaxError(
        [...input.files, ...input.supportFiles].map((file) => ({
          path: file.path,
          content: file.content,
        })),
      ).catch(() => null);
      if (located) report.problem = located;
    }
  }

  async function runPage(
    input: RunInput,
    report: RunReport,
    progress: () => void,
  ) {
    const all = [...input.files, ...input.supportFiles];
    // A TypeScript question's tests may use types: compiled like its code.
    const rawTests = input.tests.format === "script" ? input.tests.source : "";
    const testSource =
      rawTests.trim() && all.some((file) => /\.tsx?$/.test(file.path))
        ? await compileModule("tests.ts", rawTests)
        : rawTests;
    const css = all
      .filter((file) => file.path.endsWith(".css"))
      .map((file) => file.content)
      .join("\n");
    const scripts: { path: string; code: string }[] = [];
    const modules: Record<string, string> = {};
    for (const file of all) {
      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(file.path)) continue;
      const code = await prepareModule(file, true);
      if (input.kind === "react") modules[file.path] = code;
      else scripts.push({ path: file.path, code });
    }
    const entryHtml =
      input.kind === "web"
        ? (all.find((file) => file.path === input.entry.file)?.content ?? "")
        : undefined;
    const nonce = makeNonce();
    const runId = makeNonce();
    const html = await pageDocument(
      {
        nonce,
        runId,
        kind: input.kind === "react" ? "react" : "web",
        entryFile: input.entry.file,
        entryHtml,
        css,
        scripts,
        modules,
        mocks: input.mocks,
        paths: Object.keys(modules).concat(
          scripts.map((script) => script.path),
        ),
      },
      (code) => guardLoops(input.entry.file, code),
    );
    const frame = hiddenFrame(html);
    try {
      await new Promise<void>((resolve) => {
        let ready = false;
        const readyTimer = setTimeout(() => {
          if (ready) return;
          report.problem = {
            message:
              "The page did not finish loading within 6 s. Is there a loop that never ends?",
            file: input.entry.file,
          };
          closeOut(report, "Not run: the page did not load.");
          resolve();
        }, PAGE_READY_TIMEOUT_MS);
        const suiteTimer = setTimeout(
          () => {
            closeOut(report, "Stopped: the tests ran out of time.");
            resolve();
          },
          PAGE_READY_TIMEOUT_MS + SUITE_TIMEOUT_MS + 2_000,
        );
        cancelCurrent = () => {
          clearTimeout(readyTimer);
          clearTimeout(suiteTimer);
          closeOut(report, "Stopped.");
          resolve();
        };
        const stop = listen(
          nonce,
          () => frame.contentWindow,
          (message) => {
            if (message.type === "ready") {
              ready = true;
              clearTimeout(readyTimer);
              frame.contentWindow?.postMessage(
                {
                  type: "run-tests",
                  nonce,
                  source: testSource,
                  only: input.scope,
                  discover: Boolean(input.discover),
                  timeoutMs:
                    (input.tests.format === "script" &&
                      input.tests.timeoutMs) ||
                    CODING_LIMITS.defaultTestTimeoutMs,
                  suiteTimeoutMs: SUITE_TIMEOUT_MS,
                },
                "*",
              );
              return;
            }
            apply(report, message);
            if (message.type === "done") {
              clearTimeout(suiteTimer);
              stop();
              resolve();
            } else progress();
          },
        );
      });
    } finally {
      frame.remove();
    }
  }

  return {
    async run(input, onProgress) {
      cancelCurrent?.();
      cancelCurrent = null;
      const report = emptyReport(input);
      const started = performance.now();
      let scheduled = false;
      const progress = () => {
        if (!onProgress || scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          onProgress({
            ...report,
            tests: report.tests.map((row) => ({ ...row })),
          });
        });
      };
      try {
        if (input.kind === "function")
          await runFunction(input, report, progress);
        else if (input.kind === "node") await runNode(input, report, progress);
        else await runPage(input, report, progress);
      } catch (error) {
        report.problem =
          error instanceof CodeTransformError
            ? error.problem
            : {
                message:
                  error instanceof Error
                    ? error.message
                    : "Your code could not run.",
                file: input.entry.file,
              };
      }
      if (report.problem)
        closeOut(report, "Not run: fix the error above first.");
      else closeOut(report, "Did not finish.");
      cancelCurrent = null;
      report.durationMs = Math.round(performance.now() - started);
      report.finished = true;
      return report;
    },
    cancel() {
      cancelCurrent?.();
      cancelCurrent = null;
    },
    dispose() {
      cancelCurrent?.();
      cancelCurrent = null;
      if (broker) {
        listeners.delete(broker.nonce);
        broker.frame.remove();
        broker = null;
      }
    },
  };
}

/* ------------------------------------------------------------- preview */

export interface PreviewInput {
  kind: "web" | "react";
  files: CodingFile[];
  supportFiles: CodingFile[];
  entry: CodingEntry;
  mocks: CodingMockRoute[];
}

/**
 * The visible preview of a web or React exercise. A fresh document for each
 * change; a change to CSS only is swapped into the live page instead.
 */
export function createPreview(
  frame: HTMLIFrameElement,
  onMessage: (message: {
    type: string;
    text?: string;
    level?: string;
    message?: string;
    file?: string;
    line?: number;
  }) => void,
) {
  let nonce = "";
  let stop: (() => void) | null = null;
  let lastNonCss = "";

  async function render(input: PreviewInput) {
    const all = [...input.files, ...input.supportFiles];
    const nonCssKey = JSON.stringify(
      all
        .filter((file) => !file.path.endsWith(".css"))
        .map((file) => [file.path, file.content]),
    );
    const css = all
      .filter((file) => file.path.endsWith(".css"))
      .map((file) => file.content)
      .join("\n");
    if (nonce && nonCssKey === lastNonCss) {
      frame.contentWindow?.postMessage({ type: "css", nonce, css }, "*");
      return null;
    }
    const scripts: { path: string; code: string }[] = [];
    const modules: Record<string, string> = {};
    try {
      for (const file of all) {
        if (!/\.(js|jsx|ts|tsx|mjs)$/.test(file.path)) continue;
        const code = await prepareModule(file, true);
        if (input.kind === "react") modules[file.path] = code;
        else scripts.push({ path: file.path, code });
      }
    } catch (error) {
      return error instanceof CodeTransformError ? error.problem : null;
    }
    stop?.();
    nonce = makeNonce();
    lastNonCss = nonCssKey;
    const html = await pageDocument(
      {
        nonce,
        runId: "preview",
        kind: input.kind,
        entryFile: input.entry.file,
        entryHtml:
          input.kind === "web"
            ? (all.find((file) => file.path === input.entry.file)?.content ??
              "")
            : undefined,
        css,
        scripts,
        modules,
        mocks: input.mocks,
        paths: Object.keys(modules).concat(
          scripts.map((script) => script.path),
        ),
      },
      (code) => guardLoops(input.entry.file, code).catch(() => code),
    );
    stop = listen(
      nonce,
      () => frame.contentWindow,
      (message) => onMessage(message as never),
    );
    frame.srcdoc = html;
    return null;
  }

  return {
    render,
    dispose() {
      stop?.();
      stop = null;
    },
  };
}
