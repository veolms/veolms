import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * How the composer posts from the keyboard:
 *
 * - Enter posts. Shift+Enter adds a new line, as it always has.
 * - Ctrl/⌘+Enter posts too, as it did before Enter did.
 * - Enter adds a new line instead while the text is being composed with an
 *   input method (Hindi, Kannada, Chinese, Japanese, Korean…: the Enter
 *   that confirms a word must not post it), inside a fenced code block
 *   (code needs its lines), and on a touch screen, whose keyboard's Enter
 *   is for new lines; the Post button posts there.
 *
 * Kept below the mention list's own keys (`Prec.high`, the list is
 * `Prec.highest`): with suggestions open, Enter picks the person.
 */
export function createSubmitKeymap(submit: () => void): Extension {
  return Prec.high(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          if (isComposingText(view) || isTouchScreen()) return false;
          if (insideCodeFence(view)) return false;
          submit();
          return true;
        },
      },
      {
        key: "Mod-Enter",
        run: (view) => {
          if (isComposingText(view)) return false;
          submit();
          return true;
        },
      },
    ]),
  );
}

function isComposingText(view: EditorView): boolean {
  return view.composing || view.compositionStarted;
}

function isTouchScreen(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches &&
    !window.matchMedia("(pointer: fine)").matches
  );
}

/** Whether the cursor is between an opening ``` line and its closing one. */
function insideCodeFence(view: EditorView): boolean {
  const { state } = view;
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  let open = false;
  for (let number = 1; number < cursorLine; number += 1) {
    if (/^\s*(```|~~~)/u.test(state.doc.line(number).text)) open = !open;
  }
  return open;
}
