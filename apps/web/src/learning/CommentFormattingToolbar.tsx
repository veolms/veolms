import type { Editor } from "@tiptap/core";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CodeBlockIcon as CodeBlock } from "@phosphor-icons/react/CodeBlock";
import { CodeIcon as Code } from "@phosphor-icons/react/Code";
import { HighlighterIcon as Highlighter } from "@phosphor-icons/react/Highlighter";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { TextBIcon as TextB } from "@phosphor-icons/react/TextB";
import { TextItalicIcon as TextItalic } from "@phosphor-icons/react/TextItalic";
import { useEditorState } from "@tiptap/react";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { insertCommentAttachment } from "./commentAttachments";

interface CommentFormattingToolbarProps {
  editor: Editor;
}

export function CommentFormattingToolbar({
  editor,
}: CommentFormattingToolbarProps) {
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const formattingState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor.isActive("bold"),
      italic: currentEditor.isActive("italic"),
      highlight: currentEditor.isActive("highlight"),
      link: currentEditor.isActive("link"),
      code: currentEditor.isActive("code"),
      codeBlock: currentEditor.isActive("codeBlock"),
      canUndo: currentEditor.can().undo(),
      canRedo: currentEditor.can().redo(),
    }),
  });

  const openLinkEditor = () => {
    setNotice(null);
    setLinkUrl(
      editor.isActive("link")
        ? String(editor.getAttributes("link").href ?? "")
        : "",
    );
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = normalizeLink(linkUrl);
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!file) return;
    const result = await insertCommentAttachment(editor, file);
    setNotice(result.message);
  };

  return (
    <div data-comment-formatting-toolbar className="relative min-w-0 flex-1">
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
            editor.commands.focus();
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

      {notice && (
        <div
          role="status"
          className="absolute bottom-[calc(100%+0.75rem)] left-0 z-20 max-w-64 rounded-lg bg-(--surface-elevated,var(--surface)) px-3 py-2 text-xs text-(--text-secondary) shadow-[0_12px_34px_rgba(0,0,0,0.3),0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)]"
        >
          {notice}
        </div>
      )}

      <div
        role="toolbar"
        aria-label="Comment formatting"
        className="flex max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ToolbarButton
          label="Undo"
          disabled={!formattingState.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <ArrowCounterClockwise size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!formattingState.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <ArrowClockwise size={17} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Highlight"
          active={formattingState.highlight}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
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
        <ToolbarButton
          label="Attach image or video"
          onClick={() => attachmentInputRef.current?.click()}
        >
          <Paperclip size={17} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Bold"
          active={formattingState.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <TextB size={17} weight="bold" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={formattingState.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <TextItalic size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={formattingState.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={17} />
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={formattingState.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <CodeBlock size={17} />
        </ToolbarButton>
      </div>

      <input
        ref={attachmentInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        aria-label="Choose image or video"
        className="sr-only"
        onChange={handleAttachment}
      />
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
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
      className={`grid size-8 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-35 ${active ? "bg-(--accent-soft) text-(--accent-ink,var(--accent))" : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 h-5 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
    />
  );
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
