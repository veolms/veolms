import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import postcss from "postcss";

/**
 * Inlines the CSS each prerendered page needs for its first paint and loads
 * the two large app stylesheets (`styles-*.css`, `shell-theme-*.css`) without
 * blocking the paint.
 *
 * For every deferred stylesheet the page gets, in the stylesheet's own place:
 *
 *   <style data-critical-css="/assets/styles-x.css">...</style>
 *   <link rel="stylesheet" href="/assets/styles-x.css" media="print"
 *     data-deferred-style onload="this.media='all'">
 *   <noscript><link rel="stylesheet" href="/assets/styles-x.css"></noscript>
 *
 * The inline subset sits exactly where the full stylesheet sits, so the
 * cascade order against the small stylesheets around it (palettes, route
 * styles) is the same as with the full stylesheet. The full stylesheet still
 * follows it, so once it has loaded every rule is back in its original place.
 * entry.client.tsx waits for the deferred stylesheets before it hydrates and
 * then drops each inline copy whose stylesheet has loaded.
 *
 * A rule is kept when any of its selectors could match an element of the
 * page, judged by the rightmost compound selector only: every tag, class, id
 * and attribute name in it must occur in the page's markup or be set by the
 * page's inline scripts before the first paint. Pseudo-classes, pseudo-
 * elements and everything inside them are ignored, and anything that cannot
 * be judged is kept.
 */

const DEFERRED_STYLESHEET_PATTERN = /^(?:styles|shell-theme)-[\w-]+\.css$/u;
const CRITICAL_MARKER = "data-critical-css";
const DEFERRED_MARKER = "data-deferred-style";
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea", "title"]);

class PageError extends Error {}

// ---------------------------------------------------------------------------
// HTML scanning

const decodeEntities = (value) =>
  value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    }
    if (lower.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    }
    return (
      { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" }[
        lower
      ] ?? match
    );
  });

const readAttributes = (html, start) => {
  const attributes = [];
  let index = start;
  while (index < html.length) {
    while (/\s/u.test(html[index] ?? "")) index += 1;
    if (html[index] === ">") return { attributes, end: index + 1 };
    if (html.startsWith("/>", index)) return { attributes, end: index + 2 };
    if (html[index] === "/") {
      index += 1;
      continue;
    }
    const nameMatch = /^[^\s"'>/=]+/u.exec(html.slice(index, index + 256));
    if (!nameMatch) return null;
    const name = nameMatch[0].toLowerCase();
    index += nameMatch[0].length;
    while (/\s/u.test(html[index] ?? "")) index += 1;
    let value = "";
    if (html[index] === "=") {
      index += 1;
      while (/\s/u.test(html[index] ?? "")) index += 1;
      const quote = html[index];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, index + 1);
        if (close < 0) return null;
        value = html.slice(index + 1, close);
        index = close + 1;
      } else {
        const unquoted = /^[^\s>]*/u.exec(html.slice(index))[0];
        value = unquoted;
        index += unquoted.length;
      }
    }
    attributes.push({ name, value: decodeEntities(value) });
  }
  return null;
};

/** Every start tag of the document, with raw-text element contents skipped. */
const scanElements = (html) => {
  const elements = [];
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open < 0) break;
    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4);
      if (close < 0) throw new PageError("an HTML comment is not closed");
      index = close + 3;
      continue;
    }
    if (html[open + 1] === "!" || html[open + 1] === "?") {
      const close = html.indexOf(">", open);
      index = close < 0 ? html.length : close + 1;
      continue;
    }
    if (html[open + 1] === "/") {
      const close = html.indexOf(">", open);
      if (close < 0) throw new PageError("an end tag is not closed");
      elements.push({
        end: true,
        tag: html
          .slice(open + 2, close)
          .trim()
          .toLowerCase(),
        start: open,
        stop: close + 1,
      });
      index = close + 1;
      continue;
    }
    const tagMatch = /^[a-zA-Z][^\s/>]*/u.exec(
      html.slice(open + 1, open + 129),
    );
    if (!tagMatch) {
      index = open + 1;
      continue;
    }
    const tag = tagMatch[0].toLowerCase();
    const parsed = readAttributes(html, open + 1 + tagMatch[0].length);
    if (!parsed) throw new PageError(`the <${tag}> tag at ${open} is broken`);
    const element = {
      end: false,
      tag,
      attributes: parsed.attributes,
      start: open,
      stop: parsed.end,
    };
    elements.push(element);
    index = parsed.end;
    if (RAW_TEXT_ELEMENTS.has(tag)) {
      const closePattern = new RegExp(`</${tag}[\\s>/]`, "giu");
      closePattern.lastIndex = index;
      const close = closePattern.exec(html);
      if (!close) throw new PageError(`a <${tag}> element is not closed`);
      element.text = html.slice(index, close.index);
      index = close.index;
    }
  }
  return elements;
};

const kebabFromDataset = (name) =>
  `data-${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;

/**
 * Names the inline scripts can put on the document before the first paint:
 * `dataset.*` and `setAttribute()` attributes, and every word of every string
 * literal as a possible class name (`classList.add("...")`).
 */
const addScriptTokens = (script, tokens) => {
  for (const match of script.matchAll(/\bdataset\.([A-Za-z_$][\w$]*)/gu)) {
    tokens.attributes.add(kebabFromDataset(match[1]));
  }
  for (const match of script.matchAll(
    /\b(?:setAttribute|toggleAttribute)\(\s*(["'`])([^"'`]+)\1/gu,
  )) {
    tokens.attributes.add(match[2].toLowerCase());
  }
  if (/\.style\b/u.test(script)) tokens.attributes.add("style");
  if (/\bclass(?:Name|List)\b/u.test(script)) tokens.attributes.add("class");
  for (const match of script.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/gu)) {
    for (const word of match[2].split(/\s+/u)) {
      if (word) tokens.classes.add(word);
    }
  }
};

const collectPageTokens = (elements) => {
  const tokens = {
    tags: new Set(),
    ids: new Set(),
    classes: new Set(),
    attributes: new Set(),
  };
  for (const element of elements) {
    if (element.end) continue;
    tokens.tags.add(element.tag);
    for (const { name, value } of element.attributes) {
      tokens.attributes.add(name);
      if (name === "id" && value) tokens.ids.add(value);
      if (name === "class") {
        for (const className of value.split(/\s+/u)) {
          if (className) tokens.classes.add(className);
        }
      }
    }
    const isInlineClassicScript =
      element.tag === "script" &&
      !element.attributes.some(({ name }) => name === "src") &&
      !element.attributes.some(
        ({ name, value }) =>
          name === "type" &&
          value !== "" &&
          !/^(?:text|application)\/javascript$/iu.test(value),
      );
    // The router context scripts carry loader data, not DOM changes.
    if (
      isInlineClassicScript &&
      element.text &&
      !element.text.trimStart().startsWith("window.__reactRouterContext")
    ) {
      addScriptTokens(element.text, tokens);
    }
  }
  return tokens;
};

// ---------------------------------------------------------------------------
// Selector judging

/**
 * The index after the escape that starts at `start` (a backslash). A hex
 * escape takes one whitespace character after it: `.\32 xl\:grid-cols-4` is
 * the single class `2xl:grid-cols-4`, not a descendant combinator.
 */
const escapeEnd = (selector, start) => {
  const hex = /^[\da-fA-F]{1,6}/u.exec(selector.slice(start + 1, start + 7));
  if (!hex) return start + 2;
  const end = start + 1 + hex[0].length;
  return /\s/u.test(selector[end] ?? "") ? end + 1 : end;
};

const readIdentifier = (selector, start) => {
  let value = "";
  let index = start;
  while (index < selector.length) {
    const character = selector[index];
    if (character === "\\") {
      const hex = /^[\da-fA-F]{1,6}/u.exec(selector.slice(index + 1));
      if (hex) {
        value += String.fromCodePoint(Number.parseInt(hex[0], 16));
        index += 1 + hex[0].length;
        if (/\s/u.test(selector[index] ?? "")) index += 1;
      } else {
        value += selector[index + 1] ?? "";
        index += 2;
      }
      continue;
    }
    if (/[\w\-\u0080-\uffff]/u.test(character)) {
      value += character;
      index += 1;
      continue;
    }
    break;
  }
  return { value, end: index };
};

/** Skips a bracketed or quoted run, returning the index after it. */
const skipGroup = (selector, start) => {
  const closing = { "(": ")", "[": "]" };
  const stack = [];
  let index = start;
  while (index < selector.length) {
    const character = selector[index];
    if (character === "\\") {
      index = escapeEnd(selector, index);
      continue;
    }
    if (character === '"' || character === "'") {
      const close = selector.indexOf(character, index + 1);
      index = close < 0 ? selector.length : close + 1;
      if (stack.length === 0) return index;
      continue;
    }
    if (character in closing) stack.push(closing[character]);
    else if (character === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return index + 1;
    }
    index += 1;
  }
  return index;
};

const rightmostCompound = (selector) => {
  let compoundStart = 0;
  let index = 0;
  while (index < selector.length) {
    const character = selector[index];
    if (character === "\\") {
      index = escapeEnd(selector, index);
      continue;
    }
    if ("([\"'".includes(character)) {
      index = skipGroup(selector, index);
      continue;
    }
    if (/[\s>+~]/u.test(character)) compoundStart = index + 1;
    index += 1;
  }
  return selector.slice(compoundStart).trim();
};

/**
 * Parses a compound selector into what an element must carry. Returns null
 * when the compound cannot be judged, which keeps the rule.
 */
const compoundRequirements = (compound) => {
  const requirements = {
    tag: null,
    ids: [],
    classes: [],
    attributes: [],
  };
  let index = 0;
  while (index < compound.length) {
    const character = compound[index];
    if (character === "&" || character === "|") return null;
    if (character === "*") {
      index += 1;
      continue;
    }
    if (character === ".") {
      const { value, end } = readIdentifier(compound, index + 1);
      if (!value) return null;
      requirements.classes.push(value);
      index = end;
      continue;
    }
    if (character === "#") {
      const { value, end } = readIdentifier(compound, index + 1);
      if (!value) return null;
      requirements.ids.push(value);
      index = end;
      continue;
    }
    if (character === "[") {
      const end = skipGroup(compound, index);
      const inner = compound.slice(index + 1, end - 1).trim();
      const { value } = readIdentifier(inner, 0);
      if (!value || inner.includes("|")) return null;
      requirements.attributes.push(value.toLowerCase());
      index = end;
      continue;
    }
    if (character === ":") {
      index += compound[index + 1] === ":" ? 2 : 1;
      const { end } = readIdentifier(compound, index);
      index = end;
      if (compound[index] === "(") index = skipGroup(compound, index);
      continue;
    }
    if (index === 0) {
      const { value, end } = readIdentifier(compound, 0);
      if (!value) return null;
      requirements.tag = value.toLowerCase();
      index = end;
      continue;
    }
    return null;
  }
  return requirements;
};

const selectorCouldMatch = (selector, tokens, cache) => {
  const cached = cache.get(selector);
  if (cached !== undefined) return cached;
  const compound = rightmostCompound(selector);
  const requirements = compound ? compoundRequirements(compound) : null;
  const matches =
    !requirements ||
    ((!requirements.tag || tokens.tags.has(requirements.tag)) &&
      requirements.ids.every((id) => tokens.ids.has(id)) &&
      requirements.classes.every((name) => tokens.classes.has(name)) &&
      requirements.attributes.every((name) => tokens.attributes.has(name)));
  cache.set(selector, matches);
  return matches;
};

// ---------------------------------------------------------------------------
// CSS extraction

const KEEP_WHOLE_AT_RULES = new Set([
  "font-face",
  "property",
  "counter-style",
  "font-feature-values",
  "font-palette-values",
  "page",
  "view-transition",
  "namespace",
  "charset",
  "import",
]);

/**
 * The rules a page needs, in their original order and wrappers. The whole
 * rule is kept with all its selectors: dropping one selector of a list could
 * make a list valid that a browser now rejects as a whole.
 */
const extractCriticalCss = (stylesheetRoot, tokens) => {
  const cache = new Map();

  const select = (container) => {
    const kept = [];
    container.each((node) => {
      if (node.type === "comment") return;
      if (node.type === "decl") {
        kept.push(node.clone());
        return;
      }
      if (node.type === "rule") {
        if (
          node.selectors.some((selector) =>
            selectorCouldMatch(selector, tokens, cache),
          )
        ) {
          kept.push(node.clone());
        }
        return;
      }
      if (node.type !== "atrule") return;
      const name = node.name.toLowerCase();
      if (!node.nodes || KEEP_WHOLE_AT_RULES.has(name)) {
        kept.push(node.clone());
        return;
      }
      if (/(?:^|-)keyframes$/u.test(name)) {
        kept.push(node.clone());
        return;
      }
      const hasRules = node.nodes.some(
        (child) => child.type === "rule" || child.type === "atrule",
      );
      if (!hasRules) {
        // Declarations only (e.g. a page margin box): keep as it is.
        kept.push(node.clone());
        return;
      }
      const children = select(node);
      if (children.length > 0) {
        kept.push(node.clone({ nodes: children }));
      } else if (name === "layer" && node.params.trim()) {
        // An emptied layer block still fixes where that layer sits in the
        // layer order; keep that as a statement.
        kept.push(
          postcss.atRule({
            name: "layer",
            params: node.params,
            raws: { before: node.raws.before, afterName: " " },
          }),
        );
      }
    });
    return kept;
  };

  const root = postcss.root({ nodes: select(stylesheetRoot) });

  // Keep only the keyframes something kept can name.
  const words = new Set();
  root.walkDecls((declaration) => {
    for (const word of declaration.value.match(/[\w-]+/gu) ?? []) {
      words.add(word);
    }
  });
  root.walkAtRules(/(?:^|-)keyframes$/iu, (atRule) => {
    const name = atRule.params.trim().replace(/^["']|["']$/gu, "");
    if (!words.has(name)) atRule.remove();
  });
  // Remove wrappers emptied by that.
  let removed = true;
  while (removed) {
    removed = false;
    root.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        const name = atRule.name.toLowerCase();
        if (name === "layer" && atRule.params.trim()) return;
        atRule.remove();
        removed = true;
      }
    });
  }

  return root.toString().trim();
};

// ---------------------------------------------------------------------------
// Pages

const collectPages = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) pages.push(...(await collectPages(entryPath)));
    else if (entry.name === "index.html") pages.push(entryPath);
  }
  return pages.sort();
};

const attribute = (element, name) =>
  element.attributes.find((item) => item.name === name)?.value;

const escapeAttribute = (value) =>
  value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;");

const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const findHead = (elements) => {
  const opens = elements.filter((item) => !item.end && item.tag === "head");
  const closes = elements.filter((item) => item.end && item.tag === "head");
  if (opens.length !== 1 || closes.length !== 1) {
    throw new PageError(
      `expected one <head> and one </head>, found ${opens.length} and ${closes.length}`,
    );
  }
  if (closes[0].start < opens[0].stop) {
    throw new PageError("</head> comes before <head>");
  }
  return { start: opens[0].stop, end: closes[0].start };
};

const stylesheetPath = (clientDirectory, href) => {
  const pathname = href.split(/[?#]/u)[0];
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    throw new PageError(`stylesheet ${href} is not a root-relative path`);
  }
  const resolved = path.resolve(clientDirectory, `.${pathname}`);
  if (!resolved.startsWith(path.resolve(clientDirectory) + path.sep)) {
    throw new PageError(`stylesheet ${href} is outside the build`);
  }
  return resolved;
};

const processPage = async ({
  clientDirectory,
  pagePath,
  stylesheets,
  sharedTokens,
  sharedCriticalCss,
}) => {
  const html = await readFile(pagePath, "utf8");
  const elements = scanElements(html);
  const head = findHead(elements);
  const headElements = elements.filter(
    (item) => item.start >= head.start && item.stop <= head.end,
  );

  if (
    headElements.some(
      (item) =>
        !item.end &&
        item.attributes.some(
          ({ name }) => name === CRITICAL_MARKER || name === DEFERRED_MARKER,
        ),
    )
  ) {
    return { alreadyDone: true };
  }

  const stylesheetLinks = headElements.filter(
    (item) =>
      !item.end &&
      item.tag === "link" &&
      (attribute(item, "rel") ?? "")
        .toLowerCase()
        .split(/\s+/u)
        .includes("stylesheet"),
  );
  for (const link of stylesheetLinks) {
    if (!attribute(link, "href")) {
      throw new PageError("a stylesheet link in <head> has no href");
    }
  }
  const deferred = stylesheetLinks.filter((link) => {
    const href = attribute(link, "href");
    const media = (attribute(link, "media") ?? "all").trim().toLowerCase();
    return (
      DEFERRED_STYLESHEET_PATTERN.test(
        path.posix.basename(href.split(/[?#]/u)[0]),
      ) &&
      (media === "all" || media === "") &&
      !link.attributes.some(({ name }) => name === "disabled")
    );
  });
  if (
    !deferred.some((link) =>
      path.posix.basename(attribute(link, "href")).startsWith("styles-"),
    )
  ) {
    throw new PageError("no styles-*.css stylesheet link in <head>");
  }

  const tokens = sharedTokens ?? collectPageTokens(elements);
  let output = html;
  let inlinedBytes = 0;
  let inlinedGzipBytes = 0;
  let deferredBytes = 0;
  let deferredGzipBytes = 0;

  // Replace from the end so earlier offsets stay valid.
  for (const link of [...deferred].reverse()) {
    const href = attribute(link, "href");
    const filePath = stylesheetPath(clientDirectory, href);
    let stylesheet = stylesheets.get(filePath);
    if (!stylesheet) {
      let source;
      try {
        source = await readFile(filePath, "utf8");
      } catch {
        throw new PageError(`stylesheet ${href} does not exist in the build`);
      }
      stylesheet = {
        root: postcss.parse(source, { from: filePath }),
        bytes: Buffer.byteLength(source),
        gzipBytes: gzipSync(source).length,
      };
      stylesheets.set(filePath, stylesheet);
    }
    // Pages that share their tokens share what is taken from each sheet.
    let critical = sharedTokens ? sharedCriticalCss.get(filePath) : undefined;
    if (!critical) {
      const css = extractCriticalCss(stylesheet.root, tokens);
      critical = { css, gzipBytes: gzipSync(css).length };
      if (sharedTokens) sharedCriticalCss.set(filePath, critical);
    }
    const criticalCss = critical.css;
    if (/<\/style/iu.test(criticalCss)) {
      throw new PageError(`the CSS from ${href} contains "</style"`);
    }
    inlinedBytes += Buffer.byteLength(criticalCss);
    inlinedGzipBytes += critical.gzipBytes;
    deferredBytes += stylesheet.bytes;
    deferredGzipBytes += stylesheet.gzipBytes;

    const otherAttributes = link.attributes
      .filter(
        ({ name }) =>
          !["rel", "href", "media", "onload", DEFERRED_MARKER].includes(name),
      )
      .map(({ name, value }) =>
        value === "" ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`,
      )
      .join("");
    const safeHref = escapeAttribute(href);
    const replacement =
      `<style ${CRITICAL_MARKER}="${safeHref}">${criticalCss}</style>` +
      `<link rel="stylesheet" href="${safeHref}"${otherAttributes} media="print" ${DEFERRED_MARKER}="" onload="this.media='all'"/>` +
      `<noscript><link rel="stylesheet" href="${safeHref}"${otherAttributes}/></noscript>`;
    output =
      output.slice(0, link.start) + replacement + output.slice(link.stop);
  }

  // The result must still parse with the same head.
  findHead(scanElements(output));
  await writeFile(pagePath, output);

  return {
    alreadyDone: false,
    inlinedBytes,
    inlinedGzipBytes,
    deferredBytes,
    deferredGzipBytes,
    deferredCount: deferred.length,
  };
};

/** A course's lesson pages: `learn/<course>/<lesson>/index.html`. */
const isLessonPage = (page) => /^learn\/[^/]+\/[^/]+\/index\.html$/u.test(page);

/**
 * Every lesson page is the same screen with another lesson in it, and a
 * course has hundreds: one page's CSS took about 0.1 s to pick out of the
 * app's stylesheet, most of a build of all of them. They are given the CSS
 * of everything any of them uses instead, picked out once: a little more
 * than one page needs, and the same for each.
 */
const collectSharedTokens = async (root, pages) => {
  const shared = {
    tags: new Set(),
    ids: new Set(),
    classes: new Set(),
    attributes: new Set(),
  };
  for (const pagePath of pages) {
    const tokens = collectPageTokens(
      scanElements(await readFile(pagePath, "utf8")),
    );
    for (const kind of Object.keys(shared)) {
      for (const token of tokens[kind]) shared[kind].add(token);
    }
  }
  return shared;
};

/**
 * `quiet`: no line for a page processed before (a refresh of some pages in
 * a finished build, see refresh-course-static-pages.mjs).
 */
export async function inlineCriticalCss(
  clientDirectory,
  { quiet = false } = {},
) {
  const root = path.resolve(clientDirectory);
  const pages = await collectPages(root);
  if (pages.length === 0) {
    throw new Error(`Critical CSS: no prerendered index.html under ${root}`);
  }
  const relative = (pagePath) =>
    path.relative(root, pagePath).split(path.sep).join("/");
  const lessonPages = pages.filter((pagePath) =>
    isLessonPage(relative(pagePath)),
  );
  const lessonTokens =
    lessonPages.length > 1
      ? await collectSharedTokens(root, lessonPages)
      : undefined;
  const lessonCriticalCss = new Map();
  const stylesheets = new Map();
  for (const pagePath of pages) {
    const page = relative(pagePath);
    const shared = lessonTokens && isLessonPage(page);
    let result;
    try {
      result = await processPage({
        clientDirectory: root,
        pagePath,
        stylesheets,
        sharedTokens: shared ? lessonTokens : undefined,
        sharedCriticalCss: lessonCriticalCss,
      });
    } catch (error) {
      if (error instanceof PageError) {
        throw new Error(
          `Critical CSS: cannot process ${page}: ${error.message}`,
          {
            cause: error,
          },
        );
      }
      throw error;
    }
    if (result.alreadyDone) {
      if (quiet) continue;
      console.log(`Critical CSS: ${page} already processed, left as it is`);
      continue;
    }
    console.log(
      `Critical CSS: ${page} inlined ${kilobytes(result.inlinedBytes)} (${kilobytes(result.inlinedGzipBytes)} gzip), deferred ${result.deferredCount} stylesheets ${kilobytes(result.deferredBytes)} (${kilobytes(result.deferredGzipBytes)} gzip)`,
    );
  }
}

const isDirectInvocation =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const target =
    process.argv[2] ?? path.resolve(scriptDirectory, "../build/client");
  try {
    await inlineCriticalCss(target);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
