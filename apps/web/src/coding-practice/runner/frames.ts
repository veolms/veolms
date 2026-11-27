import brokerSource from "./sandbox/broker.js?raw";
import pageSource from "./sandbox/page.js?raw";
import sharedSource from "./sandbox/shared.js?raw";
import workerSource from "./sandbox/worker.js?raw";
import nodeSource from "./sandbox/node.js?raw";
import reactRuntimePath from "./react-runtime.ts?worker&url";

/** The worker's whole script: helpers first, then the test runner. */
export const WORKER_SOURCE = `${sharedSource}\n${workerSource}`;

/** The Node.js worker: helpers first, then Node's modules and the tests. */
export const NODE_WORKER_SOURCE = `${sharedSource}\n${nodeSource}`;

/** A per-frame secret: messages without it are ignored on both sides. */
export function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Text that is safe inside an inline <script> or <style>. */
function inlineSafe(text: string, tag: "script" | "style") {
  return text.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
}

function jsonForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * React for React exercises, as text. Fetched once from the site's own
 * files (and the browser cache after that) and written into the sandbox
 * inline: a sandboxed frame has an opaque origin, and some browsers and
 * hosts refuse it subresources (local-network rules, resource policies),
 * so it loads nothing by URL at all.
 */
let reactRuntimeText: Promise<string> | null = null;
function reactRuntimeSource() {
  reactRuntimeText ??= fetch(reactRuntimePath)
    .then((response) => {
      if (!response.ok) throw new Error(`React runtime: ${response.status}`);
      return response.text();
    })
    .catch((error: unknown) => {
      reactRuntimeText = null;
      throw error;
    });
  return reactRuntimeText;
}

/**
 * The sandbox's own rules. No network (`connect-src 'none'`), scripts only
 * inline (ours, React included), images only built-in or generated,
 * workers only from blob: URLs.
 */
function contentSecurityPolicy() {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "worker-src blob:",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
  ].join("; ");
}

function head(extra = "") {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy()}">${extra}`;
}

/** The runner frame: starts and watches workers, runs no learner code. */
export function brokerDocument(nonce: string) {
  return `<!doctype html><html><head>${head()}<script>window.__veoBroker=${jsonForScript({ nonce })}</script><script>${inlineSafe(brokerSource, "script")}</script></head><body></body></html>`;
}

export interface PageDocumentInput {
  nonce: string;
  runId: string;
  kind: "web" | "react";
  /** web: the HTML page; react: the module exporting the App. */
  entryFile: string;
  entryHtml?: string;
  css: string;
  /** web: guarded scripts, added to the page in order. */
  scripts: { path: string; code: string }[];
  /** react: compiled and guarded modules for the sandbox's require. */
  modules: Record<string, string>;
  mocks: unknown[];
  paths: string[];
}

const BASE_STYLE =
  "html{color-scheme:light;-webkit-text-size-adjust:100%}body{margin:8px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#1f2328;background:#fff}";

/**
 * Splits the learner's HTML into what goes in <head> and <body>. Local
 * <link rel=stylesheet> and <script src> are dropped: the exercise's CSS
 * and JS files are added to every page automatically. Inline scripts the
 * learner wrote get the loop guard like the files do.
 */
async function splitHtml(
  html: string,
  guard: (code: string) => Promise<string>,
) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll('link[rel~="stylesheet"], script[src]')
    .forEach((element) => element.remove());
  const inline = Array.from(doc.querySelectorAll("script"));
  for (const script of inline) {
    const type = (script.getAttribute("type") || "").toLowerCase();
    if (type && type !== "text/javascript" && type !== "module") continue;
    script.removeAttribute("type");
    script.textContent = await guard(script.textContent || "");
  }
  return { head: doc.head.innerHTML, body: doc.body.innerHTML };
}

/**
 * A page frame's document. Returns the HTML and, for web exercises, the
 * document line each learner script starts on, so an error's line maps
 * back to the learner's file.
 */
export async function pageDocument(
  input: PageDocumentInput,
  guard: (code: string) => Promise<string>,
) {
  const scriptLines: { file: string; startLine: number; lineCount: number }[] =
    [];
  const boot = {
    nonce: input.nonce,
    runId: input.runId,
    kind: input.kind,
    mocks: input.mocks,
    paths: input.paths,
    entry: input.entryFile,
    modules: input.modules,
    scriptLines,
  };
  const parts =
    input.kind === "web" && input.entryHtml !== undefined
      ? await splitHtml(input.entryHtml, guard)
      : { head: "", body: '<div id="root"></div>' };
  const reactScript =
    input.kind === "react"
      ? `<script>${inlineSafe(await reactRuntimeSource(), "script")}
</script>`
      : "";

  // The boot data names the line each learner script starts on, known only
  // once the document before it is laid out. The boot JSON is one line, so
  // a placeholder of it gives the same line numbers as the real one.
  const scriptBlocks: string[] = [];
  for (const script of input.scripts) {
    scriptBlocks.push(
      `<script>${inlineSafe(script.code, "script")}\n</script>`,
    );
  }
  const before = (bootJson: string) =>
    `<!doctype html><html><head>${head()}<script>window.__veoBoot=${bootJson}</script><script>${inlineSafe(sharedSource, "script")}\n${inlineSafe(pageSource, "script")}</script><style>${BASE_STYLE}</style><style id="__veo_css">${inlineSafe(input.css, "style")}</style>${parts.head}${reactScript}</head><body>${parts.body}`;
  const placeholder = jsonForScript({ ...boot, scriptLines: [] });
  let line = before(placeholder).split("\n").length;
  for (let index = 0; index < input.scripts.length; index++) {
    const block = scriptBlocks[index]!;
    scriptLines.push({
      file: input.scripts[index]!.path,
      startLine: line,
      lineCount: input.scripts[index]!.code.split("\n").length,
    });
    line += block.split("\n").length - 1;
  }
  return `${before(jsonForScript(boot))}${scriptBlocks.join("")}<script>window.__veoStart()</script></body></html>`;
}
