import { KeyReturnIcon as KeyReturn } from "@phosphor-icons/react/KeyReturn";
import { useEffect, useRef, useState } from "react";
import { CommentFormattingToolbar } from "./CommentFormattingToolbar";
import { CommentPostButton } from "./CommentPostButton";
import { DiscussionAvatar } from "./DiscussionAvatar";
import {
  type DiscussionEntryKind,
  type DiscussionVisibility,
  type DiscussionDraft,
} from "./discussion-editor/types";
import {
  DiscussionEditor,
  type DiscussionEditorController,
} from "./discussion-editor/DiscussionEditor";
import type { DiscussionFormattingState } from "./discussion-editor/commands";
import type { InteractionCapabilities } from "./discussionFeed";
import { AttachmentComposerPreview } from "./discussion-attachments";
import {
  revokeLocalAttachmentPreview,
  type LocalComposerAttachment,
} from "../services/learning-interactions/attachment-model";

interface CommentComposerProps {
  draft: DiscussionDraft;
  documentId: string;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  invalid: boolean;
  canSubmit: boolean;
  capabilities?: InteractionCapabilities;
  editing?: boolean;
  isSubmitting?: boolean;
  attachments?: LocalComposerAttachment[];
  onAttachmentsChange?: (attachments: LocalComposerAttachment[]) => void;
  onDraftChange: (value: DiscussionDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: (onLocallyAccepted?: () => void) => Promise<boolean> | void;
  onClose: () => void;
  courseId?: string;
  autoFocus?: boolean;
  presentation?: "inline" | "drawer";
  avatar?: string | null;
}

export function CommentComposer({
  draft,
  documentId,
  entryKind,
  visibility,
  invalid,
  canSubmit,
  capabilities,
  editing = false,
  isSubmitting = false,
  attachments: attachmentsProp,
  onAttachmentsChange: onAttachmentsChangeProp,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
  onClose,
  courseId,
  autoFocus = false,
  presentation = "inline",
  avatar,
}: CommentComposerProps) {
  const [editorController, setEditorController] =
    useState<DiscussionEditorController | null>(null);
  const [editorResetToken, setEditorResetToken] = useState(0);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [internalAttachments, setInternalAttachments] = useState<
    LocalComposerAttachment[]
  >([]);
  const internalAttachmentsRef = useRef(internalAttachments);
  useEffect(() => {
    internalAttachmentsRef.current = internalAttachments;
  }, [internalAttachments]);
  useEffect(
    () => () => {
      internalAttachmentsRef.current.forEach(revokeLocalAttachmentPreview);
    },
    [],
  );
  const effectiveAttachments = attachmentsProp ?? internalAttachments;
  const setEffectiveAttachments = (
    next:
      | LocalComposerAttachment[]
      | ((prev: LocalComposerAttachment[]) => LocalComposerAttachment[]),
  ) => {
    if (onAttachmentsChangeProp) {
      const resolved =
        typeof next === "function" ? next(effectiveAttachments) : next;
      onAttachmentsChangeProp(resolved);
    } else {
      setInternalAttachments(next);
    }
  };

  const handleAttachmentSelected = (attachment: LocalComposerAttachment) => {
    setEffectiveAttachments((prev) => [...prev, attachment]);
  };

  const handleRemoveAttachment = (id: string) => {
    const attachment = effectiveAttachments.find((item) => item.id === id);
    if (attachment) revokeLocalAttachmentPreview(attachment);
    setEffectiveAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const [menuOpen, setMenuOpen] = useState(false);

  const resetAfterLocalSubmit = () => {
    // This callback is invoked only when the local optimistic create is
    // accepted; mutation settlement must never alter a newer draft.
    setEditorResetToken((current) => current + 1);
    setFormattingState(EMPTY_FORMATTING_STATE);
    setAttachmentError(null);
    setInternalAttachments([]);
    onAttachmentsChangeProp?.([]);
  };

  // The button and Enter post the same way; with nothing written, neither
  // does anything.
  const post = () => {
    if (!canSubmit || isSubmitting) return;
    setMenuOpen(false);
    void onSubmit(resetAfterLocalSubmit);
  };

  return (
    <div
      data-comment-composer-surface
      data-editor-kind={entryKind}
      data-editor-mode={editing ? "edit" : "create"}
      data-editor-presentation={presentation}
      aria-invalid={invalid || undefined}
      className={`learning-comment-editor relative isolate overflow-hidden bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_1px_0_color-mix(in_srgb,var(--text)_6%,transparent)] transition-[background-color,box-shadow] duration-150 focus-within:shadow-[0_18px_46px_color-mix(in_srgb,var(--canvas)_42%,transparent),0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)] aria-[invalid=true]:shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_0_0_2px_color-mix(in_srgb,var(--danger)_42%,transparent)] ${presentation === "drawer" ? "flex min-h-0 flex-1 flex-col rounded-none" : "rounded-xl"}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Esc in the options menu closes the menu (it is drawn elsewhere in
        // the page, but its keys still pass through here).
        if (menuOpen || !event.currentTarget.contains(event.target as Node))
          return;
        if (document.querySelector('[role="listbox"]')) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className={`flex min-h-0 flex-col ${presentation === "drawer" ? "flex-1" : ""}`}
      >
        <div
          className={`relative ${presentation === "drawer" ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : ""}`}
        >
          <DiscussionEditor
            documentId={documentId}
            resetToken={editorResetToken}
            value={draft}
            label={getEditorLabel(entryKind, editing)}
            placeholderText={
              capabilities && !capabilities.allowComments
                ? capabilities.allowQa && !capabilities.allowNotes
                  ? "Ask a question…"
                  : !capabilities.allowQa && capabilities.allowNotes
                    ? "Write a note…"
                    : "Write something…"
                : "Write something…"
            }
            invalid={invalid}
            autoFocus={autoFocus}
            className={presentation === "drawer" ? "min-h-full" : "min-h-34"}
            courseId={courseId}
            mentionsEnabled={entryKind !== "note"}
            onChange={onDraftChange}
            onControllerChange={setEditorController}
            onFormattingStateChange={setFormattingState}
            onAttachmentError={setAttachmentError}
            onAttachmentSelected={handleAttachmentSelected}
            onSubmitShortcut={post}
          />
          {presentation !== "drawer" && (
            <AttachmentComposerPreview
              attachments={effectiveAttachments}
              onRemove={handleRemoveAttachment}
            />
          )}
          {attachmentError && (
            <p role="alert" className="px-3 pb-2 text-xs text-red-500">
              {attachmentError}
            </p>
          )}
        </div>

        {presentation === "drawer" && (
          <AttachmentComposerPreview
            attachments={effectiveAttachments}
            onRemove={handleRemoveAttachment}
            className="min-w-0 shrink-0"
          />
        )}

        <div
          data-comment-toolbar
          className="flex shrink-0 items-center gap-1.5 bg-[color-mix(in_srgb,var(--surface)_84%,transparent)] px-2.5 py-2.5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--text)_8%,transparent)] sm:gap-2 sm:px-3"
        >
          <DiscussionAvatar src={avatar} viewer className="size-9 sm:size-10" />
          {editorController ? (
            <CommentFormattingToolbar
              editor={editorController}
              formattingState={formattingState}
            />
          ) : (
            // The formatting buttons need the editor, which loads a moment
            // after the composer opens. Their place is kept meanwhile, so
            // the Post button stands at the far end from the first frame
            // instead of beside the avatar.
            <>
              <span
                aria-hidden="true"
                className="h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              />
              <span aria-hidden="true" className="min-w-0 flex-1" />
            </>
          )}
          {/* Where there is a keyboard, and once there is something to post. */}
          {canSubmit ? (
            <span className="hidden shrink-0 items-center gap-1 text-xs whitespace-nowrap text-(--muted) xl:inline-flex pointer-coarse:hidden!">
              <KeyReturn size={14} aria-hidden="true" />
              Enter to post · Shift + Enter for a new line
            </span>
          ) : null}
          <CommentPostButton
            entryKind={entryKind}
            visibility={visibility}
            capabilities={capabilities}
            editing={editing}
            disabled={!canSubmit}
            submitting={isSubmitting}
            menuOpen={menuOpen}
            onMenuOpenChange={setMenuOpen}
            onEntryKindChange={onEntryKindChange}
            onVisibilityChange={onVisibilityChange}
            onPost={post}
          />
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

const EMPTY_FORMATTING_STATE: DiscussionFormattingState = {
  bold: false,
  italic: false,
  highlight: false,
  link: false,
  code: false,
  codeBlock: false,
  canUndo: false,
  canRedo: false,
  linkUrl: "",
};
