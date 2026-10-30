/**
 * Diagrams drawn in plain text (a flow of boxes and arrows, a tree) are
 * made of line-drawing characters and lined up with spaces. Markdown runs
 * spaces together, so the lines fell apart: an arrow under one word stood
 * under another. A run of such lines is shown as written instead, as a
 * plain code block.
 *
 * A diagram is a run of lines with at least one line-drawing character
 * (│ ┌ ┴ ├ ▼ and the like) in it; the lines around such a line belong to
 * it when they hold an arrow (→) or are indented by two spaces or more
 * (the boxes' labels). An arrow alone is a sentence ("Tokens → AST"), not
 * a diagram. A tree's first line (its root, unindented) goes with
 * the branches under it. Fenced code blocks are left as they are.
 */
// Box drawing (U+2500–257F) and the triangles used as arrowheads.
const DRAWING = /[─-╿▲-▼◀-◄]/;
// Arrows (U+2190–21FF).
const ARROW = /[←-⇿]/;

function isDrawingLine(line: string) {
  return DRAWING.test(line);
}

/** A line that may sit in a diagram, next to its drawing. */
function isDiagramLine(line: string) {
  return isDrawingLine(line) || ARROW.test(line) || isIndentedLine(line);
}

function isIndentedLine(line: string) {
  return /^ {2,}\S/.test(line);
}

/** A tree's branch, which hangs from the line above it. */
function isTreeBranch(line: string) {
  return /^\s*[├└│]/.test(line);
}

export function textDiagramsToCodeBlocks(markdown: string): string {
  if (!DRAWING.test(markdown)) return markdown;

  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let fence: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "";
      if (fence === null) fence = marker;
      else if (marker.startsWith(fence)) fence = null;
      output.push(line);
      index++;
      continue;
    }
    if (fence !== null || !isDiagramLine(line)) {
      output.push(line);
      index++;
      continue;
    }

    // The run of diagram-like lines starting here.
    let end = index;
    while (end + 1 < lines.length && isDiagramLine(lines[end + 1] ?? "")) {
      end++;
    }
    const run = lines.slice(index, end + 1);
    // A tree's root is the plain line just above its first branch.
    const previous = output.at(-1);
    const root =
      isTreeBranch(line) &&
      previous !== undefined &&
      previous.trim() !== "" &&
      !isDiagramLine(previous)
        ? previous
        : null;
    // A drawing character in a single line of writing is no diagram.
    if (!run.some(isDrawingLine) || run.length + (root === null ? 0 : 1) < 2) {
      output.push(...run);
      index = end + 1;
      continue;
    }
    if (root !== null) {
      output.pop();
      run.unshift(root);
    }
    output.push("```text", ...run, "```");
    index = end + 1;
  }

  return output.join("\n");
}
