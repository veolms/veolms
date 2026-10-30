import { EditorView } from "@codemirror/view";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { getClipboardMediaFiles } from "./attachments";

const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
  strongDelimiter: "**",
});
turndown.use(gfm);
turndown.remove(["script", "style", "iframe", "object", "embed"]);

// The cells of a table are converted on their own, with no table rule of
// their own: a table inside a cell is flattened into its text.
const cellTurndown = new TurndownService({
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});
cellTurndown.remove(["script", "style", "iframe", "object", "embed"]);

/**
 * Every pasted table becomes a Markdown table. The GFM plugin's own rule
 * failed on tables copied from ChatGPT and other pages: one without a
 * header row was kept as HTML, which the comment then did not show; a line
 * break or a "|" inside a cell split its row; spacing between cells could
 * move the row's leading "|". Here the first row is the header, a cell's
 * line breaks become spaces, its "|" is escaped, and short rows are padded.
 */
turndown.addRule("pastedTable", {
  filter: "table",
  replacement(_content, node) {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.rows, (row) =>
      Array.from(row.cells, (cell) => tableCellMarkdown(cell.innerHTML)),
    ).filter((row) => row.length > 0);
    const columns = Math.max(0, ...rows.map((row) => row.length));
    if (columns === 0) return "";
    const pad = (row: string[]) => [
      ...row,
      ...Array<string>(columns - row.length).fill(""),
    ];
    const [header = [], ...body] = rows.map(pad);
    const lines = [header, header.map(() => "---"), ...body].map(
      (row) => `| ${row.join(" | ")} |`,
    );
    return `\n\n${lines.join("\n")}\n\n`;
  },
});

function tableCellMarkdown(html: string) {
  return cellTurndown
    .turndown(html)
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

interface ClipboardExtensionOptions {
  onFiles: (files: File[]) => void;
}

export function createDiscussionClipboardExtension({
  onFiles,
}: ClipboardExtensionOptions) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = getClipboardMediaFiles(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        onFiles(files);
        return true;
      }

      const html = event.clipboardData?.getData("text/html");
      if (!html) return false;
      const markdown = htmlToDiscussionMarkdown(html);
      if (!markdown) return false;
      event.preventDefault();
      replaceSelection(view, markdown);
      return true;
    },
    drop(event) {
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        (file) =>
          file.type.startsWith("image/") || file.type.startsWith("video/"),
      );
      if (files.length === 0) return false;
      event.preventDefault();
      onFiles(files);
      return true;
    },
  });
}

export function htmlToDiscussionMarkdown(html: string) {
  return turndown.turndown(html).trim();
}

function replaceSelection(view: EditorView, markdown: string) {
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: markdown },
    selection: { anchor: selection.from + markdown.length },
  });
}
