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
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
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
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ activateOnTyping: true }),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          keymap.of([
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                callbacks.current.onRun?.();
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
            ...closeBracketsKeymap,
            ...defaultKeymap,
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
