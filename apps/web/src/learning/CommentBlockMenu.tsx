import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CodeBlockIcon as CodeBlock } from "@phosphor-icons/react/CodeBlock";
import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react/ListBullets";
import { ListNumbersIcon as ListNumbers } from "@phosphor-icons/react/ListNumbers";
import { MinusIcon as Minus } from "@phosphor-icons/react/Minus";
import { QuotesIcon as Quotes } from "@phosphor-icons/react/Quotes";
import { TextHOneIcon as TextHOne } from "@phosphor-icons/react/TextHOne";
import { TextHThreeIcon as TextHThree } from "@phosphor-icons/react/TextHThree";
import { TextHTwoIcon as TextHTwo } from "@phosphor-icons/react/TextHTwo";
import { TextTIcon as TextT } from "@phosphor-icons/react/TextT";
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  CommentBlockCommand,
  CommentBlockCommandId,
} from "./commentBlockCommands";

export interface CommentBlockMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface CommentBlockMenuProps {
  items: readonly CommentBlockCommand[];
  onSelect: (command: CommentBlockCommand) => void;
  activeCommandId?: CommentBlockCommandId;
  query?: string;
  title?: string;
  maxHeight?: CSSProperties["maxHeight"];
}

export const CommentBlockMenu = forwardRef<
  CommentBlockMenuHandle,
  CommentBlockMenuProps
>(function CommentBlockMenu(
  {
    items,
    onSelect,
    activeCommandId,
    query = "",
    title = "Basic blocks",
    maxHeight = "min(22rem, calc(100dvh - 1.5rem))",
  },
  ref,
) {
  const menuId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    const item = itemRefs.current[selectedIndex];
    const list = listRef.current;
    if (!item || !list) return;

    const itemRect = item.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (itemRect.top < listRect.top) {
      list.scrollTop -= listRect.top - itemRect.top;
    } else if (itemRect.bottom > listRect.bottom) {
      list.scrollTop += itemRect.bottom - listRect.bottom;
    }
  }, [selectedIndex]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event) {
        if (items.length === 0) return false;

        if (event.key === "ArrowDown") {
          setSelectedIndex((current) => (current + 1) % items.length);
          return true;
        }

        if (event.key === "ArrowUp") {
          setSelectedIndex(
            (current) => (current - 1 + items.length) % items.length,
          );
          return true;
        }

        if (event.key === "Home") {
          setSelectedIndex(0);
          return true;
        }

        if (event.key === "End") {
          setSelectedIndex(items.length - 1);
          return true;
        }

        if (event.key === "Enter") {
          const selectedItem = items[Math.min(selectedIndex, items.length - 1)];
          if (!selectedItem) return false;
          onSelect(selectedItem);
          return true;
        }

        return false;
      },
    }),
    [items, onSelect, selectedIndex],
  );

  const activeItem = items[Math.min(selectedIndex, items.length - 1)];
  const activeDescendant = activeItem
    ? `${menuId}-${activeItem.id}`
    : undefined;

  return (
    <div
      data-comment-block-menu
      role="listbox"
      aria-label={title}
      aria-activedescendant={activeDescendant}
      style={{ maxHeight }}
      className="flex w-[min(19rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--surface)_96%,var(--canvas))] p-1.5 text-(--text) shadow-[0_18px_48px_color-mix(in_srgb,var(--canvas)_52%,transparent),0_2px_8px_color-mix(in_srgb,var(--canvas)_24%,transparent)] [border-color:color-mix(in_srgb,var(--text)_12%,transparent)]"
    >
      <div className="shrink-0 px-2 pb-1.5 pt-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-(--muted)">
        {title}
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {items.length > 0 ? (
          items.map((item, index) => {
            const selected = index === selectedIndex;
            const active = item.id === activeCommandId;

            return (
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                key={item.id}
                id={`${menuId}-${item.id}`}
                type="button"
                role="option"
                aria-selected={selected}
                data-active={active || undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left outline-none transition-colors ${selected ? "bg-(--hover)" : "hover:bg-(--hover)"}`}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setSelectedIndex(index)}
                onClick={() => onSelect(item)}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-md ${selected || active ? "bg-(--accent-soft) text-(--accent-ink,var(--accent))" : "bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--text-secondary)"}`}
                  aria-hidden="true"
                >
                  <BlockCommandIcon commandId={item.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.82rem] font-semibold leading-tight">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.7rem] leading-tight text-(--muted)">
                    {item.description}
                  </span>
                </span>
                {active && (
                  <Check
                    size={15}
                    weight="bold"
                    className="shrink-0 text-(--accent-ink,var(--accent))"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center text-xs text-(--muted)">
            No blocks found{query ? ` for “${query}”` : ""}.
          </div>
        )}
      </div>
    </div>
  );
});

function BlockCommandIcon({ commandId }: { commandId: CommentBlockCommandId }) {
  const iconProps = { size: 17, weight: "bold" as const };

  switch (commandId) {
    case "text":
      return <TextT {...iconProps} />;
    case "heading-1":
      return <TextHOne {...iconProps} />;
    case "heading-2":
      return <TextHTwo {...iconProps} />;
    case "heading-3":
      return <TextHThree {...iconProps} />;
    case "bullet-list":
      return <ListBullets {...iconProps} />;
    case "numbered-list":
      return <ListNumbers {...iconProps} />;
    case "quote":
      return <Quotes {...iconProps} />;
    case "code-block":
      return <CodeBlock {...iconProps} />;
    case "divider":
      return <Minus {...iconProps} />;
  }
}
