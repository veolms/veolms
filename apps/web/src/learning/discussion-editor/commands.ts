import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import type { SelectionRange } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export interface DiscussionFormattingState {
  bold: boolean;
  italic: boolean;
  highlight: boolean;
  link: boolean;
  code: boolean;
  codeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
  linkUrl: string;
}

export interface DiscussionEditorCommands {
  focus(): void;
  undo(): boolean;
  redo(): boolean;
  toggleBold(): void;
  toggleItalic(): void;
  toggleStrikethrough(): void;
  toggleHighlight(): void;
  toggleInlineCode(): void;
  toggleCodeBlock(): void;
  toggleBulletList(): void;
  toggleOrderedList(): void;
  toggleTaskList(): void;
  toggleBlockquote(): void;
  applyLink(href: string): void;
  removeLink(): void;
  insertMarkdown(markdown: string): void;
  getFormattingState(): DiscussionFormattingState;
}

interface LocatedLink {
  from: number;
  to: number;
  label: string;
  href: string;
}

export function createDiscussionEditorCommands(
  getView: () => EditorView | null,
): DiscussionEditorCommands {
  const withView = (callback: (view: EditorView) => void) => {
    const view = getView();
    if (!view) return;
    callback(view);
    view.focus();
  };

  return {
    focus: () => getView()?.focus(),
    undo: () => {
      const view = getView();
      return view ? undo(view) : false;
    },
    redo: () => {
      const view = getView();
      return view ? redo(view) : false;
    },
    toggleBold: () => withView((view) => toggleInlineMarkup(view, "**")),
    toggleItalic: () => withView((view) => toggleInlineMarkup(view, "*")),
    toggleStrikethrough: () =>
      withView((view) => toggleInlineMarkup(view, "~~")),
    toggleHighlight: () => withView((view) => toggleInlineMarkup(view, "==")),
    toggleInlineCode: () => withView((view) => toggleInlineMarkup(view, "`")),
    toggleCodeBlock: () => withView(toggleFencedCodeBlock),
    toggleBulletList: () =>
      withView((view) => toggleLinePrefix(view, "- ", BULLET_PREFIX)),
    toggleOrderedList: () => withView((view) => toggleOrderedList(view)),
    toggleTaskList: () =>
      withView((view) => toggleLinePrefix(view, "- [ ] ", TASK_PREFIX)),
    toggleBlockquote: () =>
      withView((view) => toggleLinePrefix(view, "> ", BLOCKQUOTE_PREFIX)),
    applyLink: (href) => withView((view) => applyLink(view, href)),
    removeLink: () => withView(removeLink),
    insertMarkdown: (markdown) =>
      withView((view) => {
        const selection = view.state.selection.main;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: markdown },
          selection: { anchor: selection.from + markdown.length },
        });
      }),
    getFormattingState: () => getFormattingState(getView()),
  };
}

function toggleInlineMarkup(view: EditorView, marker: string) {
  const { from, to } = view.state.selection.main;
  const document = view.state.doc.toString();
  const selected = document.slice(from, to);
  const markerLength = marker.length;
  const wrappedSelection =
    from >= markerLength &&
    isCompleteInlineMarkerAt(document, from - markerLength, marker) &&
    isCompleteInlineMarkerAt(document, to, marker);
  const selectionIncludesMarkers =
    isCompleteInlineMarkerAt(document, from, marker) &&
    isCompleteInlineMarkerAt(document, to - markerLength, marker) &&
    selected.length >= markerLength * 2;

  if (wrappedSelection) {
    view.dispatch({
      changes: [
        { from: to, to: to + markerLength },
        { from: from - markerLength, to: from },
      ],
      selection: { anchor: from - markerLength, head: to - markerLength },
    });
    return;
  }

  if (selectionIncludesMarkers) {
    view.dispatch({
      changes: [
        { from: to - markerLength, to },
        { from, to: from + markerLength },
      ],
      selection: {
        anchor: from,
        head: Math.max(from, to - markerLength * 2),
      },
    });
    return;
  }

  view.dispatch({
    changes: [
      { from: to, insert: marker },
      { from, insert: marker },
    ],
    selection: { anchor: from + markerLength, head: to + markerLength },
  });
}

function toggleFencedCodeBlock(view: EditorView) {
  const selection = view.state.selection.main;
  const startLine = view.state.doc.lineAt(selection.from);
  const endLine = view.state.doc.lineAt(selection.to);
  const blockFrom = startLine.from;
  const blockTo = endLine.to;
  const block = view.state.doc.sliceString(blockFrom, blockTo);
  const fenced = block.match(/^```[^\n]*\n([\s\S]*?)\n```$/);

  if (fenced) {
    view.dispatch({
      changes: { from: blockFrom, to: blockTo, insert: fenced[1] ?? "" },
      selection: {
        anchor: blockFrom,
        head: blockFrom + (fenced[1]?.length ?? 0),
      },
    });
    return;
  }

  const replacement = `\`\`\`\n${block}\n\`\`\``;
  view.dispatch({
    changes: { from: blockFrom, to: blockTo, insert: replacement },
    selection: { anchor: blockFrom + 4, head: blockFrom + 4 + block.length },
  });
}

function applyLink(view: EditorView, href: string) {
  const normalizedHref = normalizeLink(href);
  if (!normalizedHref) {
    removeLink(view);
    return;
  }

  const existing = findLinkAtSelection(view);
  if (existing) {
    const replacement = `[${existing.label}](${normalizedHref})`;
    view.dispatch({
      changes: { from: existing.from, to: existing.to, insert: replacement },
      selection: { anchor: existing.from + replacement.length },
    });
    return;
  }

  const { from, to } = view.state.selection.main;
  const label = view.state.doc.sliceString(from, to);
  const replacement = `[${label}](${normalizedHref})`;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection:
      label.length > 0
        ? { anchor: from + replacement.length }
        : { anchor: from + 1 },
  });
}

function removeLink(view: EditorView) {
  const link = findLinkAtSelection(view);
  if (!link) return;
  view.dispatch({
    changes: { from: link.from, to: link.to, insert: link.label },
    selection: { anchor: link.from, head: link.from + link.label.length },
  });
}

function findLinkAtSelection(view: EditorView): LocatedLink | null {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  const linkPattern = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of line.text.matchAll(linkPattern)) {
    const from = line.from + (match.index ?? 0);
    const to = from + match[0].length;
    if (selection.from <= to && selection.to >= from) {
      return {
        from,
        to,
        label: match[1] ?? "",
        href: match[2] ?? "",
      };
    }
  }
  return null;
}

function getFormattingState(
  view: EditorView | null,
): DiscussionFormattingState {
  if (!view) return EMPTY_FORMATTING_STATE;
  const selection = view.state.selection.main;
  const document = view.state.doc.toString();
  const link = findLinkAtSelection(view);
  return {
    bold: hasInlineMarkup(document, selection, "**"),
    italic: hasInlineMarkup(document, selection, "*"),
    highlight: hasInlineMarkup(document, selection, "=="),
    link: Boolean(link),
    code: hasInlineMarkup(document, selection, "`"),
    codeBlock: isInsideFence(document, selection.head),
    canUndo: undoDepth(view.state) > 0,
    canRedo: redoDepth(view.state) > 0,
    linkUrl: link?.href ?? "",
  };
}

function toggleLinePrefix(view: EditorView, prefix: string, matcher: RegExp) {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const lines = [];
  for (let number = startLine.number; number <= endLine.number; number += 1) {
    lines.push(view.state.doc.line(number));
  }
  const remove = lines.every((line) => matcher.test(line.text));
  const changes = lines.map((line) =>
    remove
      ? {
          from: line.from,
          to: line.from + (line.text.match(matcher)?.[0].length ?? 0),
          insert: "",
        }
      : { from: line.from, insert: prefix },
  );
  view.dispatch({ changes });
}

function toggleOrderedList(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to);
  const lines = [];
  for (let number = startLine.number; number <= endLine.number; number += 1) {
    lines.push(view.state.doc.line(number));
  }
  const remove = lines.every((line) => ORDERED_PREFIX.test(line.text));
  const changes = lines.map((line, index) =>
    remove
      ? {
          from: line.from,
          to: line.from + (line.text.match(ORDERED_PREFIX)?.[0].length ?? 0),
          insert: "",
        }
      : { from: line.from, insert: `${index + 1}. ` },
  );
  view.dispatch({ changes });
}

const BULLET_PREFIX = /^\s*[-+*]\s+/;
const ORDERED_PREFIX = /^\s*\d+[.)]\s+/;
const TASK_PREFIX = /^\s*[-+*]\s+\[[ xX]\]\s+/;
const BLOCKQUOTE_PREFIX = /^\s*>\s?/;

function hasInlineMarkup(
  document: string,
  selection: SelectionRange,
  marker: string,
) {
  const length = marker.length;
  if (
    selection.from >= length &&
    isCompleteInlineMarkerAt(document, selection.from - length, marker) &&
    isCompleteInlineMarkerAt(document, selection.to, marker)
  ) {
    return true;
  }
  const lineStart = document.lastIndexOf("\n", selection.head - 1) + 1;
  const lineEnd = document.indexOf("\n", selection.head);
  const line = document.slice(
    lineStart,
    lineEnd === -1 ? document.length : lineEnd,
  );
  const offset = selection.head - lineStart;
  const before = findCompleteMarkerBefore(line, marker, offset);
  const after = findCompleteMarkerAfter(line, marker, offset);
  return before !== -1 && after !== -1 && before < after;
}

function findCompleteMarkerBefore(
  source: string,
  marker: string,
  offset: number,
) {
  let index = source.lastIndexOf(marker, offset);
  while (index !== -1) {
    if (isCompleteInlineMarkerAt(source, index, marker)) return index;
    if (index === 0) break;
    index = source.lastIndexOf(marker, index - 1);
  }
  return -1;
}

function findCompleteMarkerAfter(
  source: string,
  marker: string,
  offset: number,
) {
  for (
    let index = source.indexOf(marker, offset);
    index !== -1;
    index = source.indexOf(marker, index + marker.length)
  ) {
    if (isCompleteInlineMarkerAt(source, index, marker)) return index;
  }
  return -1;
}

function isCompleteInlineMarkerAt(
  source: string,
  index: number,
  marker: string,
) {
  if (index < 0 || source.slice(index, index + marker.length) !== marker) {
    return false;
  }
  if (marker !== "*") return true;

  let runStart = index;
  while (runStart > 0 && source[runStart - 1] === "*") runStart -= 1;
  let runEnd = index + 1;
  while (runEnd < source.length && source[runEnd] === "*") runEnd += 1;
  return (runEnd - runStart) % 2 === 1;
}

function isInsideFence(document: string, position: number) {
  const before = document.slice(0, position);
  return (before.match(/^```/gm)?.length ?? 0) % 2 === 1;
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const EMPTY_FORMATTING_STATE: DiscussionFormattingState = {
  bold: false,
  italic: false,
  highlight: false,
  link: false,
  code: false,
  codeBlock: false,
  canUndo: false,
  canRedo: false,
  linkUrl: "",
};
