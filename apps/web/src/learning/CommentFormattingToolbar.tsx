import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
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
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { DiscussionEditorController } from "./discussion-editor/DiscussionEditor";
import type { DiscussionFormattingState } from "./discussion-editor/commands";
import { DISCUSSION_ATTACHMENTS_ENABLED } from "./discussion-editor/image-storage";

interface CommentFormattingToolbarProps {
  /**
   * `null` while the editor is not in place yet. The buttons are shown all
   * the same, so the toolbar does not appear late; pressing one then asks
   * for the editor instead of formatting.
   */
  editor: DiscussionEditorController | null;
  formattingState: DiscussionFormattingState;
  attachmentsEnabled?: boolean;
  onEditorNeeded?: () => void;
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
  attachmentsEnabled = true,
  onEditorNeeded,
}: CommentFormattingToolbarProps) {
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const scrollportRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  const withEditor =
    (action: (ready: DiscussionEditorController) => void) => () => {
      if (editor) action(editor);
      else onEditorNeeded?.();
    };

  const openLinkEditor = () => {
    setLinkUrl(formattingState.linkUrl);
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = normalizeLink(linkUrl);
    if (!href) editor?.removeLink();
    else editor?.applyLink(href);
    setLinkOpen(false);
    editor?.focus();
  };

  const removeLink = () => {
    editor?.removeLink();
    setLinkOpen(false);
    editor?.focus();
  };

  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!file) return;
    await editor?.attach(file);
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

  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsSwipeRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const startToolsSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    // Open, the tools scroll sideways themselves.
    if (
      toolsOpen &&
      (event.target as Element).closest("[data-comment-toolbar-tools]")
    )
      return;
    toolsSwipeRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const finishToolsSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const swipe = toolsSwipeRef.current;
    toolsSwipeRef.current = null;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (Math.abs(dx) < 36 || Math.abs(dy) > Math.abs(dx)) return;
    setToolsOpen(dx > 0);
  };
  const cancelToolsSwipe = () => {
    toolsSwipeRef.current = null;
  };

  return (
    <div
      data-comment-formatting-toolbar
      className="relative -my-2.5 flex min-w-0 flex-1 basis-0 self-stretch items-center overflow-hidden"
      onPointerDown={startToolsSwipe}
      onPointerUp={finishToolsSwipe}
      onPointerCancel={cancelToolsSwipe}
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
            editor?.focus();
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

      {/* The tools wait behind this arrow: it, or a sideways swipe on the
          toolbar, opens and closes them. */}
      <button
        type="button"
        aria-label={toolsOpen ? "Hide formatting" : "Show formatting"}
        title={toolsOpen ? "Hide formatting" : "Show formatting"}
        aria-expanded={toolsOpen}
        onClick={() => setToolsOpen((open) => !open)}
        className="ml-0.5 grid size-8 shrink-0 place-items-center rounded-md text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
      >
        <CaretRight
          size={15}
          weight="bold"
          aria-hidden="true"
          className={`transition-transform duration-200 ${toolsOpen ? "rotate-180" : ""}`}
        />
      </button>

      <div
        data-comment-toolbar-tools
        inert={!toolsOpen || undefined}
        // The row keeps their room; folded, the tools fade back towards
        // the arrow, and they come out from it.
        className={`flex h-full min-w-0 flex-1 transition-[opacity,translate] duration-200 ease-out ${
          toolsOpen
            ? "translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-3 opacity-0"
        }`}
      >
        <div className="flex h-full min-w-0 overflow-hidden">
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
              onClick={withEditor((ready) => ready.undo())}
            >
              <ArrowCounterClockwise size={17} />
            </ToolbarButton>
            <ToolbarButton
              label="Redo"
              mobileOnly
              disabled={!formattingState.canRedo}
              onClick={withEditor((ready) => ready.redo())}
            >
              <ArrowClockwise size={17} />
            </ToolbarButton>
            <ToolbarButton
              label="Highlight"
              active={formattingState.highlight}
              onClick={withEditor((ready) => ready.toggleHighlight())}
            >
              <Highlighter size={17} />
            </ToolbarButton>
            <ToolbarButton
              label="Add or edit link"
              active={formattingState.link}
              onClick={withEditor(openLinkEditor)}
            >
              <LinkSimple size={17} />
            </ToolbarButton>
            {attachmentsEnabled && DISCUSSION_ATTACHMENTS_ENABLED && (
              <ToolbarButton
                label="Attach file"
                onClick={withEditor(() => attachmentInputRef.current?.click())}
              >
                <Paperclip size={17} />
              </ToolbarButton>
            )}
            <ToolbarButton
              label="Bold"
              active={formattingState.bold}
              onClick={withEditor((ready) => ready.toggleBold())}
            >
              <TextB size={17} weight="bold" />
            </ToolbarButton>
            <ToolbarButton
              label="Italic"
              active={formattingState.italic}
              onClick={withEditor((ready) => ready.toggleItalic())}
            >
              <TextItalic size={17} />
            </ToolbarButton>
            <ToolbarButton
              label="Inline code"
              active={formattingState.code}
              onClick={withEditor((ready) => ready.toggleInlineCode())}
            >
              <Code size={17} />
            </ToolbarButton>
            <ToolbarButton
              label="Code block"
              active={formattingState.codeBlock}
              onClick={withEditor((ready) => ready.toggleCodeBlock())}
            >
              <CodeBlock size={17} />
            </ToolbarButton>
          </div>
        </div>
      </div>

      {toolsOpen && hasHorizontalOverflow && (
        <span
          data-comment-toolbar-separator="trailing"
          aria-hidden="true"
          className="h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
        />
      )}

      {attachmentsEnabled && DISCUSSION_ATTACHMENTS_ENABLED && (
        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json"
          aria-label="Choose image, video, document, or code file"
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
