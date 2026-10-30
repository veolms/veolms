import { useEffect, useRef, useState } from "react";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import {
  revokeLocalAttachmentPreview,
  type LocalComposerAttachment,
} from "../services/learning-interactions/attachment-model";
import type { Comment } from "./CommentCard";
import { CommentFormattingToolbar } from "./CommentFormattingToolbar";
import { DiscussionAvatar } from "./DiscussionAvatar";
import { AttachmentComposerPreview } from "./discussion-attachments";
import type { DiscussionFormattingState } from "./discussion-editor/commands";
import {
  DiscussionEditor,
  type DiscussionEditorController,
} from "./discussion-editor/DiscussionEditor";
import {
  createEmptyDiscussionDraft,
  hasDiscussionDraftContent,
  type DiscussionDraft,
} from "./discussion-editor/types";

const REPLY_PLACEHOLDER_TEXT = "Write a reply…";

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

/** The box the lesson's thread panel draws the composer in. */
export const THREAD_REPLY_COMPOSER_CLASSES =
  "-mx-4 -mb-4 mt-0 grid shrink-0 grid-rows-[auto_auto] overflow-hidden rounded-t-xl bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] transition-colors duration-150 focus-within:bg-[color-mix(in_srgb,var(--surface)_90%,var(--canvas))] sm:mx-0 sm:mb-0 sm:rounded-xl";

/**
 * The reply box of a discussion thread: the Markdown editor with its
 * formatting toolbar, attachments and a send button. Used by the lesson's
 * thread panel and the Discussions page's panel.
 */
export function ThreadReplyComposer({
  entry,
  currentUser,
  focusRequest,
  editorReady,
  onRequestFocus,
  onFocusHandled,
  onSubmit,
  courseId,
  onGuestIntent,
  className = THREAD_REPLY_COMPOSER_CLASSES,
}: {
  /** The post replied to: what the composer is reset and labelled by. */
  entry: Pick<Comment, "id" | "clientId" | "name">;
  currentUser?: { name: string; avatar: string };
  focusRequest: number;
  editorReady: boolean;
  onRequestFocus: () => void;
  onFocusHandled: (entryId: string | number, requestId: number) => void;
  onSubmit: (
    draft: DiscussionDraft,
    attachments?: LocalComposerAttachment[],
    onCreateFailure?: () => void,
  ) => Promise<boolean> | boolean;
  courseId?: string;
  /** Set for a viewer who may not reply: the box is shown, and reaching
   * for it calls this (the login pop-up) instead of opening the editor. */
  onGuestIntent?: () => void;
  /** The box around editor and toolbar; the thread panel's by default. */
  className?: string;
}) {
  const [composerKey, setComposerKey] = useState(0);
  const [draft, setDraft] = useState<DiscussionDraft>(
    createEmptyDiscussionDraft,
  );
  const draftRef = useRef(draft);
  // The editor reads its text only when it mounts, so a reply put back after
  // a failed post is shown by giving the editor a fresh identity.
  const [draftRestoreToken, setDraftRestoreToken] = useState(0);
  const entryKey = entry.clientId ?? entry.id;
  const entryKeyRef = useRef(entryKey);
  const isMountedRef = useRef(false);
  const [replyAttachments, setReplyAttachments] = useState<
    LocalComposerAttachment[]
  >([]);
  const replyAttachmentsRef = useRef(replyAttachments);
  const [editorController, setEditorController] =
    useState<DiscussionEditorController | null>(null);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // The editor is the heaviest part of the panel. Its place is held by a
  // look-alike until the panel has stopped sliding in, or until the reader
  // goes to write, whichever comes first.
  const [editorMounted, setEditorMounted] = useState(
    editorReady && !onGuestIntent,
  );
  if (editorReady && !editorMounted && !onGuestIntent) setEditorMounted(true);
  const openEditor = () => {
    if (onGuestIntent) {
      onGuestIntent();
      return;
    }
    setEditorMounted(true);
    onRequestFocus();
  };

  useEffect(() => {
    replyAttachmentsRef.current = replyAttachments;
  }, [replyAttachments]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    entryKeyRef.current = entryKey;
  }, [entryKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(
    () => () => {
      replyAttachmentsRef.current.forEach(revokeLocalAttachmentPreview);
    },
    [],
  );

  useEffect(() => {
    setDraft(createEmptyDiscussionDraft());
    setReplyAttachments((current) => {
      current.forEach(revokeLocalAttachmentPreview);
      return [];
    });
    setComposerKey(0);
    setSubmitError("");
  }, [entryKey]);

  useEffect(() => {
    if (!editorController || focusRequest <= 0) return;
    editorController.focus();
    onFocusHandled(entry.id, focusRequest);
  }, [editorController, entry.id, focusRequest, onFocusHandled]);

  const isPendingSubmission = isSubmitting;
  const canSubmit = hasDiscussionDraftContent(draft) && !isPendingSubmission;

  const submit = async () => {
    if (!canSubmit || isPendingSubmission) return;
    setIsSubmitting(true);
    setSubmitError("");
    const submittedDraft = draft;
    const submittedAttachments = replyAttachments;
    const submittedEntryKey = entryKey;
    // A reply that failed to post used to leave only a toast: the composer
    // had already been emptied, so the text was gone. Put it back, but only
    // into this thread's composer and only while it is still empty, so it
    // never replaces newer input.
    const restoreSubmittedReply = () => {
      if (
        !isMountedRef.current ||
        entryKeyRef.current !== submittedEntryKey ||
        hasDiscussionDraftContent(draftRef.current) ||
        replyAttachmentsRef.current.length > 0
      ) {
        return;
      }

      // The failed creation already released these previews, so a restored
      // image or video needs a new one.
      const restoredAttachments = submittedAttachments.map((attachment) =>
        attachment.localPreviewUrl
          ? {
              ...attachment,
              localPreviewUrl: URL.createObjectURL(attachment.file),
            }
          : attachment,
      );
      draftRef.current = submittedDraft;
      replyAttachmentsRef.current = restoredAttachments;
      setDraft(submittedDraft);
      setReplyAttachments(restoredAttachments);
      setDraftRestoreToken((current) => current + 1);
    };
    try {
      const success = await onSubmit(
        draft,
        replyAttachments,
        restoreSubmittedReply,
      );
      if (success) {
        setDraft(createEmptyDiscussionDraft());
        setReplyAttachments([]);
        setComposerKey((k) => k + 1);
        setSubmitError("");
      } else {
        setSubmitError("Couldn't post your reply. Please try again.");
      }
    } catch {
      setSubmitError("Couldn't post your reply. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleControllerChange = (
    controller: DiscussionEditorController | null,
  ) => {
    setEditorController(controller);
  };

  const composerAvatar = currentUser?.avatar || "";

  // Sized and set like the empty editor (its measures and its font variable
  // are in `atomic-editor.css`), so nothing moves or changes face when the
  // editor takes its place. It is a text box
  // to assistive technology too, and turns into the editor as soon as it is
  // clicked or tabbed into.
  const editorPlaceholder = (
    <div
      role="textbox"
      tabIndex={0}
      data-thread-reply-editor-placeholder
      aria-multiline="true"
      aria-label={`Reply to ${entry.name}`}
      aria-placeholder={REPLY_PLACEHOLDER_TEXT}
      onClick={openEditor}
      onFocus={onGuestIntent ? undefined : openEditor}
      className="min-h-11 w-full cursor-text px-4 py-2.5 font-(family-name:--app-font-family) text-[0.9375rem] leading-[1.6] text-(--muted) outline-none"
    >
      {REPLY_PLACEHOLDER_TEXT}
    </div>
  );

  return (
    <div data-thread-reply-composer className={className}>
      {editorMounted ? (
        <DiscussionEditor
          documentId={
            draftRestoreToken === 0
              ? `thread-reply-${entry.id}`
              : `thread-reply-${entry.id}-restored-${draftRestoreToken}`
          }
          resetToken={composerKey}
          value={draft}
          label={`Reply to ${entry.name}`}
          placeholderText={REPLY_PLACEHOLDER_TEXT}
          autoGrow
          courseId={courseId}
          mentionsEnabled={true}
          fallback={editorPlaceholder}
          onChange={setDraft}
          onControllerChange={handleControllerChange}
          onFormattingStateChange={setFormattingState}
          onAttachmentError={(message) => setSubmitError(message ?? "")}
          onAttachmentSelected={(attachment) => {
            setReplyAttachments((prev) => [...prev, attachment]);
          }}
        />
      ) : (
        editorPlaceholder
      )}
      <AttachmentComposerPreview
        attachments={replyAttachments}
        onRemove={(id) => {
          setReplyAttachments((prev) => {
            const attachment = prev.find((item) => item.id === id);
            if (attachment) revokeLocalAttachmentPreview(attachment);
            return prev.filter((item) => item.id !== id);
          });
        }}
      />
      {submitError && (
        <p role="alert" className="px-3 pt-1 text-xs text-red-500">
          {submitError}
        </p>
      )}
      <div className="flex min-h-14 min-w-0 items-center gap-1.5 overflow-hidden bg-[color-mix(in_srgb,var(--surface)_66%,transparent)] px-2.5 py-2 sm:gap-2 sm:px-3">
        <DiscussionAvatar
          src={composerAvatar}
          viewer
          className="size-9 sm:size-10"
        />
        <CommentFormattingToolbar
          editor={editorController}
          formattingState={formattingState}
          onEditorNeeded={openEditor}
        />
        <button
          type="button"
          aria-label="Post reply"
          disabled={!onGuestIntent && (!canSubmit || isPendingSubmission)}
          onClick={onGuestIntent ?? submit}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-[background-color,opacity] hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:size-11"
        >
          <PaperPlaneTilt size={23} weight="fill" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
