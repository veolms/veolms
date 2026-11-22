/**
 * Turns learner code into what the sandbox runs. Runs on the lesson page:
 * it parses code but never executes it. Both libraries load only when a
 * lesson needs them (React or TypeScript code, page exercises).
 *
 * Order: Sucrase strips JSX and types (keeping every line where it was),
 * then meriyah parses the plain JavaScript and the loop guard is inserted
 * on the same lines, so errors point at the learner's own line numbers.
 */

export interface CodeProblem {
  message: string;
  file: string;
  line?: number;
  column?: number;
}

export class CodeTransformError extends Error {
  readonly problem: CodeProblem;
  constructor(problem: CodeProblem) {
    super(problem.message);
    this.problem = problem;
  }
}

const MODULE_SYNTAX = /^\s*(import\s|import\{|export\s|export\{)/m;
const JSX_OR_TS_FILE = /\.(jsx|tsx|ts)$/;

/** Whether a file must go through Sucrase before it can run. */
export function needsCompile(path: string, source: string) {
  return JSX_OR_TS_FILE.test(path) || MODULE_SYNTAX.test(source);
}

/** Parsers say where as "(3:5)" (Sucrase) or "[3:0-3:1]:" (meriyah). */
const POSITION_IN_MESSAGE =
  /^\[(\d+):(\d+)(?:-\d+:\d+)?\]:?\s*|\s*\((\d+):(\d+)\)\s*$/;

function locationOf(error: unknown) {
  const value = error as {
    loc?: {
      line?: number;
      column?: number;
      start?: { line?: number; column?: number };
    };
    line?: number;
    column?: number;
  };
  const match = POSITION_IN_MESSAGE.exec(
    error instanceof Error ? error.message : String(error),
  );
  const line =
    value?.loc?.line ??
    value?.loc?.start?.line ??
    value?.line ??
    (match ? Number(match[1] ?? match[3]) : undefined);
  const column =
    value?.loc?.column ??
    value?.loc?.start?.column ??
    value?.column ??
    (match ? Number(match[2] ?? match[4]) : undefined);
  return {
    line: typeof line === "number" && line > 0 ? line : undefined,
    column: typeof column === "number" ? column + 1 : undefined,
  };
}

function cleanMessage(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(POSITION_IN_MESSAGE, "")
    .replace(/'?end of source'?/, "the end of the code (is a } or ) missing?)");
}

/** JSX, TypeScript and import/export to CommonJS the sandbox can load. */
export async function compileModule(path: string, source: string) {
  const { transform } = await import("sucrase");
  const isTs = /\.tsx?$/.test(path);
  const hasJsx = /\.(jsx|tsx)$/.test(path) || /<[A-Za-z>]/.test(source);
  try {
    return transform(source, {
      transforms: [
        ...(hasJsx ? (["jsx"] as const) : []),
        ...(isTs ? (["typescript"] as const) : []),
        "imports",
      ],
      jsxRuntime: "automatic",
      production: true,
      filePath: path,
    }).code;
  } catch (error) {
    throw new CodeTransformError({
      message: `SyntaxError: ${cleanMessage(error)}`,
      file: path,
      ...locationOf(error),
    });
  }
}

interface AstNode {
  type: string;
  start: number;
  end: number;
  loc: { start: { line: number } };
  body?: AstNode;
  [key: string]: unknown;
}

const LOOPS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);

interface Edit {
  position: number;
  text: string;
  /** Closings come before openings at one position. */
  closing: boolean;
  depth: number;
}

/**
 * Inserts the loop guard: `__gs(id)` as a loop starts and `__g(id, line)`
 * on every pass. `__g` throws once a loop has run for a second, so an
 * endless loop stops with its line number instead of freezing the page.
 * No newline is added, so line numbers do not move.
 */
export async function guardLoops(path: string, source: string) {
  const { parseScript } = await import("meriyah");
  let program: AstNode;
  try {
    program = parseScript(source, {
      ranges: true,
      loc: true,
      next: true,
      webcompat: true,
    }) as unknown as AstNode;
  } catch (error) {
    throw new CodeTransformError({
      message: `SyntaxError: ${cleanMessage(error)}`,
      file: path,
      ...locationOf(error),
    });
  }
  const edits: Edit[] = [];
  let nextId = 1;

  function visit(node: unknown, parent: AstNode | null, depth: number) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parent, depth);
      return;
    }
    const current = node as AstNode;
    if (typeof current.type !== "string") return;
    let childDepth = depth;
    if (LOOPS.has(current.type) && current.body) {
      const id = nextId++;
      const line = current.loc.start.line;
      const target =
        parent?.type === "LabeledStatement" && parent.body === current
          ? parent
          : current;
      edits.push(
        {
          position: target.start,
          text: `{__gs(${id});`,
          closing: false,
          depth,
        },
        { position: target.end, text: "}", closing: true, depth },
      );
      const body = current.body;
      if (body.type === "BlockStatement") {
        edits.push({
          position: body.start + 1,
          text: `__g(${id},${line});`,
          closing: false,
          depth: depth + 1,
        });
      } else {
        edits.push(
          {
            position: body.start,
            text: `{__g(${id},${line});`,
            closing: false,
            depth: depth + 1,
          },
          { position: body.end, text: "}", closing: true, depth: depth + 1 },
        );
      }
      childDepth = depth + 2;
    }
    for (const key of Object.keys(current)) {
      if (key === "loc" || key === "range" || key === "start" || key === "end")
        continue;
      visit(current[key], current, childDepth);
    }
  }
  visit(program, null, 0);
  if (edits.length === 0) return source;

  edits.sort((left, right) => {
    if (left.position !== right.position) return left.position - right.position;
    if (left.closing !== right.closing) return left.closing ? -1 : 1;
    // Inner closings first, outer openings first.
    return left.closing ? right.depth - left.depth : left.depth - right.depth;
  });
  let output = "";
  let cursor = 0;
  for (const edit of edits) {
    output += source.slice(cursor, edit.position) + edit.text;
    cursor = edit.position;
  }
  return output + source.slice(cursor);
}

/**
 * Where a syntax error is, for code that failed to load in the worker
 * (browsers do not say the line for code built with `new Function`).
 */
export async function findSyntaxError(
  files: { path: string; content: string }[],
): Promise<CodeProblem | null> {
  const { parseScript } = await import("meriyah");
  for (const file of files) {
    if (!/\.(js|mjs|cjs)$/.test(file.path)) continue;
    try {
      parseScript(file.content, { next: true, webcompat: true, loc: true });
    } catch (error) {
      return {
        message: `SyntaxError: ${cleanMessage(error)}`,
        file: file.path,
        ...locationOf(error),
      };
    }
  }
  return null;
}
