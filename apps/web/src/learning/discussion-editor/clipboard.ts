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
