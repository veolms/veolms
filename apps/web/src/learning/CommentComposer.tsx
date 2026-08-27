import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { EyeSlashIcon as EyeSlash } from "@phosphor-icons/react/EyeSlash";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { NotepadIcon as Notepad } from "@phosphor-icons/react/Notepad";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemedSelect } from "../ThemedSelect";
import type { ThemedSelectOption } from "../ThemedSelect";
import { CommentFormattingToolbar } from "./CommentFormattingToolbar";
import {
  getClipboardMediaFile,
  insertCommentAttachment,
} from "./commentAttachments";
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
  canSubmit: boolean;
  editing?: boolean;
  onDraftChange: (value: RichTextDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: () => void;
  onClose: () => void;
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

export function CommentComposer({
  draft,
  entryKind,
  visibility,
  invalid,
  canSubmit,
  editing = false,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
  onClose,
  autoFocus = false,
  presentation = "inline",
}: CommentComposerProps) {
  const onDraftChangeRef = useRef(onDraftChange);
  const onSubmitRef = useRef(onSubmit);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const extensions = useMemo(
    () => createCommentEditorExtensions("Write something…"),
    [],
  );

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
    onSubmitRef.current = onSubmit;
  }, [onDraftChange, onSubmit]);

  const addAttachment = useCallback(async (file: File) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const result = await insertCommentAttachment(currentEditor, file);
    setAttachmentNotice(result.message);
  }, []);

  const editor = useEditor(
    {
      extensions,
      content: draft.content,
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          "aria-label": getEditorLabel(entryKind, editing),
          "aria-multiline": "true",
          "aria-invalid": invalid ? "true" : "false",
          autocapitalize: "sentences",
          class: "learning-comment-editor__document px-4!",
          role: "textbox",
          spellcheck: "true",
        },
        handlePaste: (_view, event) => {
          const file = getClipboardMediaFile(event.clipboardData);
          if (!file) return false;
          event.preventDefault();
          void addAttachment(file);
          return true;
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

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

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
          "aria-label": getEditorLabel(entryKind, editing),
          "aria-invalid": invalid ? "true" : "false",
        },
      },
    });
  }, [editing, editor, entryKind, invalid]);

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
      data-editor-mode={editing ? "edit" : "create"}
      data-editor-presentation={presentation}
      aria-invalid={invalid || undefined}
      className={`learning-comment-editor relative isolate overflow-hidden bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_1px_0_color-mix(in_srgb,var(--text)_6%,transparent)] transition-[background-color,box-shadow] duration-150 focus-within:shadow-[0_18px_46px_color-mix(in_srgb,var(--canvas)_42%,transparent),0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)] aria-[invalid=true]:shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_0_0_2px_color-mix(in_srgb,var(--danger)_42%,transparent)] ${presentation === "drawer" ? "flex min-h-0 flex-1 flex-col rounded-none" : "rounded-xl"}`}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmitRef.current();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (document.querySelector('[role="listbox"]')) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`relative ${presentation === "drawer" ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}`}
      >
        <EditorContent
          editor={editor}
          className={presentation === "drawer" ? "min-h-full" : undefined}
        />
        {attachmentNotice && (
          <div
            role="status"
            className="absolute top-15 right-3 left-3 z-10 rounded-lg bg-(--surface-elevated,var(--surface)) px-3 py-2 text-xs text-(--text-secondary) shadow-[0_12px_34px_rgba(0,0,0,0.3),0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)] sm:left-auto sm:max-w-72"
          >
            {attachmentNotice}
          </div>
        )}
      </div>

      <div
        data-comment-toolbar
        className="flex shrink-0 items-center gap-1.5 bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] px-2.5 py-2.5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_8%,transparent)] sm:gap-2 sm:px-3"
      >
        <img
          src="/assets/sofia-avatar-160.webp"
          alt=""
          className="size-9 shrink-0 rounded-full object-cover sm:size-10"
        />
        {editor && <CommentFormattingToolbar editor={editor} />}
        <div
          data-comment-toolbar-actions
          className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2"
        >
          <ThemedSelect
            value={entryKind}
            onValueChange={onEntryKindChange}
            options={entryKindOptions}
            ariaLabel="Post type"
            compactOnMobile
            triggerClassName="h-10 min-w-0 w-max! shrink px-2 text-[11px] max-sm:size-10! max-sm:justify-center max-sm:gap-0 max-sm:p-0 sm:px-2.5 sm:text-sm"
          />
          <ThemedSelect
            value={visibility}
            onValueChange={onVisibilityChange}
            options={visibilityOptions}
            ariaLabel="Visibility"
            compactOnMobile
            triggerClassName="h-10 min-w-0 w-max! shrink px-2 text-[11px] max-sm:size-10! max-sm:justify-center max-sm:gap-0 max-sm:p-0 sm:px-2.5 sm:text-sm"
          />
          <button
            type="button"
            aria-label={editing ? "Save changes" : "Post"}
            title={editing ? "Save changes" : "Post"}
            disabled={!canSubmit}
            onClick={onSubmit}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-[background-color,opacity] hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:size-11"
          >
            {editing ? (
              <Check size={24} weight="bold" aria-hidden="true" />
            ) : (
              <PaperPlaneTilt size={24} weight="fill" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const getEditorLabel = (entryKind: DiscussionEntryKind, editing: boolean) => {
  if (entryKind === "note") return editing ? "Edit note" : "Write a note";
  if (entryKind === "question") return editing ? "Edit Q&A" : "Write a Q&A";
  return editing ? "Edit comment" : "Write a comment";
};
