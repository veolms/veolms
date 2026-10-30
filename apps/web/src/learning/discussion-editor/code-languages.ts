import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
} from "@codemirror/language";
import { ATOMIC_CODE_LANGUAGES } from "@atomic-editor/editor/code-languages";

function legacy(parser: StreamParser<unknown>) {
  return new LanguageSupport(StreamLanguage.define(parser));
}

export const DISCUSSION_CODE_LANGUAGES = [
  ...ATOMIC_CODE_LANGUAGES,
  LanguageDescription.of({
    name: "C#",
    alias: ["csharp", "cs"],
    extensions: ["cs"],
    load: () =>
      import("@codemirror/legacy-modes/mode/clike").then((module) =>
        legacy(module.csharp),
      ),
  }),
  LanguageDescription.of({
    name: "SCSS",
    extensions: ["scss"],
    load: () =>
      import("@codemirror/legacy-modes/mode/css").then((module) =>
        legacy(module.sCSS),
      ),
  }),
];
