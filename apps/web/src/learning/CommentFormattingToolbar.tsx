import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CodeBlockIcon as CodeBlock } from "@phosphor-icons/react/CodeBlock";
import { CodeIcon as Code } from "@phosphor-icons/react/Code";
import { HighlighterIcon as Highlighter } from "@phosphor-icons/react/Highlighter";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { TextBIcon as TextB } from "@phosphor-icons/react/TextB";
import { TextItalicIcon as TextItalic } from "@phosphor-icons/react/TextItalic";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { DiscussionEditorController } from "./discussion-editor/DiscussionEditor";
import type { DiscussionFormattingState } from "./discussion-editor/commands";
import { DISCUSSION_ATTACHMENTS_ENABLED } from "./discussion-editor/image-storage";

interface CommentFormattingToolbarProps {
  editor: DiscussionEditorController;
  formattingState: DiscussionFormattingState;
}

export function hasCommentToolbarOverflow(
  scrollWidth: number,
  clientWidth: number,
) {
  return scrollWidth > clientWidth + 1;
}

export function CommentFormattingToolbar({
  editor,
  formattingState,
}: CommentFormattingToolbarProps) {
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const scrollportRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  const openLinkEditor = () => {
    setLinkUrl(formattingState.linkUrl);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = normalizeLink(linkUrl);
    if (!href) editor.removeLink();
    else editor.applyLink(href);
    setLinkOpen(false);
    editor.focus();
  };

  const removeLink = () => {
    editor.removeLink();
    setLinkOpen(false);
    editor.focus();
  };

  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!file) return;
    await editor.attach(file);
  };

  useEffect(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;

    const updateOverflow = () => {
      setHasHorizontalOverflow(
        hasCommentToolbarOverflow(
          scrollport.scrollWidth,
          scrollport.clientWidth,
        ),
      );
    };

    updateOverflow();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateOverflow);
    resizeObserver?.observe(scrollport);
    window.addEventListener("resize", updateOverflow);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, []);

  return (
    <div
      data-comment-formatting-toolbar
      className="relative -my-2.5 flex min-w-0 flex-1 basis-0 self-stretch items-center overflow-hidden"
    >
      {linkOpen && (
        <form
          aria-label="Edit link"
          className="absolute bottom-[calc(100%+0.75rem)] left-0 z-30 flex w-[min(22rem,calc(100vw-2rem))] items-center gap-1.5 rounded-xl bg-(--surface-elevated,var(--surface)) p-2 shadow-[0_16px_44px_rgba(0,0,0,0.34),0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)]"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            setLinkOpen(false);
            editor.focus();
          }}
        >
          <input
            autoFocus
            type="text"
            inputMode="url"
            aria-label="Link URL"
            value={linkUrl}
            placeholder="https://example.com"
            className="h-9 min-w-0 flex-1 rounded-lg bg-[color-mix(in_srgb,var(--canvas)_72%,transparent)] px-3 text-sm text-(--text) outline-none shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)] placeholder:text-(--muted) focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          {formattingState.link && (
            <button
              type="button"
              className="h-9 rounded-lg px-2.5 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
              onClick={removeLink}
            >
              Remove
            </button>
          )}
          <button
            type="submit"
            className="h-9 rounded-lg bg-(--accent) px-3 text-xs font-semibold text-(--on-accent) transition-colors hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
          >
            Apply
          </button>
        </form>
      )}

      <span
        data-comment-toolbar-separator="leading"
        aria-hidden="true"
        className="h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
      />

      <div
        ref={scrollportRef}
        data-base-ui-swipe-ignore=""
        data-learning-swipe-ignore=""
        role="toolbar"
        aria-label="Comment formatting"
        className="learning-comment-formatting-scrollport swiper-no-swiping flex h-full min-w-0 flex-1 touch-pan-x items-center gap-0.5 overflow-x-auto overscroll-x-contain"
      >
        <ToolbarButton
          label="Undo"
          mobileOnly
          disabled={!formattingState.canUndo}
          onClick={() => editor.undo()}
        >
          <ArrowCounterClockwise size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          mobileOnly
          disabled={!formattingState.canRedo}
          onClick={() => editor.redo()}
        >
          <ArrowClockwise size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Highlight"
          active={formattingState.highlight}
          onClick={() => editor.toggleHighlight()}
        >
          <Highlighter size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Add or edit link"
          active={formattingState.link}
          onClick={openLinkEditor}
        >
          <LinkSimple size={17} />
        </ToolbarButton>
        {DISCUSSION_ATTACHMENTS_ENABLED && (
          <ToolbarButton
            label="Attach image or video"
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip size={17} />
          </ToolbarButton>
        )}
        <ToolbarButton
          label="Bold"
          active={formattingState.bold}
          onClick={() => editor.toggleBold()}
        >
          <TextB size={17} weight="bold" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={formattingState.italic}
          onClick={() => editor.toggleItalic()}
        >
          <TextItalic size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={formattingState.code}
          onClick={() => editor.toggleInlineCode()}
        >
          <Code size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={formattingState.codeBlock}
          onClick={() => editor.toggleCodeBlock()}
        >
          <CodeBlock size={17} />
        </ToolbarButton>
      </div>

      {hasHorizontalOverflow && (
        <span
          data-comment-toolbar-separator="trailing"
          aria-hidden="true"
          className="h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        />
      )}

      {DISCUSSION_ATTACHMENTS_ENABLED && (
        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          aria-label="Choose image or video"
          className="sr-only"
          onChange={handleAttachment}
        />
      )}
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  mobileOnly?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  mobileOnly = false,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`size-8 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-35 ${mobileOnly ? "grid sm:hidden" : "grid"} ${active ? "bg-(--accent-soft) text-(--accent-ink,var(--accent))" : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
