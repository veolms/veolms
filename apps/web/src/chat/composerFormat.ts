/**
 * WhatsApp's message formatting, applied in the message box: *bold*,
 * _italic_, ~strikethrough~, ```monospace```, `inline code`, "- " lists,
 * "1. " numbered lists and "> " quotes. Plain text in, plain text out (the
 * markers are what is sent, as in WhatsApp).
 */

export interface Edited {
  text: string;
  start: number;
  end: number;
}

export type InlineMark = "*" | "_" | "~" | "`" | "```";
export type LineMark = "bullet" | "number" | "quote";

/** Wraps the selection in a marker, or unwraps it when it already is. */
export function toggleInline(
  text: string,
  start: number,
  end: number,
  mark: InlineMark,
): Edited {
  const before = text.slice(0, start);
  const chosen = text.slice(start, end);
  const after = text.slice(end);
  const n = mark.length;
  // Already wrapped (markers just outside the selection): unwrap.
  if (before.endsWith(mark) && after.startsWith(mark)) {
    return {
      text: before.slice(0, -n) + chosen + after.slice(n),
      start: start - n,
      end: end - n,
    };
  }
  // Markers inside the selection: unwrap.
  if (
    chosen.length >= 2 * n &&
    chosen.startsWith(mark) &&
    chosen.endsWith(mark)
  ) {
    const inner = chosen.slice(n, -n);
    return { text: before + inner + after, start, end: start + inner.length };
  }
  // Markers don't apply across spaces at the edges: keep them outside.
  const lead = /^\s*/.exec(chosen)![0];
  const trail = /\s*$/.exec(chosen)![0];
  const core = chosen.slice(lead.length, chosen.length - trail.length);
  if (mark === "```" && core.includes("\n")) {
    const block = `\`\`\`\n${core}\n\`\`\``;
    return {
      text: before + lead + block + trail + after,
      start: start + lead.length + 4,
      end: start + lead.length + 4 + core.length,
    };
  }
  const wrapped = `${mark}${core}${mark}`;
  return {
    text: before + lead + wrapped + trail + after,
    start: start + lead.length + n,
    end: start + lead.length + n + core.length,
  };
}

const LINE_PREFIX: Record<LineMark, RegExp> = {
  bullet: /^[-*] /,
  number: /^\d{1,3}\. /,
  quote: /^> /,
};

/** Turns the selected lines into a list or quote, or back to plain lines. */
export function toggleLines(
  text: string,
  start: number,
  end: number,
  mark: LineMark,
): Edited {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", Math.max(end - 1, start));
  const to = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(from, to).split("\n");
  const all = lines.every((line) => LINE_PREFIX[mark].test(line));
  const changed = lines.map((line, i) => {
    const bare = line.replace(/^([-*] |\d{1,3}\. |> )/, "");
    if (all) return bare;
    if (mark === "bullet") return `- ${bare}`;
    if (mark === "number") return `${i + 1}. ${bare}`;
    return `> ${bare}`;
  });
  const block = changed.join("\n");
  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: from,
    end: from + block.length,
  };
}

/**
 * A new line inside a list or quote carries it on ("- ", the next number,
 * "> "); on an empty item it ends the list instead, as in WhatsApp and
 * other editors. Null: an ordinary new line.
 */
export function continueList(
  text: string,
  caret: number,
): { text: string; caret: number } | null {
  const from = text.lastIndexOf("\n", caret - 1) + 1;
  const line = text.slice(from, caret);
  const match = /^([-*] |(\d{1,3})\. |> )(.*)$/.exec(line);
  if (!match) return null;
  const [, prefix, number, rest] = match;
  if (!rest!.trim()) {
    // Empty item: the prefix goes, the list ends.
    return {
      text: text.slice(0, from) + text.slice(caret),
      caret: from,
    };
  }
  const next = number ? `${Number(number) + 1}. ` : prefix!;
  const inserted = `\n${next}`;
  return {
    text: text.slice(0, caret) + inserted + text.slice(caret),
    caret: caret + inserted.length,
  };
}

/** WhatsApp's keyboard shortcuts for formatting (Ctrl, or ⌘ on a Mac). */
export function shortcutFor(event: {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): InlineMark | LineMark | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (!event.shiftKey) {
    if (event.code === "KeyB") return "*";
    if (event.code === "KeyI") return "_";
    return null;
  }
  if (event.code === "KeyX") return "~";
  if (event.code === "KeyM") return "```";
  if (event.code === "Digit8") return "bullet";
  if (event.code === "Digit7") return "number";
  if (event.code === "Digit9") return "quote";
  return null;
}
