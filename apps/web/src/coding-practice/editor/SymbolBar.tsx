import { FOCUS_RING, MONO } from "../shared/ui";

/** Characters slow to reach on phone keyboards, with names for readers. */
const SYMBOLS: { text: string; label: string; insert?: string }[] = [
  { text: "{ }", label: "Insert braces", insert: "{}" },
  { text: "( )", label: "Insert parentheses", insert: "()" },
  { text: "[ ]", label: "Insert brackets", insert: "[]" },
  { text: ";", label: "Insert semicolon" },
  { text: "=", label: "Insert equals sign" },
  { text: "<", label: "Insert less-than sign" },
  { text: ">", label: "Insert greater-than sign" },
  { text: "/", label: "Insert slash" },
  { text: '"', label: "Insert double quote" },
  { text: "'", label: "Insert single quote" },
  { text: "`", label: "Insert backtick" },
  { text: "=>", label: "Insert arrow" },
  { text: "⇥", label: "Insert indent", insert: "  " },
];

/**
 * A row of keys above a phone's keyboard. Buttons keep the editor focused
 * (pointer-down is cancelled), so the keyboard stays up.
 */
export function SymbolBar({ onInsert }: { onInsert: (text: string) => void }) {
  return (
    <div
      role="toolbar"
      aria-label="Code symbols"
      className="flex gap-1 overflow-x-auto border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-(--surface-strong) px-1.5 py-1.5 [scrollbar-width:none]"
    >
      {SYMBOLS.map((symbol) => (
        <button
          key={symbol.label}
          type="button"
          aria-label={symbol.label}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onInsert(symbol.insert ?? symbol.text)}
          className={`inline-flex h-9 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2 text-[0.9375rem]! font-semibold! text-(--text) active:bg-(--hover) font-mono! ${FOCUS_RING}`}
        >
          {symbol.text}
        </button>
      ))}
    </div>
  );
}
