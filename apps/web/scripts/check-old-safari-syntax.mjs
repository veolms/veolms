import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RegExpValidator } from "@eslint-community/regexpp";
import { parse } from "acorn";

/**
 * Fails the web build when a script the browser loads holds syntax that
 * Safari before iOS 16.4 cannot read. Such a browser rejects the whole file,
 * not the one line, and when that file is one every page needs, every page
 * shows "Something went wrong" (22 Nov 2026: all of dev.veolms.org and
 * procodrr.com on iPhones below iOS 16.4, from a lookbehind in a shared
 * chunk).
 *
 * Looked for, with a JavaScript parser (acorn) and a regular expression
 * parser (regexpp), not by searching the text:
 * - a regex lookbehind, `(?<=…)` or `(?<!…)`, in a regex literal or in
 *   `RegExp("…")` / `new RegExp("…")` with a written-out pattern;
 * - a class static block, `static { … }`.
 *
 * The build's JavaScript target is not lowered for old Safari (only its CSS
 * is, see `cssTarget` in vite.config.ts), and no build step can rewrite a
 * lookbehind, so whatever a package ships reaches the browser as it is.
 *
 * Read: every .js, .mjs and .cjs file under the client build, and the inline
 * scripts of its HTML pages.
 */

const SCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

/**
 * Files whose findings are known and accepted for now. Each is reported,
 * not failed on, and the reason is printed with it.
 */
const ALLOWED = [
  {
    name: "pdfjs-dist",
    reason:
      "only opening a PDF needs it; PDFs on iOS below 16.4 are left for now",
    // Its own chunk (`manualChunks` in vite.config.ts) and its worker.
    matches: (relativePath) =>
      /(?:^|\/)(?:pdfjs-dist|pdf\.worker\.min)-[^/]*\.m?js$/u.test(
        relativePath,
      ),
  },
];

const FINDING_WORDS = {
  lookbehind: "regex lookbehind (Safari 16.4+)",
  "static-block": "class static block (Safari 16.4+)",
};

async function listFiles(directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

/** The inline scripts of a page that a browser runs as JavaScript. */
function inlineScripts(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu;
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? "";
    const body = match[2] ?? "";
    if (/\bsrc\s*=/iu.test(attributes) || !body.trim()) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/iu.exec(attributes)?.[1];
    if (
      type &&
      !/^(?:module|text\/javascript|application\/javascript)$/iu.test(type)
    ) {
      continue;
    }
    scripts.push(body);
  }
  return scripts;
}

function parseScript(source) {
  // No `locations`: a line/column object on every node of every file is
  // what took the build past Node's heap limit (22 Nov 2026). Findings work
  // their line out from the offset instead.
  const options = {
    ecmaVersion: "latest",
    allowHashBang: true,
  };
  try {
    return parse(source, { ...options, sourceType: "module" });
  } catch (moduleError) {
    try {
      return parse(source, { ...options, sourceType: "script" });
    } catch {
      throw moduleError;
    }
  }
}

/** Whether a regex pattern holds a lookbehind (false if regexpp rejects it). */
function hasLookbehind(pattern, flags) {
  let found = false;
  const validator = new RegExpValidator({
    ecmaVersion: 2025,
    onLookaroundAssertionEnter(_start, kind) {
      if (kind === "lookbehind") found = true;
    },
  });
  try {
    validator.validatePattern(pattern, 0, pattern.length, {
      unicode: flags.includes("u"),
      unicodeSets: flags.includes("v"),
    });
  } catch {
    return false;
  }
  return found;
}

/** A string written out in the source: "…", '…' or `…` with no `${}`. */
function writtenString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

/** 1-based line and column of an offset in the source. */
function positionOf(source, offset) {
  let line = 1;
  let lineStart = 0;
  for (let index = source.indexOf("\n"); index !== -1 && index < offset;) {
    line += 1;
    lineStart = index + 1;
    index = source.indexOf("\n", lineStart);
  }
  return { line, column: offset - lineStart + 1 };
}

function findInScript(source) {
  const findings = [];
  const add = (kind, node) =>
    findings.push({
      kind,
      ...positionOf(source, node.start),
      excerpt: source
        .slice(node.start, Math.min(node.end, node.start + 80))
        .replace(/\s+/gu, " "),
    });
  // A stack, not recursion: minified files nest deeper than the call stack.
  const stack = [parseScript(source)];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node.type !== "string") continue;
    if (node.type === "StaticBlock") add("static-block", node);
    if (node.type === "Literal" && node.regex) {
      if (hasLookbehind(node.regex.pattern, node.regex.flags)) {
        add("lookbehind", node);
      }
    }
    if (
      (node.type === "NewExpression" || node.type === "CallExpression") &&
      node.callee.type === "Identifier" &&
      node.callee.name === "RegExp"
    ) {
      const pattern = writtenString(node.arguments[0]);
      const flags = writtenString(node.arguments[1]) ?? "";
      if (pattern !== null && hasLookbehind(pattern, flags)) {
        add("lookbehind", node);
      }
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (let index = value.length - 1; index >= 0; index -= 1) {
          if (value[index] && typeof value[index] === "object") {
            stack.push(value[index]);
          }
        }
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/**
 * Checks the client build. Resolves with a summary when nothing outside the
 * allowed list was found; rejects with the findings otherwise.
 */
export async function checkOldSafariSyntax(clientBuildDirectory) {
  const files = await listFiles(clientBuildDirectory);
  const seenInline = new Set();
  const failures = [];
  const allowed = new Map();
  const unreadable = [];
  let scriptCount = 0;
  let fileCount = 0;

  // One script at a time, nothing kept but its findings: the check runs
  // inside the build, which is already close to Node's heap limit.
  const check = (where, source) => {
    scriptCount += 1;
    let findings;
    try {
      findings = findInScript(source);
    } catch (error) {
      unreadable.push(`${where}: ${error.message}`);
      return;
    }
    if (findings.length === 0) return;
    const rule = ALLOWED.find((candidate) => candidate.matches(where));
    if (rule) {
      const entry = allowed.get(rule) ?? { files: new Set(), count: 0 };
      entry.files.add(where);
      entry.count += findings.length;
      allowed.set(rule, entry);
      return;
    }
    for (const finding of findings) failures.push({ where, ...finding });
  };

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    const relativePath = path
      .relative(clientBuildDirectory, file)
      .replaceAll("\\", "/");
    if (SCRIPT_EXTENSIONS.has(extension)) {
      fileCount += 1;
      check(relativePath, await readFile(file, "utf8"));
    } else if (extension === ".html") {
      const scripts = inlineScripts(await readFile(file, "utf8"));
      scripts.forEach((source, index) => {
        // Pages share most of their inline scripts: each is read once.
        const hash = createHash("sha1").update(source).digest("hex");
        if (seenInline.has(hash)) return;
        seenInline.add(hash);
        check(`${relativePath} (inline script ${index + 1})`, source);
      });
    }
  }

  const lines = [
    `Old Safari syntax check: read ${scriptCount} scripts (${fileCount} files, ${seenInline.size} distinct inline scripts).`,
  ];
  for (const [rule, entry] of allowed) {
    lines.push(
      `  Allowed for now: ${entry.count} in ${rule.name} (${[...entry.files].join(", ")}): ${rule.reason}.`,
    );
  }

  if (failures.length === 0 && unreadable.length === 0) {
    lines.push(
      "  No regex lookbehind or class static block outside the allowed list: iPhones below iOS 16.4 can load the site.",
    );
    return lines.join("\n");
  }

  for (const failure of failures) {
    lines.push(
      `  ${failure.where}:${failure.line}:${failure.column} ${FINDING_WORDS[failure.kind]}: ${failure.excerpt}`,
    );
  }
  for (const entry of unreadable) lines.push(`  Could not read ${entry}`);
  lines.push(
    "Safari before iOS 16.4 rejects a whole script file holding this syntax, and every page that loads it fails. Rewrite it in our code; for a package, patch it (pnpm patch) or pin a version without it (overrides in pnpm-workspace.yaml).",
  );
  throw new Error(lines.join("\n"));
}

const isDirectInvocation =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const directory = path.resolve(
    process.argv[2] ??
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../build/client",
      ),
  );
  try {
    console.log(await checkOldSafariSyntax(directory));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
