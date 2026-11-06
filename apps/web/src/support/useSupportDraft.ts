import { useCallback, useEffect, useRef, useState } from "react";
import {
  SUPPORT_ATTACHMENTS_PER_MESSAGE,
  type SupportAttachment,
} from "@veolms/contracts/support";

import {
  createEmptyDiscussionDraft,
  hasDiscussionDraftContent,
  type DiscussionDraft,
} from "../learning/discussion-editor/types";
import {
  revokeLocalAttachmentPreview,
  type LocalComposerAttachment,
} from "../services/learning-interactions";
import { supportService } from "../services/support";

export interface SupportDraftAttachment {
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  fileSize: number;
  mediaType: LocalComposerAttachment["mediaType"];
  localPreviewUrl?: string;
  width?: number;
  height?: number;
  state: "uploading" | "ready" | "failed";
  progress: number;
  error?: string;
  uploaded?: SupportAttachment;
}

/**
 * A message being written: its text and its files. Each file is uploaded
 * as soon as it is picked, so sending waits only for what is still going.
 */
export function useSupportDraft() {
  const [draft, setDraft] = useState<DiscussionDraft>(
    createEmptyDiscussionDraft,
  );
  const [resetToken, setResetToken] = useState(0);
  const [attachments, setAttachments] = useState<SupportDraftAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const uploads = useRef(new Map<string, AbortController>());

  const patch = useCallback(
    (id: string, change: Partial<SupportDraftAttachment>) =>
      setAttachments((list) =>
        list.map((item) => (item.id === id ? { ...item, ...change } : item)),
      ),
    [],
  );

  const upload = useCallback(
    (item: SupportDraftAttachment) => {
      const controller = new AbortController();
      uploads.current.set(item.id, controller);
      supportService
        .uploadAttachment(
          item.file,
          { width: item.width, height: item.height },
          (progress) => patch(item.id, { progress }),
          controller.signal,
        )
        .then((uploaded) =>
          patch(item.id, { state: "ready", progress: 1, uploaded }),
        )
        .catch((error: { code?: string; message?: string }) => {
          if (error.code === "ERR_CANCELED") return;
          patch(item.id, {
            state: "failed",
            error: error.message ?? "The file could not be uploaded.",
          });
        })
        .finally(() => uploads.current.delete(item.id));
    },
    [patch],
  );

  // The list as last drawn, so a file can be counted and started outside a
  // state update (React runs those later, and twice in development).
  const latest = useRef(attachments);
  latest.current = attachments;

  const addAttachment = useCallback(
    (local: LocalComposerAttachment) => {
      if (latest.current.length >= SUPPORT_ATTACHMENTS_PER_MESSAGE) {
        revokeLocalAttachmentPreview(local);
        setNotice(
          `You can add up to ${SUPPORT_ATTACHMENTS_PER_MESSAGE} files to one message.`,
        );
        return;
      }
      const added: SupportDraftAttachment = {
        id: local.id,
        file: local.file,
        fileName: local.fileName,
        mimeType: local.mimeType,
        fileSize: local.fileSize,
        mediaType: local.mediaType,
        localPreviewUrl: local.localPreviewUrl,
        width: local.width,
        height: local.height,
        state: "uploading",
        progress: 0,
      };
      latest.current = [...latest.current, added];
      setAttachments((list) => [...list, added]);
      upload(added);
    },
    [upload],
  );

  const retryAttachment = useCallback(
    (id: string) => {
      const item = latest.current.find(
        (candidate) => candidate.id === id && candidate.state === "failed",
      );
      if (!item) return;
      patch(id, { state: "uploading", progress: 0, error: undefined });
      upload(item);
    },
    [patch, upload],
  );

  const removeAttachment = useCallback((id: string) => {
    uploads.current.get(id)?.abort();
    setAttachments((list) => {
      const removed = list.find((item) => item.id === id);
      if (removed) revokeLocalAttachmentPreview(removed);
      return list.filter((item) => item.id !== id);
    });
    setNotice(null);
  }, []);

  const reset = useCallback(() => {
    for (const controller of uploads.current.values()) controller.abort();
    uploads.current.clear();
    setAttachments((list) => {
      list.forEach(revokeLocalAttachmentPreview);
      return [];
    });
    setDraft(createEmptyDiscussionDraft());
    setResetToken((token) => token + 1);
    setNotice(null);
  }, []);

  // Leaving the page stops what is still uploading and frees the previews.
  useEffect(
    () => () => {
      for (const controller of uploads.current.values()) controller.abort();
      latest.current.forEach(revokeLocalAttachmentPreview);
    },
    [],
  );

  const uploading = attachments.some((item) => item.state === "uploading");
  const failed = attachments.some((item) => item.state === "failed");
  return {
    draft,
    setDraft,
    resetToken,
    attachments,
    notice,
    setNotice,
    addAttachment,
    retryAttachment,
    removeAttachment,
    reset,
    uploading,
    failed,
    hasText: hasDiscussionDraftContent(draft),
    attachmentIds: attachments.flatMap((item) =>
      item.uploaded ? [item.uploaded.id] : [],
    ),
  };
}

export type SupportDraftState = ReturnType<typeof useSupportDraft>;
