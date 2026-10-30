import { SmileyIcon as Smiley } from "@phosphor-icons/react/Smiley";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import type { DiscussionEditorController } from "./discussion-editor/DiscussionEditor";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

const RECENT_EMOJIS_STORAGE_KEY = "veolms:comment-recent-emojis";
const MAX_RECENT_EMOJIS = 24;

interface CommentEmojiPickerProps {
  editor: DiscussionEditorController | null;
  onEditorNeeded?: () => void;
}

/**
 * The picker stays behind this lazy boundary so its emoji catalogue is not
 * included in a lesson's initial JavaScript. The picker owns its bounded,
 * deduplicated recent-history entry in localStorage.
 */
export function CommentEmojiPicker({
  editor,
  onEditorNeeded,
}: CommentEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState(readRecentEmojis);
  const colorScheme = useDocumentColorScheme();

  const addRecentEmoji = (unified: string) => {
    setRecentEmojis((current) => {
      const next = [
        unified,
        ...current.filter((recentEmoji) => recentEmoji !== unified),
      ].slice(0, MAX_RECENT_EMOJIS);
      persistRecentEmojis(next);
      return next;
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && !editor) {
      onEditorNeeded?.();
      return;
    }
    setOpen(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        aria-label="Insert emoji"
        title="Insert emoji"
        aria-pressed={open}
        onMouseDown={(event) => event.preventDefault()}
        className={`grid size-8 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${
          open
            ? "bg-(--accent-soft) text-(--accent-ink,var(--accent))"
            : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"
        }`}
      >
        <Smiley size={17} aria-hidden="true" />
      </PopoverTrigger>
      {open && (
        <PopoverContent
          align="start"
          side="top"
          sideOffset={10}
          className="w-auto max-w-[calc(100vw-1rem)] overflow-hidden p-0"
        >
          <Suspense
            fallback={
              <div
                aria-live="polite"
                className="grid h-80 w-[min(20rem,calc(100vw-2rem))] place-items-center text-sm text-(--muted)"
              >
                Loading emojis…
              </div>
            }
          >
            <EmojiPicker
              colorScheme={colorScheme}
              height={320}
              width="min(20rem, calc(100vw - 2rem))"
              lazyLoadEmojis
              suggestedEmojisMode="recent"
              suggestedEmojis={recentEmojis}
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emoji) => {
                editor?.insertMarkdown(emoji.emoji);
                addRecentEmoji(emoji.unified);
                setOpen(false);
              }}
            />
          </Suspense>
        </PopoverContent>
      )}
    </Popover>
  );
}

function readRecentEmojis(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(RECENT_EMOJIS_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((emoji): emoji is string => typeof emoji === "string")
      .filter(Boolean)
      .filter((emoji, index, emojis) => emojis.indexOf(emoji) === index)
      .slice(0, MAX_RECENT_EMOJIS);
  } catch {
    return [];
  }
}

function persistRecentEmojis(emojis: string[]) {
  try {
    window.localStorage.setItem(
      RECENT_EMOJIS_STORAGE_KEY,
      JSON.stringify(emojis),
    );
  } catch {
    // Private browsing and restrictive browser policies can deny storage.
    // The in-memory history remains available for the current session.
  }
}

function useDocumentColorScheme(): "light" | "dark" {
  const [colorScheme, setColorScheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    const updateColorScheme = () =>
      setColorScheme(root.dataset.theme === "light" ? "light" : "dark");
    const observer = new MutationObserver(updateColorScheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return colorScheme;
}
