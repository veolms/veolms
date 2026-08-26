import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { CodeBlockIcon as CodeBlock } from "@phosphor-icons/react/CodeBlock";
import { CodeIcon as Code } from "@phosphor-icons/react/Code";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/Notepad";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { TextBIcon as TextB } from "@phosphor-icons/react/TextB";
import { TextItalicIcon as TextItalic } from "@phosphor-icons/react/TextItalic";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import React, { useEffect, useMemo, useRef } from "react";
import { ThemedSelect } from "../ThemedSelect";
import type { ThemedSelectOption } from "../ThemedSelect";
import { CommentBlockControls } from "./CommentBlockControls";
import {
  createCommentEditorExtensions,
  type DiscussionEntryKind,
  type DiscussionVisibility,
  type RichTextDraft,
} from "./commentEditor";

interface CommentComposerProps {
  draft: RichTextDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  invalid: boolean;
  onDraftChange: (value: RichTextDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
  presentation?: "inline" | "drawer";
}

const entryKindOptions = [
  [
    "comment",
    "Comment",
    { flag: <ChatCenteredDots size={17} aria-hidden="true" /> },
  ],
  ["question", "Q&A", { flag: <Question size={17} aria-hidden="true" /> }],
  ["note", "Note", { flag: <Notepad size={17} aria-hidden="true" /> }],
] as const satisfies readonly ThemedSelectOption<DiscussionEntryKind>[];

const visibilityOptions = [
  ["public", "Public", { flag: <Globe size={17} aria-hidden="true" /> }],
  ["private", "Private", { flag: <Lock size={17} aria-hidden="true" /> }],
  ["unlisted", "Unlisted", { flag: <EyeSlash size={17} aria-hidden="true" /> }],
] as const satisfies readonly ThemedSelectOption<DiscussionVisibility>[];

const defaultFormattingState = {
  bold: false,
  italic: false,
  code: false,
  codeBlock: false,
};

export function CommentComposer({
  draft,
  entryKind,
  visibility,
  invalid,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
  autoFocus = false,
  presentation = "inline",
}: CommentComposerProps) {
  const onDraftChangeRef = useRef(onDraftChange);
  const onSubmitRef = useRef(onSubmit);
  const extensions = useMemo(
    () => createCommentEditorExtensions("Write, type '/' for commands…"),
    [],
  );

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onSubmitRef.current = onSubmit;
  }, [onDraftChange, onSubmit]);

  const editor = useEditor(
    {
      extensions,
      content: draft.content,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          "aria-label": getEditorLabel(entryKind),
          "aria-multiline": "true",
          "aria-invalid": invalid ? "true" : "false",
          autocapitalize: "sentences",
          class: "learning-comment-editor__document",
          role: "textbox",
          spellcheck: "true",
        },
      },
      onUpdate: ({ editor: updatedEditor }) => {
        onDraftChangeRef.current({
          content: updatedEditor.getJSON(),
          text: updatedEditor.getText({ blockSeparator: "\n" }),
        });
      },
    },
    [extensions],
  );

  const formattingState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      currentEditor
        ? {
            bold: currentEditor.isActive("bold"),
            italic: currentEditor.isActive("italic"),
            code: currentEditor.isActive("code"),
            codeBlock: currentEditor.isActive("codeBlock"),
          }
        : defaultFormattingState,
  });

  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(draft.content))
      return;
    editor.commands.setContent(draft.content, { emitUpdate: false });
  }, [draft.content, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...editor.options.editorProps.attributes,
          "aria-label": getEditorLabel(entryKind),
          "aria-invalid": invalid ? "true" : "false",
        },
      },
    });
  }, [editor, entryKind, invalid]);

  useEffect(() => {
    if (!editor || !autoFocus) return undefined;
    const focusTimer = window.setTimeout(
      () => editor.commands.focus("end", { scrollIntoView: false }),
      0,
    );
    return () => window.clearTimeout(focusTimer);
  }, [autoFocus, editor]);

  return (
    <div
      data-comment-composer-surface
      data-editor-kind={entryKind}
      data-editor-presentation={presentation}
      aria-invalid={invalid || undefined}
      className={`learning-comment-editor relative isolate overflow-hidden bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_1px_0_color-mix(in_srgb,var(--text)_6%,transparent)] transition-[background-color,box-shadow] duration-150 focus-within:shadow-[0_18px_46px_color-mix(in_srgb,var(--canvas)_42%,transparent),0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)] aria-[invalid=true]:shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_0_0_2px_color-mix(in_srgb,var(--danger)_42%,transparent)] ${presentation === "drawer" ? "flex min-h-0 flex-1 flex-col rounded-none" : "rounded-xl"}`}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          onSubmitRef.current();
        }
      }}
    >
      <div
        className={`relative ${presentation === "drawer" ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}`}
      >
        <EditorContent
          editor={editor}
          className={presentation === "drawer" ? "min-h-full" : undefined}
        />
        {editor && <CommentBlockControls editor={editor} />}
        {editor && (
          <BubbleMenu
            editor={editor}
            className="learning-comment-editor__bubble-menu"
          >
            <FormattingButton
              label="Bold"
              active={formattingState?.bold ?? false}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <TextB size={17} weight="bold" />
            </FormattingButton>
            <FormattingButton
              label="Italic"
              active={formattingState?.italic ?? false}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <TextItalic size={17} />
            </FormattingButton>
            <FormattingButton
              label="Inline code"
              active={formattingState?.code ?? false}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <Code size={17} />
            </FormattingButton>
            <FormattingButton
              label="Code block"
              active={formattingState?.codeBlock ?? false}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <CodeBlock size={17} />
            </FormattingButton>
          </BubbleMenu>
        )}
      </div>

      <div
        data-comment-toolbar
        className="grid shrink-0 grid-cols-[auto_minmax(0,1.15fr)_minmax(0,0.85fr)_auto] items-center gap-2 bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] px-2.5 py-2.5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_8%,transparent)] sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-3"
      >
        <img
          src="/assets/sofia-avatar-160.webp"
          alt=""
          className="size-9 shrink-0 rounded-full object-cover sm:size-10"
        />
        <ThemedSelect
          value={entryKind}
          onValueChange={onEntryKindChange}
          options={entryKindOptions}
          ariaLabel="Post type"
          triggerClassName="h-10 min-w-0 w-full px-2 text-[11px] sm:px-2.5 sm:text-sm"
        />
        <ThemedSelect
          value={visibility}
          onValueChange={onVisibilityChange}
          options={visibilityOptions}
          ariaLabel="Visibility"
          triggerClassName="h-10 min-w-0 w-full px-2 text-[11px] sm:px-2.5 sm:text-sm"
        />
        <button
          type="button"
          aria-label="Post"
          disabled={invalid}
          onClick={onSubmit}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-[background-color,transform,opacity] hover:-translate-y-0.5 hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:size-11"
        >
          <PaperPlaneTilt size={19} weight="fill" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

const getEditorLabel = (entryKind: DiscussionEntryKind) => {
  if (entryKind === "note") return "Write a note";
  if (entryKind === "question") return "Write a Q&A";
  return "Write a comment";
};

interface FormattingButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function FormattingButton({
  label,
  active,
  onClick,
  children,
}: FormattingButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={`grid size-8 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${active ? "bg-(--accent-soft) text-(--accent-ink,var(--accent))" : "text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)"}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
