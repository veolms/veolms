import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { useEffect, useRef, useState } from "react";
import { CommentFormattingToolbar } from "./CommentFormattingToolbar";
import { CommentPublishingOptions } from "./CommentPublishingOptions";
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
import {
  AttachmentComposerPreview,
  type DiscussionAttachmentItem,
} from "./discussion-attachments";
import type { StoredDiscussionAttachment } from "./discussion-editor/image-storage";

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
  attachments?: DiscussionAttachmentItem[];
  onAttachmentsChange?: (attachments: DiscussionAttachmentItem[]) => void;
  onDraftChange: (value: DiscussionDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: (onLocallyAccepted?: () => void) => Promise<boolean> | void;
  onClose: () => void;
  courseId?: string;
  autoFocus?: boolean;
  presentation?: "inline" | "drawer";
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
}: CommentComposerProps) {
  const reviewHeadingRef = useRef<HTMLDivElement>(null);
  const [editorController, setEditorController] =
    useState<DiscussionEditorController | null>(null);
  const [editorResetToken, setEditorResetToken] = useState(0);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [composerStep, setComposerStep] = useState<"compose" | "publish">(
    "compose",
  );
  const [transitionDirection, setTransitionDirection] = useState<
    "forward" | "back"
  >("forward");
  const [internalAttachments, setInternalAttachments] = useState<
    DiscussionAttachmentItem[]
  >([]);
  const effectiveAttachments = attachmentsProp ?? internalAttachments;
  const setEffectiveAttachments = (
    next:
      | DiscussionAttachmentItem[]
      | ((prev: DiscussionAttachmentItem[]) => DiscussionAttachmentItem[]),
  ) => {
    if (onAttachmentsChangeProp) {
      const resolved =
        typeof next === "function" ? next(effectiveAttachments) : next;
      onAttachmentsChangeProp(resolved);
    } else {
      setInternalAttachments(next);
    }
  };

  const handleAttachmentUploaded = (stored: StoredDiscussionAttachment) => {
    const item: DiscussionAttachmentItem = {
      id: stored.id || crypto.randomUUID(),
      fileName: stored.fileName,
      fileUrl: stored.url,
      mimeType: stored.mimeType,
      fileSize: stored.size,
      kind: stored.kind,
      mediaType: stored.mediaType,
    };
    setEffectiveAttachments((prev) => [...prev, item]);
  };

  const handleRemoveAttachment = (id: string) => {
    setEffectiveAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  useEffect(() => {
    if (composerStep !== "publish") return;
    reviewHeadingRef.current?.focus({ preventScroll: true });
  }, [composerStep]);

  const openPublishingOptions = () => {
    if (!canSubmit) return;
    setTransitionDirection("forward");
    setComposerStep("publish");
  };

  const returnToEditor = () => {
    setTransitionDirection("back");
    setComposerStep("compose");
    window.setTimeout(() => editorController?.focus(), 0);
  };

  const resetAfterLocalSubmit = () => {
    // This callback is invoked only when the local optimistic create is
    // accepted; mutation settlement must never alter a newer draft.
    setEditorResetToken((current) => current + 1);
    setComposerStep("compose");
    setTransitionDirection("back");
    setFormattingState(EMPTY_FORMATTING_STATE);
    setAttachmentNotice(null);
    setInternalAttachments([]);
    onAttachmentsChangeProp?.([]);
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
        if (document.querySelector('[role="listbox"]')) return;
        event.preventDefault();
        event.stopPropagation();
        if (composerStep === "publish") returnToEditor();
        else onClose();
      }}
    >
      {composerStep === "compose" ? (
        <div
          key="compose"
          className={`flex min-h-0 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:duration-250 ${transitionDirection === "back" ? "motion-safe:slide-in-from-left-4" : "motion-safe:slide-in-from-right-4"} ${presentation === "drawer" ? "flex-1" : ""}`}
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
              onAttachmentNotice={setAttachmentNotice}
              onAttachmentUploaded={handleAttachmentUploaded}
            />
            {attachmentNotice && (
              <div
                role="status"
                className="absolute top-15 right-3 left-3 z-10 rounded-lg bg-(--surface-elevated,var(--surface)) px-3 py-2 text-xs text-(--text-secondary) shadow-[0_12px_34px_rgba(0,0,0,0.3),0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)] sm:left-auto sm:max-w-72"
              >
                {attachmentNotice}
              </div>
            )}
            <AttachmentComposerPreview
              attachments={effectiveAttachments}
              onRemove={handleRemoveAttachment}
            />
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
            {editorController && (
              <CommentFormattingToolbar
                editor={editorController}
                formattingState={formattingState}
              />
            )}
            <button
              type="button"
              aria-label="Next: choose publishing options"
              title="Next"
              disabled={!canSubmit || isSubmitting}
              onClick={openPublishingOptions}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-[background-color,opacity] hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:size-11"
            >
              <ArrowRight size={24} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div
          key="publish"
          className={`flex min-h-0 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-250 ${presentation === "drawer" ? "flex-1 overflow-y-auto overscroll-contain" : ""}`}
        >
          <div
            ref={reviewHeadingRef}
            tabIndex={-1}
            className="flex min-h-0 flex-1 outline-none"
          >
            <CommentPublishingOptions
              entryKind={entryKind}
              visibility={visibility}
              capabilities={capabilities}
              onEntryKindChange={onEntryKindChange}
              onVisibilityChange={onVisibilityChange}
            />
          </div>
          <div
            data-comment-publish-actions
            className="flex shrink-0 items-center justify-end gap-2 px-4 py-3 sm:px-5 sm:py-3.5"
          >
            <button
              type="button"
              onClick={returnToEditor}
              disabled={isSubmitting}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              <ArrowLeft size={18} weight="bold" aria-hidden="true" />
              Back
            </button>
            <button
              type="button"
              aria-label={
                isSubmitting
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : `Post ${getEntryKindLabel(entryKind)}`
              }
              disabled={!canSubmit || isSubmitting}
              onClick={() => onSubmit(resetAfterLocalSubmit)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--accent) px-4 text-sm font-semibold text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_55%,transparent)] transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              {editing ? (
                <Check size={19} weight="bold" aria-hidden="true" />
              ) : (
                <PaperPlaneTilt size={19} weight="fill" aria-hidden="true" />
              )}
              {isSubmitting ? "Saving…" : editing ? "Save changes" : "Post"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const getEditorLabel = (entryKind: DiscussionEntryKind, editing: boolean) => {
  if (entryKind === "note") return editing ? "Edit note" : "Write a note";
  if (entryKind === "question") return editing ? "Edit Q&A" : "Write a Q&A";
  return editing ? "Edit comment" : "Write a comment";
};

const getEntryKindLabel = (entryKind: DiscussionEntryKind) => {
  if (entryKind === "question") return "Q&A";
  if (entryKind === "note") return "note";
  return "comment";
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
