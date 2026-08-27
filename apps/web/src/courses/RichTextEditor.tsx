import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useBackDismiss } from "../navigation/useBackDismiss";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import {
  CaretDownIcon as CaretDown,
  TextBIcon as TextB,
  TextItalicIcon as TextItalic,
  ListBulletsIcon as ListBullets,
  ListNumbersIcon as ListNumbers,
  QuotesIcon as Quotes,
  PaperclipIcon as Paperclip,
  SmileyIcon as Smiley,
} from "@phosphor-icons/react";

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Link } from "@tiptap/extension-link";

// ---------------------------------------------------------------------------
// Singleton editor - used ONLY to convert Markdown → HTML for the preview card.
// The editing surface is a plain <textarea>; no Tiptap in the editor itself.
// ---------------------------------------------------------------------------
let parserEditorInstance: Editor | null = null;

function getParserEditor(): Editor {
  if (!parserEditorInstance) {
    parserEditorInstance = new Editor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
        Markdown.configure({ markedOptions: { breaks: true, gfm: true } }),
        Link.configure({ openOnClick: true }),
      ],
    });
  }
  return parserEditorInstance;
}

/**
 * Normalize stored Markdown that may contain artifacts from older Tiptap
 * serialization: backslash escapes AND HTML entities.
 *
 * HTML entities (e.g. &gt;, &amp;) were produced when Tiptap's Markdown
 * serializer encoded characters as HTML before the plain-textarea approach.
 * Backslash escapes (\\>, \\[, \\*) were added by Tiptap's Markdown serializer
 * to prevent those characters from being misread as Markdown syntax.
 */
function preprocessMarkdown(md: string): string {
  if (!md) return "";
  return (
    md
      // Decode HTML entities first (Tiptap serializer leftovers)
      .replace(/&gt;/g, ">")
      .replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x60;/g, "`")
      // Then unescape Markdown backslash escapes
      .replace(/^\\>\s*/gm, "> ")
      .replace(/\\>/g, ">")
      .replace(/\\\[/g, "[")
      .replace(/\\\]/g, "]")
      .replace(/\\\*/g, "*")
      .replace(/\\_/g, "_")
      .replace(/\\-/g, "-")
      .replace(/\\#/g, "#")
      .replace(/\\`/g, "`")
  );
}

/** Convert a Markdown string → HTML string for the Course Preview card. */
export function markdownToHTML(markdown: string): string {
  if (!markdown || !markdown.trim()) return "";
  try {
    const ed = getParserEditor();
    const cleanMd = preprocessMarkdown(markdown);
    const parsedDoc = ed.storage.markdown.manager.parse(cleanMd);
    ed.commands.setContent(parsedDoc);
    return ed.getHTML();
  } catch (err) {
    console.error("Failed to parse Markdown to HTML:", err);
    return "";
  }
}

/** Renders Markdown as rich HTML in the Course Preview card. */
export function RenderMarkdown({ content }: { content: string }) {
  if (!content || !content.trim()) return null;
  const html = markdownToHTML(content);
  if (!html) return null;
  return (
    <div
      className="course-preview-markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Strip Markdown syntax for plain-text representations (search indexes, etc.) */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return "";
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*>\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Pure Markdown text-manipulation helpers for the textarea toolbar
// ---------------------------------------------------------------------------

type EditResult = { newValue: string; newStart: number; newEnd: number };

/**
 * Wrap or unwrap the current selection with a symmetrical marker (e.g. ** for bold, * for italic).
 * Properly detects both when markers are inside the selection [**text**]
 * and when markers surround the selection outside **[text]**, toggling cleanly without stacking.
 */
function wrapSelection(
  value: string,
  start: number,
  end: number,
  marker: string,
): EditResult {
  const mLen = marker.length;
  const selected = value.slice(start, end);

  // Case 1: The selection itself includes the markers (e.g. [**hello**])
  if (
    selected.length >= mLen * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    if (
      marker === "*" &&
      selected.startsWith("**") &&
      selected.endsWith("**")
    ) {
      // Bold inside selection, skip unwrapping as italic
    } else {
      const inner = selected.slice(mLen, selected.length - mLen);
      return {
        newValue: value.slice(0, start) + inner + value.slice(end),
        newStart: start,
        newEnd: start + inner.length,
      };
    }
  }

  // Case 2: The selection is surrounded by markers outside (e.g. **[hello]**)
  const hasSurroundingBefore =
    start >= mLen && value.slice(start - mLen, start) === marker;
  const hasSurroundingAfter =
    end + mLen <= value.length && value.slice(end, end + mLen) === marker;

  if (hasSurroundingBefore && hasSurroundingAfter) {
    const isDoubleBefore = start >= 2 && value.slice(start - 2, start) === "**";
    const isDoubleAfter =
      end + 2 <= value.length && value.slice(end, end + 2) === "**";
    if (marker === "*" && isDoubleBefore && isDoubleAfter) {
      // Surrounded by bold (**), do not unwrap as italic (*)
    } else {
      const before = value.slice(0, start - mLen);
      const after = value.slice(end + mLen);
      return {
        newValue: before + selected + after,
        newStart: start - mLen,
        newEnd: end - mLen,
      };
    }
  }

  // Case 3: Empty selection (collapsed cursor)
  if (start === end) {
    const before = value.slice(0, start);
    const after = value.slice(end);
    return {
      newValue: before + marker + marker + after,
      newStart: start + mLen,
      newEnd: start + mLen,
    };
  }

  // Case 4: Wrap selection with markers (e.g. [hello] -> **hello**)
  const before = value.slice(0, start);
  const after = value.slice(end);
  return {
    newValue: before + marker + selected + marker + after,
    newStart: start + mLen,
    newEnd: end + mLen,
  };
}

/**
 * Toggle a line-level prefix (e.g. "> " for blockquote, "- " for bullet list)
 * on every line covered by the current selection.
 */
function toggleLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string,
): EditResult {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = value.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const chunk = value.slice(lineStart, lineEnd);
  const lines = chunk.split("\n");
  const allPrefixed = lines.every((l) => l.startsWith(prefix));
  const newLines = allPrefixed
    ? lines.map((l) => l.slice(prefix.length))
    : lines.map((l) => prefix + l);
  const newChunk = newLines.join("\n");
  const delta = newChunk.length - chunk.length;
  return {
    newValue: value.slice(0, lineStart) + newChunk + value.slice(lineEnd),
    newStart: lineStart,
    newEnd: lineEnd + delta,
  };
}

/**
 * Toggle ordered list numbering on selected lines.
 */
function toggleOrderedList(
  value: string,
  start: number,
  end: number,
): EditResult {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = value.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const chunk = value.slice(lineStart, lineEnd);
  const lines = chunk.split("\n");
  const allNumbered = lines.every((l) => /^\d+\.\s/.test(l));
  const newLines = allNumbered
    ? lines.map((l) => l.replace(/^\d+\.\s/, ""))
    : lines.map((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s/, "")}`);
  const newChunk = newLines.join("\n");
  const delta = newChunk.length - chunk.length;
  return {
    newValue: value.slice(0, lineStart) + newChunk + value.slice(lineEnd),
    newStart: lineStart,
    newEnd: lineEnd + delta,
  };
}

/**
 * Set or clear the heading prefix (# / ##) on the line under the cursor.
 */
function setHeadingOnLine(
  value: string,
  cursorPos: number,
  heading: "h1" | "h2" | "normal",
): EditResult {
  const lineStart = value.lastIndexOf("\n", cursorPos - 1) + 1;
  const lineEndIdx = value.indexOf("\n", cursorPos);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const cleanLine = line.replace(/^#+\s*/, "");
  const prefix = heading === "h1" ? "# " : heading === "h2" ? "## " : "";
  const newLine = prefix + cleanLine;
  const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
  const newCursor = lineStart + newLine.length;
  return { newValue, newStart: newCursor, newEnd: newCursor };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  disabled?: boolean;
}

/** Read the current app theme from the HTML data-theme attribute. */
function useAppTheme(): "dark" | "light" {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return document.documentElement.dataset.theme !== "light";
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.dataset.theme !== "light");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark ? "dark" : "light";
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add a detailed description...",
  maxLength = 1500,
  disabled = false,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const appTheme = useAppTheme();

  // Reactive selection state - used only for toolbar "is-active" indicators.
  const [sel, setSel] = useState({ start: 0, end: 0 });

  // One-time cleanup: normalize old Tiptap-serialized content (HTML entities,
  // backslash escapes) into clean Markdown on mount.
  const cleanedOnMount = useRef(false);
  useEffect(() => {
    if (cleanedOnMount.current) return;
    cleanedOnMount.current = true;
    const clean = preprocessMarkdown(value);
    if (clean !== value) {
      onChange(clean);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPos, setEmojiPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [showLinkPopover, setShowLinkPopover] = useState(false);

  useBackDismiss({
    open: showLinkPopover,
    onDismiss: () => setShowLinkPopover(false),
  });
  useBackDismiss({
    open: showEmojiPicker,
    onDismiss: () => setShowEmojiPicker(false),
  });
  const [linkUrlInput, setLinkUrlInput] = useState("");
  const [linkPopoverPos, setLinkPopoverPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const linkBtnRef = useRef<HTMLButtonElement | null>(null);
  const linkPopoverRef = useRef<HTMLDivElement | null>(null);

  // -------------------------------------------------------------------------
  // Selection tracking (drives toolbar active states)
  // -------------------------------------------------------------------------
  const syncSel = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    setSel({ start: ta.selectionStart, end: ta.selectionEnd });
  };

  // -------------------------------------------------------------------------
  // Toolbar "is active" derived values
  // -------------------------------------------------------------------------
  const getLineAt = (pos: number) => {
    const ls = value.lastIndexOf("\n", pos - 1) + 1;
    const le = value.indexOf("\n", pos);
    return value.slice(ls, le === -1 ? value.length : le);
  };

  const currentLine = getLineAt(sel.start);
  const currentFormat = currentLine.startsWith("## ")
    ? "h2"
    : currentLine.startsWith("# ")
      ? "h1"
      : "normal";
  const selected = value.slice(sel.start, sel.end);
  const isSurroundedBold =
    sel.start >= 2 &&
    sel.end + 2 <= value.length &&
    value.slice(sel.start - 2, sel.start) === "**" &&
    value.slice(sel.end, sel.end + 2) === "**";
  const isIncludedBold =
    selected.startsWith("**") &&
    selected.endsWith("**") &&
    selected.length >= 4;
  const isBold = isSurroundedBold || isIncludedBold;

  const isSurroundedItalic =
    !isSurroundedBold &&
    sel.start >= 1 &&
    sel.end + 1 <= value.length &&
    value.slice(sel.start - 1, sel.start) === "*" &&
    value.slice(sel.end, sel.end + 1) === "*";
  const isIncludedItalic =
    !isIncludedBold &&
    selected.startsWith("*") &&
    selected.endsWith("*") &&
    selected.length >= 2;
  const isItalic = isSurroundedItalic || isIncludedItalic;

  const isBlockquote = currentLine.startsWith("> ");
  const isBulletList = /^[-*+]\s/.test(currentLine);
  const isOrderedList = /^\d+\.\s/.test(currentLine);

  // -------------------------------------------------------------------------
  // Apply transform - always reads live selection from the DOM ref
  // -------------------------------------------------------------------------
  const applyTransform = (
    fn: (v: string, s: number, e: number) => EditResult,
  ) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const result = fn(value, s, e);
    onChange(result.newValue);
    // Restore cursor/selection after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(result.newStart, result.newEnd);
      setSel({ start: result.newStart, end: result.newEnd });
    });
  };

  // -------------------------------------------------------------------------
  // Toolbar actions
  // -------------------------------------------------------------------------
  const handleBold = () =>
    applyTransform((v, s, e) => wrapSelection(v, s, e, "**"));
  const handleItalic = () =>
    applyTransform((v, s, e) => wrapSelection(v, s, e, "*"));
  const handleBlockquote = () =>
    applyTransform((v, s, e) => toggleLinePrefix(v, s, e, "> "));
  const handleBulletList = () =>
    applyTransform((v, s, e) => toggleLinePrefix(v, s, e, "- "));
  const handleOrderedList = () =>
    applyTransform((v, s, e) => toggleOrderedList(v, s, e));
  const handleHeadingChange = (heading: string) =>
    applyTransform((v, s) =>
      setHeadingOnLine(v, s, heading as "h1" | "h2" | "normal"),
    );

  // -------------------------------------------------------------------------
  // Link Popover positioning
  // -------------------------------------------------------------------------
  const updateLinkPopoverPos = () => {
    if (!linkBtnRef.current) return;
    const rect = linkBtnRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(310, window.innerWidth - 24);
    const popoverHeight = 110;
    const margin = 8;
    const screenPadding = 12;
    const minTopSpace = 260;
    let left = rect.right - popoverWidth;
    left = Math.max(
      screenPadding,
      Math.min(left, window.innerWidth - popoverWidth - screenPadding),
    );
    const top =
      rect.top - margin >= minTopSpace
        ? rect.top - popoverHeight - margin
        : Math.min(
            rect.bottom + margin,
            window.innerHeight - popoverHeight - screenPadding,
          );
    setLinkPopoverPos({ top, left });
  };

  useEffect(() => {
    if (!showLinkPopover) return;
    updateLinkPopoverPos();
    const raf = requestAnimationFrame(updateLinkPopoverPos);
    window.addEventListener("resize", updateLinkPopoverPos);
    window.addEventListener("scroll", updateLinkPopoverPos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateLinkPopoverPos);
      window.removeEventListener("scroll", updateLinkPopoverPos, true);
    };
  }, [showLinkPopover]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        showLinkPopover &&
        linkPopoverRef.current &&
        !linkPopoverRef.current.contains(e.target as Node) &&
        linkBtnRef.current &&
        !linkBtnRef.current.contains(e.target as Node)
      ) {
        setShowLinkPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLinkPopover]);

  const handleOpenLinkPopover = (e: React.MouseEvent) => {
    e.preventDefault();
    if (showLinkPopover) {
      setShowLinkPopover(false);
      return;
    }
    setLinkUrlInput("");
    setShowLinkPopover(true);
  };

  const handleApplyLink = () => {
    const url = linkUrlInput.trim();
    if (!url) {
      setShowLinkPopover(false);
      return;
    }
    const finalUrl =
      /^https?:\/\//i.test(url) || url.startsWith("mailto:")
        ? url
        : `https://${url}`;
    // Snapshot selection before the popover closes
    const s = sel.start;
    const e = sel.end;
    const displayText = s !== e ? value.slice(s, e) : finalUrl;
    const linkMd = `[${displayText}](${finalUrl})`;
    const newValue = value.slice(0, s) + linkMd + value.slice(e);
    const newCursor = s + linkMd.length;
    onChange(newValue);
    setShowLinkPopover(false);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
      setSel({ start: newCursor, end: newCursor });
    });
  };

  // -------------------------------------------------------------------------
  // Emoji Picker positioning
  // -------------------------------------------------------------------------
  const updateEmojiPickerPos = () => {
    if (!emojiBtnRef.current) return;
    const rect = emojiBtnRef.current.getBoundingClientRect();
    const pickerWidth = Math.min(320, window.innerWidth - 24);
    const pickerHeight = 360;
    const margin = 8;
    const screenPadding = 12;
    let left = rect.right - pickerWidth;
    left = Math.max(
      screenPadding,
      Math.min(left, window.innerWidth - pickerWidth - screenPadding),
    );
    const top =
      rect.top - margin >= pickerHeight + screenPadding
        ? rect.top - pickerHeight - margin
        : Math.min(
            rect.bottom + margin,
            window.innerHeight - pickerHeight - screenPadding,
          );
    setEmojiPickerPos({ top, left });
  };

  useEffect(() => {
    if (!showEmojiPicker) return;
    updateEmojiPickerPos();
    const raf = requestAnimationFrame(updateEmojiPickerPos);
    window.addEventListener("resize", updateEmojiPickerPos);
    window.addEventListener("scroll", updateEmojiPickerPos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateEmojiPickerPos);
      window.removeEventListener("scroll", updateEmojiPickerPos, true);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node) &&
        emojiBtnRef.current &&
        !emojiBtnRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  // Scroll lock when any popover is open
  useEffect(() => {
    if (!showEmojiPicker && !showLinkPopover) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const block = (e: WheelEvent | TouchEvent) => {
      const t = e.target as Node;
      if (
        !emojiPickerRef.current?.contains(t) &&
        !linkPopoverRef.current?.contains(t)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("wheel", block as EventListener, {
      passive: false,
    });
    window.addEventListener("touchmove", block as EventListener, {
      passive: false,
    });
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("wheel", block as EventListener);
      window.removeEventListener("touchmove", block as EventListener);
    };
  }, [showEmojiPicker, showLinkPopover]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      className={`relative border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-[10px] overflow-visible bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] focus-within:border-[var(--accent)] ${disabled ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
    >
      <div className="flex items-center flex-wrap gap-1 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-1.5 bg-[color-mix(in_srgb,var(--text)_3%,transparent)] rounded-t-[9px]">
        {/* Heading / Format Selector */}
        <div className="relative inline-flex items-center shrink-0">
          <select
            aria-label="Text format"
            value={currentFormat}
            disabled={disabled}
            onChange={(e) => handleHeadingChange(e.target.value)}
            className="h-7 px-2.5 pr-6 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-md bg-[var(--surface)] text-[var(--text)] text-[0.80rem] font-semibold cursor-pointer outline-none transition-colors hover:bg-[var(--hover)] focus:border-[var(--accent)] appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option
              value="normal"
              className="bg-[var(--surface)] text-[var(--text)]"
            >
              Normal
            </option>
            <option
              value="h1"
              className="bg-[var(--surface)] text-[var(--text)]"
            >
              Heading 1
            </option>
            <option
              value="h2"
              className="bg-[var(--surface)] text-[var(--text)]"
            >
              Heading 2
            </option>
          </select>
          <CaretDown
            size={11}
            weight="bold"
            className="absolute right-2 text-[var(--muted)] pointer-events-none"
          />
        </div>

        {/* Divider */}
        <div className="w-px h-4 mx-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] shrink-0" />

        {/* Group 1: Bold & Italic */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Bold"
            disabled={disabled}
            className={`editor-btn ${isBold ? "is-active" : ""}`}
            aria-label="Bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleBold}
          >
            <TextB size={15} weight="bold" />
          </button>
          <button
            type="button"
            title="Italic"
            disabled={disabled}
            className={`editor-btn ${isItalic ? "is-active" : ""}`}
            aria-label="Italic"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleItalic}
          >
            <TextItalic size={15} weight="bold" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-4 mx-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] shrink-0" />

        {/* Group 2: Lists & Blockquote */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Bullet List"
            disabled={disabled}
            className={`editor-btn ${isBulletList ? "is-active" : ""}`}
            aria-label="Bullet List"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleBulletList}
          >
            <ListBullets size={15} />
          </button>
          <button
            type="button"
            title="Numbered List"
            disabled={disabled}
            className={`editor-btn ${isOrderedList ? "is-active" : ""}`}
            aria-label="Numbered List"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleOrderedList}
          >
            <ListNumbers size={15} />
          </button>
          <button
            type="button"
            title="Quote"
            disabled={disabled}
            className={`editor-btn ${isBlockquote ? "is-active" : ""}`}
            aria-label="Quote"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleBlockquote}
          >
            <Quotes size={15} />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-4 mx-1.5 bg-[color-mix(in_srgb,var(--text)_12%,transparent)] shrink-0" />

        {/* Group 3: Link & Emoji */}
        <div className="flex items-center gap-0.5">
          {/* Link Button & Popover */}
          <div className="course-wizard-emoji-popover-wrap relative inline-flex shrink-0">
            <button
              ref={linkBtnRef}
              type="button"
              title="Add Link"
              disabled={disabled}
              className={`editor-btn ${showLinkPopover ? "is-active" : ""}`}
              aria-label="Add Link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleOpenLinkPopover}
            >
              <Paperclip size={15} />
            </button>
            {showLinkPopover &&
              linkPopoverPos &&
              createPortal(
                <div
                  ref={linkPopoverRef}
                  className="course-wizard-link-popover"
                  style={{
                    position: "fixed",
                    top: `${linkPopoverPos.top}px`,
                    left: `${linkPopoverPos.left}px`,
                    zIndex: 99999,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="course-wizard-link-popover__inner">
                    <input
                      type="url"
                      className="course-wizard-link-input"
                      placeholder="https://example.com"
                      value={linkUrlInput}
                      autoFocus
                      onChange={(e) => setLinkUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleApplyLink();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setShowLinkPopover(false);
                        }
                      }}
                    />
                    <div className="course-wizard-link-actions">
                      <button
                        type="button"
                        className="course-wizard-link-btn-secondary"
                        onClick={() => setShowLinkPopover(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="course-wizard-link-btn-primary"
                        onClick={handleApplyLink}
                      >
                        Add Link
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </div>

          {/* Emoji Button & Popover */}
          <div className="course-wizard-emoji-popover-wrap relative inline-flex shrink-0">
            <button
              ref={emojiBtnRef}
              type="button"
              title="Emoji"
              disabled={disabled}
              className={`editor-btn ${showEmojiPicker ? "is-active" : ""}`}
              aria-label="Emoji"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                setShowEmojiPicker((p) => !p);
              }}
            >
              <Smiley size={15} />
            </button>
            {showEmojiPicker &&
              emojiPickerPos &&
              createPortal(
                <div
                  ref={emojiPickerRef}
                  className="course-wizard-emoji-popover"
                  style={{
                    position: "fixed",
                    top: `${emojiPickerPos.top}px`,
                    left: `${emojiPickerPos.left}px`,
                    zIndex: 99999,
                  }}
                >
                  <EmojiPicker
                    onEmojiClick={(emojiData) => {
                      const ta = textareaRef.current;
                      const pos = ta ? ta.selectionStart : sel.start;
                      const newVal =
                        value.slice(0, pos) +
                        emojiData.emoji +
                        value.slice(pos);
                      onChange(newVal);
                      setShowEmojiPicker(false);
                      requestAnimationFrame(() => {
                        if (!ta) return;
                        const np = pos + emojiData.emoji.length;
                        ta.focus();
                        ta.setSelectionRange(np, np);
                        setSel({ start: np, end: np });
                      });
                    }}
                    theme={
                      appTheme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT
                    }
                    width={320}
                    height={360}
                    lazyLoadEmojis
                    searchPlaceholder="Search emoji…"
                  />
                </div>,
                document.body,
              )}
          </div>
        </div>
      </div>

      {/* Plain Markdown textarea - the single source of truth */}
      <textarea
        ref={textareaRef}
        className="course-wizard-editor__raw-markdown"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onSelect={syncSel}
        onKeyUp={syncSel}
        onClick={syncSel}
        placeholder={placeholder}
        maxLength={maxLength}
      />

      <div className="flex justify-end px-3.5 pt-1.5 pb-2.5">
        <span className="static text-(--muted) text-[0.76rem]">
          {value.length} / {maxLength}
        </span>
      </div>
    </div>
  );
}
