import { CodeIcon as Code } from "@phosphor-icons/react/Code";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { ListNumbersIcon as ListNumbers } from "@phosphor-icons/react/ListNumbers";
import { QuotesIcon as Quotes } from "@phosphor-icons/react/Quotes";
import { TextBIcon as TextB } from "@phosphor-icons/react/TextB";
import { TextItalicIcon as TextItalic } from "@phosphor-icons/react/TextItalic";
import { TextStrikethroughIcon as TextStrikethrough } from "@phosphor-icons/react/TextStrikethrough";

import { useShortcutPlatform } from "../useShortcutPlatform";
import type { InlineMark, LineMark } from "./composerFormat";

const ITEMS: Array<{
  mark: InlineMark | LineMark;
  label: string;
  keys: string;
  Icon: typeof TextB;
}> = [
  { mark: "*", label: "Bold", keys: "B", Icon: TextB },
  { mark: "_", label: "Italic", keys: "I", Icon: TextItalic },
  {
    mark: "~",
    label: "Strikethrough",
    keys: "Shift+X",
    Icon: TextStrikethrough,
  },
  { mark: "```", label: "Monospace", keys: "Shift+M", Icon: Code },
  {
    mark: "bullet",
    label: "Bulleted list",
    keys: "Shift+8",
    Icon: ListBullets,
  },
  {
    mark: "number",
    label: "Numbered list",
    keys: "Shift+7",
    Icon: ListNumbers,
  },
  { mark: "quote", label: "Quote", keys: "Shift+9", Icon: Quotes },
];

/**
 * WhatsApp's formatting bar: shown over the message box while text in it
 * is selected. Each button wraps (or unwraps) the selection.
 */
export function FormatBar({
  onFormat,
}: {
  onFormat: (mark: InlineMark | LineMark) => void;
}) {
  const mod = useShortcutPlatform() === "mac" ? "⌘" : "Ctrl";
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="absolute bottom-full left-1/2 z-20 mb-1 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-solid border-(--chat-line) bg-(--chat-in) p-1 shadow-[0_8px_24px_rgb(0_0_0/0.28)]"
      // Keep the selection: a press here must not move focus.
      onMouseDown={(event) => event.preventDefault()}
    >
      {ITEMS.map(({ mark, label, keys, Icon }) => (
        <button
          key={mark}
          type="button"
          aria-label={label}
          title={`${label} (${mod}+${keys})`}
          onClick={() => onFormat(mark)}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--text-secondary) transition-colors hover:bg-(--chat-hover) hover:text-(--text)"
        >
          <Icon size={17} weight="bold" />
        </button>
      ))}
    </div>
  );
}
