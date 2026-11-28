import { cn } from "../lib/utils";
import type { EmojiSuggestion } from "./emojiShortcodeData";

export function EmojiSuggestions({
  listboxId,
  optionIds,
  suggestions,
  activeIndex,
  loading,
  onPick,
  onActiveChange,
}: {
  listboxId: string;
  optionIds: readonly string[];
  suggestions: readonly EmojiSuggestion[];
  activeIndex: number;
  loading: boolean;
  onPick: (suggestion: EmojiSuggestion) => void;
  onActiveChange: (index: number) => void;
}) {
  return (
    <div className="absolute bottom-full left-14 z-40 mb-1 max-w-[min(28rem,calc(100%-4rem))] overflow-hidden rounded-xl border border-(--chat-line) bg-(--chat-in) shadow-[0_18px_48px_rgb(0_0_0/0.3)]">
      <div
        id={listboxId}
        role="listbox"
        aria-label="Emoji suggestions"
        aria-busy={loading || undefined}
        className="flex max-h-14 items-center gap-1 overflow-x-auto p-1"
      >
        {suggestions.length === 0 ? (
          <p
            role="status"
            className="m-0 px-3 py-2 text-[0.84rem] text-(--muted)"
          >
            {loading ? "Loading emoji…" : "No emoji found"}
          </p>
        ) : (
          suggestions.map((suggestion, index) => (
            <button
              key={suggestion.unified}
              id={optionIds[index]}
              type="button"
              role="option"
              aria-label={suggestion.name}
              aria-selected={index === activeIndex}
              title={suggestion.name}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onActiveChange(index)}
              onClick={() => onPick(suggestion)}
              className={cn(
                "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[1.4rem] leading-none hover:bg-(--chat-hover)",
                index === activeIndex && "bg-(--chat-selected)",
              )}
            >
              <span aria-hidden="true">{suggestion.emoji}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
