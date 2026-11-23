import { useEffect, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  gotoLine,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
  selectSelectionMatches,
} from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  crosshairCursor,
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Code colours made from the app's own tokens, mixed with the text colour
 * so they stay readable on every palette in light and dark (the quiz
 * stage's approach). No second theme to keep in step.
 */
const highlight = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
    ],
    color: "var(--accent-ink, var(--accent))",
    fontWeight: "600",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    color: "color-mix(in srgb, var(--success, #22c55e) 55%, var(--text))",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    color: "color-mix(in srgb, #f59e0b 55%, var(--text))",
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "color-mix(in srgb, #38bdf8 55%, var(--text))",
  },
  {
    tag: [tags.typeName, tags.className, tags.tagName],
    color: "color-mix(in srgb, #f472b6 55%, var(--text))",
  },
  {
    tag: [tags.attributeName, tags.propertyName],
    color: "color-mix(in srgb, #a78bfa 55%, var(--text))",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--muted)",
    fontStyle: "italic",
  },
  { tag: tags.invalid, color: "var(--danger, #f43f5e)" },
]);

/** CodeMirror's panel words in the app's wording and capitals. */
const PANEL_PHRASES: Record<string, string> = {
  "Go to line": "Go to line",
  go: "Go",
  Find: "Find",
  Replace: "Replace",
  next: "Next",
  previous: "Previous",
  all: "All",
  "match case": "Match case",
  regexp: "Regex",
  "by word": "Whole word",
  replace: "Replace",
  "replace all": "Replace all",
  close: "Close",
};

const theme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "transparent",
    fontSize: "var(--code-font-size, 14px)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace",
    lineHeight: "1.6",
  },
  ".cm-content": { caretColor: "var(--accent)", padding: "10px 0" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "color-mix(in srgb, var(--muted) 75%, transparent)",
    border: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--text) 4%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in srgb, var(--accent) 24%, transparent) !important",
    },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-strong)",
    color: "var(--text)",
    border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
    borderRadius: "8px",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)",
    color: "var(--text)",
  },
  ".cm-errorLine": {
    backgroundColor:
      "color-mix(in srgb, var(--danger, #f43f5e) 12%, transparent)",
  },

  /*
   * Find / replace and Go to line: CodeMirror draws them grey with
   * gradient buttons. Here they take the app's look: its surface and
   * hairline, its text field (as FIELD) and quiet buttons, the accent for
   * the main action, in light and dark alike. The `&` prefix makes these
   * outrank CodeMirror's own light/dark panel rules.
   */
  "& .cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    fontFamily: "var(--app-font-family, system-ui, sans-serif)",
    zIndex: "5",
  },
  "& .cm-panels-top": {
    borderBottom: "1px solid color-mix(in srgb, var(--text) 9%, transparent)",
  },
  "& .cm-panels-bottom": {
    borderTop: "1px solid color-mix(in srgb, var(--text) 9%, transparent)",
  },
  "& .cm-panel.cm-search, & .cm-panel.cm-dialog": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "8px 44px 8px 10px",
    fontSize: "13px",
  },
  "& .cm-panel.cm-search br": { flexBasis: "100%", height: "0" },
  "& .cm-panel.cm-search input, & .cm-panel.cm-search button, & .cm-panel.cm-search label, & .cm-panel.cm-dialog label":
    { margin: "0" },
  "& .cm-panel label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    fontWeight: "600",
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
  },
  "& .cm-panel input[type=checkbox]": {
    width: "14px",
    height: "14px",
    margin: "0",
    accentColor: "var(--accent)",
  },
  "& .cm-textfield": {
    height: "32px",
    minWidth: "0",
    padding: "0 10px",
    border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
    borderRadius: "8px",
    backgroundColor: "color-mix(in srgb, var(--canvas) 75%, var(--surface))",
    color: "var(--text)",
    fontSize: "13px",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 120ms, box-shadow 120ms",
  },
  "& .cm-textfield::placeholder": { color: "var(--muted)" },
  "& .cm-textfield:focus": {
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent)",
  },
  "& .cm-dialog .cm-textfield": { width: "88px" },
  "& .cm-button": {
    height: "32px",
    padding: "0 12px",
    border: "none",
    borderRadius: "8px",
    backgroundImage: "none",
    backgroundColor: "color-mix(in srgb, var(--text) 7%, transparent)",
    color: "var(--text)",
    fontSize: "12.5px",
    fontWeight: "600",
    fontFamily: "inherit",
    textTransform: "none",
    cursor: "pointer",
  },
  "& .cm-button:hover": {
    backgroundColor:
      "var(--hover, color-mix(in srgb, var(--text) 11%, transparent))",
  },
  "& .cm-button:active": { backgroundImage: "none", transform: "scale(0.98)" },
  "& .cm-button:focus-visible, & .cm-panel [name=close]:focus-visible, & .cm-dialog-close:focus-visible":
    { outline: "2px solid var(--accent)", outlineOffset: "2px" },
  // The dialog's main action (Go) is the accent button, as the app's are.
  "& .cm-dialog button[type=submit]": {
    backgroundColor: "var(--accent)",
    color: "var(--on-accent, #fff)",
  },
  "& .cm-dialog button[type=submit]:hover": {
    backgroundColor: "var(--accent-hover, var(--accent))",
  },
  "& .cm-panel.cm-search [name=close], & .cm-dialog-close": {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "28px",
    height: "28px",
    display: "grid",
    placeItems: "center",
    padding: "0",
    border: "none",
    borderRadius: "999px",
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
    fontSize: "18px",
    lineHeight: "1",
    cursor: "pointer",
  },
  "& .cm-panel.cm-search [name=close]:hover, & .cm-dialog-close:hover": {
    backgroundColor:
      "var(--hover, color-mix(in srgb, var(--text) 8%, transparent))",
    color: "var(--text)",
  },
  "& .cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, #f59e0b 28%, transparent)",
    borderRadius: "2px",
  },
  "& .cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--accent) 38%, transparent)",
  },
  "& .cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)",
  },
  "& .cm-foldPlaceholder": {
    backgroundColor: "color-mix(in srgb, var(--text) 8%, transparent)",
    border: "none",
    borderRadius: "4px",
    color: "var(--text-secondary)",
    padding: "0 6px",
  },
});

export type CodeLanguage =
  "javascript" | "jsx" | "typescript" | "tsx" | "html" | "css";

export function languageForPath(path: string): CodeLanguage {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".html") || path.endsWith(".htm")) return "html";
  if (path.endsWith(".css")) return "css";
  return "javascript";
}

function languageExtension(language: CodeLanguage): Extension {
  switch (language) {
    case "html":
      return html();
    case "css":
      return css();
    case "jsx":
      return javascript({ jsx: true });
    case "typescript":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    default:
      return javascript();
  }
}

export interface CodeEditorHandle {
  /** Types text at the cursor (the phone symbol bar). */
  insert(text: string): void;
  /** Moves the cursor to a line and shows it. */
  goToLine(line: number): void;
  focus(): void;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: CodeLanguage;
  readOnly?: boolean;
  label: string;
  onRun?: () => void;
  onSubmit?: () => void;
  onFocusChange?: (focused: boolean) => void;
  /** Line with an error to mark, if any. */
  errorLine?: number;
  handleRef?: (handle: CodeEditorHandle | null) => void;
  className?: string;
}

/**
 * CodeMirror 6, already part of the app (the discussion editor). Native
 * selection and editing on phones; autocorrect and autocapitalize are off
 * by default on its content element. Tab indents; Escape then Tab moves
 * focus out of the editor.
 */
export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  label,
  onRun,
  onSubmit,
  onFocusChange,
  errorLine,
  handleRef,
  className = "",
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const languageSlot = useRef(new Compartment());
  const readOnlySlot = useRef(new Compartment());
  const errorSlot = useRef(new Compartment());
  const callbacks = useRef({ onChange, onRun, onSubmit, onFocusChange });
  callbacks.current = { onChange, onRun, onSubmit, onFocusChange };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          foldGutter(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          // VS Code's editing: several cursors (Alt+click, Ctrl+D), box
          // selection (Alt+drag), find and replace, matches highlighted.
          EditorState.allowMultipleSelections.of(true),
          // The panels' words, capitalised as the app writes buttons.
          EditorState.phrases.of(PANEL_PHRASES),
          rectangularSelection(),
          crosshairCursor(),
          highlightSelectionMatches(),
          search({ top: true }),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ activateOnTyping: true }),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          keymap.of([
            // LeetCode's keys: Ctrl/⌘ + ' runs, Ctrl/⌘ + Enter submits
            // (runs, where there is nothing to submit).
            {
              key: "Mod-'",
              preventDefault: true,
              run: () => {
                callbacks.current.onRun?.();
                return true;
              },
            },
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                if (callbacks.current.onSubmit) callbacks.current.onSubmit();
                else callbacks.current.onRun?.();
                return true;
              },
            },
            {
              key: "Mod-Shift-Enter",
              preventDefault: true,
              run: () => {
                callbacks.current.onSubmit?.();
                return true;
              },
            },
            // VS Code keys CodeMirror names differently.
            { key: "Mod-g", preventDefault: true, run: gotoLine },
            { key: "Mod-h", preventDefault: true, run: openSearchPanel },
            {
              key: "Mod-Shift-l",
              preventDefault: true,
              run: selectSelectionMatches,
            },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...foldKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          syntaxHighlighting(highlight),
          theme,
          languageSlot.current.of(languageExtension(language)),
          readOnlySlot.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          errorSlot.current.of([]),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange?.(update.state.doc.toString());
            if (update.focusChanged)
              callbacks.current.onFocusChange?.(update.view.hasFocus);
          }),
        ],
      }),
    });
    viewRef.current = view;
    handleRef?.({
      insert(text) {
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      goToLine(line) {
        const target = view.state.doc.line(
          Math.min(Math.max(1, line), view.state.doc.lines),
        );
        view.dispatch({
          selection: { anchor: target.from },
          scrollIntoView: true,
        });
        view.focus();
      },
      focus() {
        view.focus();
      },
    });
    return () => {
      handleRef?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // The view is created once; later prop changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new value from outside (reset, a loaded submission) replaces the text.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value)
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageSlot.current.reconfigure(languageExtension(language)),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlySlot.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    let extension: Extension = [];
    if (errorLine && errorLine <= view.state.doc.lines) {
      const line = view.state.doc.line(errorLine);
      extension = EditorView.decorations.of(
        Decoration.set([
          Decoration.line({ class: "cm-errorLine" }).range(line.from),
        ]),
      );
    }
    view.dispatch({ effects: errorSlot.current.reconfigure(extension) });
  }, [errorLine, value]);

  return (
    <div
      ref={hostRef}
      className={`h-full min-h-0 overflow-hidden ${className}`}
      data-code-editor=""
    />
  );
}
