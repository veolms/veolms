import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { PaperclipIcon as Paperclip } from "@phosphor-icons/react/Paperclip";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useRef, useState, type ReactNode } from "react";

import { CommentFormattingToolbar } from "../learning/CommentFormattingToolbar";
import type { DiscussionFormattingState } from "../learning/discussion-editor/commands";
import {
  DiscussionEditor,
  type DiscussionEditorController,
} from "../learning/discussion-editor/DiscussionEditor";
import { formatFileSize } from "../learning/discussion-attachments/types";
import type {
  SupportDraftAttachment,
  SupportDraftState,
} from "./useSupportDraft";

/** The files the comment editor takes (see its toolbar). */
const ATTACH_ACCEPT =
  "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json";

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

/**
 * The comment editor from discussions, with its formatting toolbar and
 * files: images, videos and documents, added from the toolbar, pasted or
 * dropped, each uploaded as it is added.
 */
export function SupportComposer({
  state,
  documentId,
  label,
  placeholder,
  invalid = false,
  autoFocus = false,
  minHeightClassName = "min-h-36",
  actions,
  className = "",
}: {
  state: SupportDraftState;
  documentId: string;
  label: string;
  placeholder: string;
  invalid?: boolean;
  autoFocus?: boolean;
  minHeightClassName?: string;
  /** Buttons at the end of the toolbar row (Send…). */
  actions?: ReactNode;
  className?: string;
}) {
  const [editor, setEditor] = useState<DiscussionEditorController | null>(null);
  const [formatting, setFormatting] = useState(EMPTY_FORMATTING_STATE);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const notice = attachmentError ?? state.notice;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      data-invalid={invalid || undefined}
      className={`overflow-hidden rounded-2xl bg-(--surface-strong) ring-1 ring-[color-mix(in_srgb,var(--text)_10%,transparent)] transition-shadow ring-inset focus-within:ring-2 focus-within:ring-(--accent) data-invalid:ring-2 data-invalid:ring-rose-500/70 ${className}`}
    >
      <div className="px-1 pt-1">
        <DiscussionEditor
          documentId={documentId}
          resetToken={state.resetToken}
          value={state.draft}
          label={label}
          placeholderText={placeholder}
          invalid={invalid}
          autoFocus={autoFocus}
          autoGrow
          maxHeight="26rem"
          className={minHeightClassName}
          onChange={state.setDraft}
          onControllerChange={setEditor}
          onFormattingStateChange={setFormatting}
          onAttachmentError={setAttachmentError}
          onAttachmentSelected={(attachment) => {
            setAttachmentError(null);
            state.addAttachment(attachment);
          }}
        />
      </div>
      <AttachmentTray
        attachments={state.attachments}
        onRemove={state.removeAttachment}
        onRetry={state.retryAttachment}
      />
      {notice ? (
        <p
          role="alert"
          className="mx-3 mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-500"
        >
          {notice}
        </p>
      ) : null}
      {/* Formatting, files and the send button, all in the box. */}
      <div className="flex min-h-14 items-center gap-1 border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-2">
        {editor ? (
          <CommentFormattingToolbar
            editor={editor}
            formattingState={formatting}
            leadingDivider={false}
            toolsAlwaysOpen
            // The paperclip beside it takes several files at once.
            attachmentsEnabled={false}
          />
        ) : (
          <span aria-hidden="true" className="min-w-0 flex-1" />
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!editor}
          aria-label="Attach files"
          title="Attach files: images, videos or documents, up to 10 files of 50 MB. You can also paste or drop them in."
          className="grid size-9 shrink-0 place-items-center rounded-lg text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          <Paperclip size={19} weight="bold" aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACH_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={async (event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            for (const file of files) await editor?.attach(file);
          }}
        />
        {actions ? (
          <>
            <span
              aria-hidden="true"
              className="mx-1 h-6 w-px shrink-0 bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
            />
            {actions}
          </>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentTray({
  attachments,
  onRemove,
  onRetry,
}: {
  attachments: readonly SupportDraftAttachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul
      className="flex flex-wrap gap-2.5 px-3.5 pt-1 pb-3.5"
      aria-label="Files"
    >
      {attachments.map((item) => (
        <li key={item.id} className="relative w-28">
          <div
            className={`relative h-20 overflow-hidden rounded-xl bg-(--surface) ring-1 ring-inset ${
              item.state === "failed"
                ? "ring-rose-500/60"
                : "ring-[color-mix(in_srgb,var(--text)_10%,transparent)]"
            }`}
          >
            <AttachmentPreview item={item} />
            {item.state === "uploading" ? (
              <span className="absolute inset-0 grid place-items-center bg-black/45 text-[0.7rem] font-semibold text-white tabular-nums">
                {Math.round(item.progress * 100)}%
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25"
                >
                  <span
                    className="block h-full rounded-full bg-white transition-[width] duration-200"
                    style={{ width: `${Math.max(4, item.progress * 100)}%` }}
                  />
                </span>
              </span>
            ) : null}
            {item.state === "failed" ? (
              <button
                type="button"
                onClick={() => onRetry(item.id)}
                title={item.error ?? "Upload failed"}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-rose-950/70 text-[0.7rem] font-semibold text-white"
              >
                <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
                Try again
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.fileName}`}
            title="Remove"
            className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-(--text) text-(--canvas) shadow-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
          >
            <X size={12} weight="bold" />
          </button>
          <p
            className="mt-1.5 mb-0 truncate text-[0.7rem] font-medium text-(--text-secondary)"
            title={item.fileName}
          >
            {item.state === "failed"
              ? (item.error ?? "Upload failed")
              : item.fileName}
          </p>
          <p className="m-0 text-[0.65rem] text-(--muted)">
            {formatFileSize(item.fileSize)}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** A picture of the file: the image itself, a video's first frame, or the
 * file's kind and extension. */
function AttachmentPreview({ item }: { item: SupportDraftAttachment }) {
  if (item.state === "failed") {
    return (
      <span className="grid size-full place-items-center text-rose-400">
        <WarningCircle size={24} weight="duotone" />
      </span>
    );
  }
  if (item.mediaType === "image" && item.localPreviewUrl) {
    return (
      <img
        src={item.localPreviewUrl}
        alt=""
        className="size-full object-cover"
      />
    );
  }
  if (item.mediaType === "video" && item.localPreviewUrl) {
    return (
      <>
        <video
          src={item.localPreviewUrl}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
        <span className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded-md bg-black/55 text-white">
          <VideoCamera size={12} weight="fill" aria-hidden="true" />
        </span>
      </>
    );
  }
  const extension = item.fileName.includes(".")
    ? (item.fileName.split(".").pop() ?? "").slice(0, 5).toUpperCase()
    : "FILE";
  return (
    <span className="flex size-full flex-col items-center justify-center gap-1 text-(--accent)">
      <FileText size={24} weight="duotone" aria-hidden="true" />
      <span className="text-[0.62rem] font-bold tracking-wide text-(--muted)">
        {extension}
      </span>
    </span>
  );
}
