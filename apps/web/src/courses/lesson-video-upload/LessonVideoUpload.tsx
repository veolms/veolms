import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CloudArrowUp } from "@phosphor-icons/react/CloudArrowUp";
import { FileVideo } from "@phosphor-icons/react/FileVideo";
import { PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { X } from "@phosphor-icons/react/X";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  MEDIA_MAX_SIZES,
  videoJobProgressResponseSchema,
  type PresignMediaRequest,
  type VideoJobProgressResponse,
  type VideoJobStatus,
} from "@veolms/contracts";
import {
  mediaService,
  readVideoUploadCheckpoint,
  uploadVideoResumable,
  useAttachedVideoStatus,
  useLessonYoutubeImport,
  useYoutubeImportAvailability,
} from "../../services/media";
import { useBeforeUnloadWarning } from "../../hooks/useBeforeUnloadWarning";
import { LessonUploadDropzone } from "../LessonUploadDropzone";
import {
  VideoSourceTabs,
  YoutubeImportPanel,
  type VideoSource,
} from "../../components/youtube-import/YoutubeImportPanel";
import type { YoutubeImportTarget } from "./youtube-import-target";

export interface LessonVideoUploadProps {
  mediaAssetId?: string | null;
  visibility?: PresignMediaRequest["visibility"];
  disabled?: boolean;
  hideUploadWhenAttached?: boolean;
  hideTrigger?: boolean;
  inline?: boolean;
  attachedActionLabel?: string;
  /** The trigger's words while no video is attached. */
  uploadLabel?: string;
  /** What the video is called in the pop-up, lower case: "trailer". */
  videoNoun?: string;
  stackStatusBelow?: boolean;
  onPreviewFile?: (file: File | null) => void;
  onMediaAttached: (
    mediaAssetId: string,
  ) => void | boolean | Promise<void | boolean>;
  onProcessingComplete?: (mediaAssetId: string) => void | Promise<void>;
  /**
   * Called once per uploaded asset when its generated thumbnail can be shown.
   * The transcoder captures the thumbnail before encoding renditions, so it
   * exists once processing passes THUMBNAIL_READY_PROGRESS_PERCENT.
   */
  onThumbnailAvailable?: (mediaAssetId: string) => void;
  /**
   * The lesson this video is for. When set, and the account may import
   * from YouTube, the picker also offers "Import from YouTube".
   */
  youtubeImport?: YoutubeImportTarget | null;
}

function toTitleCase(words: string): string {
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export interface LessonVideoUploadHandle {
  open: (file?: File) => void;
}

type UploadPhase =
  | "idle"
  | "attached"
  | "uploading"
  | "confirming"
  | "transcoding"
  | "ready"
  | "failed";

type StreamConnectionState =
  "idle" | "connecting" | "connected" | "reconnecting" | "terminal" | "closed";

const THUMBNAIL_READY_PROGRESS_PERCENT = 10;

const BUSY_PHASES = new Set<UploadPhase>([
  "uploading",
  "confirming",
  "transcoding",
]);

// 3D design system surface tokens: 0 borders, pure tactile depth via theme-adaptive shadows & highlights
const MODAL_FRAME_CLASS =
  "relative flex max-h-[calc(100dvh-16px)] w-full max-w-[680px] min-w-0 flex-col overflow-hidden rounded-[20px] sm:rounded-[24px] border-none bg-(--card-surface,var(--surface)) text-(--text) shadow-[var(--surface-frame-edge-shadow),var(--card-floating-shadow)] sm:max-h-[calc(100dvh-32px)]";

// The lesson studio's own standalone card (its Thumbnail card when no video
// sits above it): an import has no local file to preview, so its status row
// stands alone instead of closing a player card.
const STANDALONE_CARD_CLASS =
  "rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) shadow-(--card-shadow)";

const RAISED_CARD_CLASS =
  "rounded-[14px] sm:rounded-[16px] border-none bg-(--card-surface-raised,color-mix(in_srgb,var(--surface-strong,var(--surface))_85%,var(--surface))) shadow-(--card-shadow,var(--surface-depth-shadow))";

const INSET_WELL_CLASS =
  "rounded-[14px] sm:rounded-[16px] border-none bg-[linear-gradient(155deg,color-mix(in_srgb,var(--canvas)_80%,var(--surface))_0%,color-mix(in_srgb,var(--surface)_65%,var(--canvas))_100%)] shadow-[inset_0_2px_6px_color-mix(in_srgb,black_28%,transparent),inset_0_1px_2px_color-mix(in_srgb,var(--text)_10%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--surface)_90%,transparent)]";

const PRIMARY_ACTION_CLASS =
  "inline-flex h-10 items-center justify-center rounded-[10px] border-none bg-(--accent) px-5 text-[0.82rem] font-bold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all duration-150 hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

const SECONDARY_ACTION_CLASS =
  "inline-flex h-10 items-center justify-center rounded-[10px] border-none bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--text)_13%,var(--surface))] active:bg-[color-mix(in_srgb,var(--text)_5%,var(--surface))] px-5 text-[0.82rem] font-semibold text-(--text) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_10%,transparent))] transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap";

export const LessonVideoUpload = forwardRef<
  LessonVideoUploadHandle,
  LessonVideoUploadProps
>(function LessonVideoUpload(
  {
    mediaAssetId,
    visibility,
    disabled = false,
    hideUploadWhenAttached = false,
    hideTrigger = false,
    inline = false,
    attachedActionLabel = "Change Video",
    uploadLabel = "Upload",
    videoNoun = "lesson video",
    stackStatusBelow = false,
    onPreviewFile,
    onMediaAttached,
    onProcessingComplete,
    onThumbnailAvailable,
    youtubeImport = null,
  },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef(0);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const discardUploadRef = useRef(false);
  const mountedRef = useRef(true);
  const uploadedThisSessionRef = useRef(false);
  const committedMediaIdRef = useRef<string | null>(null);
  const committingMediaIdRef = useRef<string | null>(null);
  const replacementForMediaIdRef = useRef<string | null>(null);
  const progressMediaIdRef = useRef<string | null>(mediaAssetId ?? null);
  const highestTranscodeProgressRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const streamReconnectAttemptRef = useRef(0);
  const onMediaAttachedRef = useRef(onMediaAttached);
  const onProcessingCompleteRef = useRef(onProcessingComplete);
  const onThumbnailAvailableRef = useRef(onThumbnailAvailable);
  const thumbnailNotifiedMediaIdRef = useRef<string | null>(null);

  useEffect(() => {
    onMediaAttachedRef.current = onMediaAttached;
  }, [onMediaAttached]);

  useEffect(() => {
    onProcessingCompleteRef.current = onProcessingComplete;
  }, [onProcessingComplete]);

  useEffect(() => {
    onThumbnailAvailableRef.current = onThumbnailAvailable;
  }, [onThumbnailAvailable]);

  const clearScheduledReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const resetReconnectBackoff = useCallback(() => {
    clearScheduledReconnect();
    streamReconnectAttemptRef.current = 0;
  }, [clearScheduledReconnect]);

  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(
    mediaAssetId ?? null,
  );
  const [candidateMediaId, setCandidateMediaId] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>(
    mediaAssetId ? "attached" : "idle",
  );
  const [trackProgress, setTrackProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLoadedBytes, setUploadLoadedBytes] = useState(0);
  const [transcodeProgress, setTranscodeProgress] = useState(0);
  const [transcodeStatus, setTranscodeStatus] = useState<
    VideoJobStatus | undefined
  >();
  const [progressStreamError, setProgressStreamError] = useState<string | null>(
    null,
  );
  const [progressStreamAttempt, setProgressStreamAttempt] = useState(0);
  const [streamErrorCount, setStreamErrorCount] = useState(0);
  const [streamConnectionState, setStreamConnectionState] =
    useState<StreamConnectionState>("idle");
  const [hasReceivedProgress, setHasReceivedProgress] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReplacingVideo, setIsReplacingVideo] = useState(false);
  const [videoSource, setVideoSource] = useState<VideoSource>("upload");
  // The active video is a YouTube import: retry/cancel go to the import.
  const [youtubeImportMediaId, setYoutubeImportMediaId] = useState<
    string | null
  >(null);
  const [youtubeImportOnServer, setYoutubeImportOnServer] = useState(false);

  // Leaving the page loses an in-flight upload, and a processed video is only
  // attached to the lesson when this component sees processing complete. A
  // YouTube import runs on the server and attaches itself, so leaving is fine.
  const isFollowingImport =
    activeMediaId !== null && youtubeImportMediaId === activeMediaId;
  // An import into a saved lesson attaches itself on the server; one for a
  // lesson not saved yet is attached here on completion, like an upload.
  const importAttachesItself = isFollowingImport && youtubeImportOnServer;
  // The lesson studio puts this section under a player only when there is
  // something to play: the lesson's video or a chosen file. An import has
  // neither, so its rows stand as cards of their own.
  const inlineStandalone = inline && !mediaAssetId && !selectedFile;
  useBeforeUnloadWarning(
    !importAttachesItself &&
      (isBusy(phase) || (phase === "ready" && candidateMediaId !== null)),
  );
  const isUploadSurfaceActive = inline || isOpen;
  const canImportFromYoutube = useYoutubeImportAvailability(
    Boolean(youtubeImport) && isUploadSurfaceActive,
  );
  const showYoutubeImport = Boolean(youtubeImport) && canImportFromYoutube;

  useEffect(() => {
    onPreviewFile?.(selectedFile);
  }, [onPreviewFile, selectedFile]);

  const commitCandidate = useCallback(async (candidateId: string) => {
    if (
      committedMediaIdRef.current === candidateId ||
      committingMediaIdRef.current === candidateId
    ) {
      return;
    }

    committingMediaIdRef.current = candidateId;
    setAttachmentError(null);
    try {
      const result = await onMediaAttachedRef.current(candidateId);
      if (!mountedRef.current) return;

      if (result === false) {
        committedMediaIdRef.current = null;
        setAttachmentError(
          "The video is ready, but it could not be attached to this lesson.",
        );
        return;
      }

      committedMediaIdRef.current = candidateId;
      setCandidateMediaId((current) =>
        current === candidateId ? null : current,
      );
      replacementForMediaIdRef.current = null;
      setSelectedFile(null);
      uploadedThisSessionRef.current = false;
      setPhase("ready");
      setTrackProgress(false);
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      committedMediaIdRef.current = null;
      setAttachmentError(
        error instanceof Error
          ? error.message
          : "The video is ready, but it could not be attached to this lesson.",
      );
    } finally {
      if (committingMediaIdRef.current === candidateId) {
        committingMediaIdRef.current = null;
      }
    }
  }, []);

  const notifyProcessingComplete = useCallback((mediaId: string) => {
    try {
      void Promise.resolve(onProcessingCompleteRef.current?.(mediaId)).catch(
        () => {
          // The video is already ready; a refresh failure must not regress the
          // terminal UI state or turn a successful transcode into an error.
        },
      );
    } catch {
      // Optional reconciliation is best effort after the terminal event.
    }
  }, []);

  useEffect(() => {
    if (!activeMediaId || !trackProgress || typeof window === "undefined") {
      return;
    }

    if (typeof window.EventSource === "undefined") {
      const message =
        "Live transcoding updates are not supported in this browser.";
      setProgressStreamError(message);
      setStreamConnectionState("closed");
      setTrackProgress(false);
      return;
    }

    if (progressMediaIdRef.current !== activeMediaId) {
      progressMediaIdRef.current = activeMediaId;
      highestTranscodeProgressRef.current = 0;
    }

    let source: EventSource;
    try {
      source = mediaService.createVideoJobProgressEventSource(activeMediaId);
    } catch (error: unknown) {
      setProgressStreamError(
        error instanceof Error
          ? error.message
          : "The transcoding status could not be loaded.",
      );
      setStreamConnectionState("closed");
      setTrackProgress(false);
      return;
    }
    let receivedTerminalEvent = false;
    let disposed = false;
    setStreamConnectionState("connecting");

    const onOpen = () => {
      if (disposed) return;
      resetReconnectBackoff();
      setStreamConnectionState("connected");
      setProgressStreamError(null);
      setStreamErrorCount(0);
    };

    const onProgress = (event: MessageEvent<string>) => {
      if (disposed) return;

      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      const parsed = videoJobProgressResponseSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }

      const next: VideoJobProgressResponse = parsed.data;
      if (next.source === "youtube") {
        setYoutubeImportMediaId(activeMediaId);
      }
      setHasReceivedProgress(true);
      setProgressStreamError(null);
      setStreamConnectionState("connected");
      setStreamErrorCount(0);
      setTranscodeStatus(next.status);
      highestTranscodeProgressRef.current = Math.max(
        highestTranscodeProgressRef.current,
        next.progressPercent,
      );
      setTranscodeProgress(highestTranscodeProgressRef.current);

      if (
        thumbnailNotifiedMediaIdRef.current !== activeMediaId &&
        (next.status === "completed" ||
          highestTranscodeProgressRef.current >=
            THUMBNAIL_READY_PROGRESS_PERCENT)
      ) {
        thumbnailNotifiedMediaIdRef.current = activeMediaId;
        onThumbnailAvailableRef.current?.(activeMediaId);
      }

      if (next.status === "completed") {
        receivedTerminalEvent = true;
        setStreamConnectionState("terminal");
        setUploadProgress(100);
        setTranscodeProgress(100);
        setErrorMessage(null);
        setPhase("ready");
        setTrackProgress(false);

        const isPendingReplacement =
          activeMediaId !== null &&
          activeMediaId !== mediaAssetId &&
          replacementForMediaIdRef.current === (mediaAssetId ?? null);
        if (
          isPendingReplacement &&
          committedMediaIdRef.current !== activeMediaId
        ) {
          void commitCandidate(activeMediaId).then(() => {
            notifyProcessingComplete(activeMediaId);
          });
        } else {
          notifyProcessingComplete(activeMediaId);
        }
      } else if (next.status === "failed" || next.status === "cancelled") {
        receivedTerminalEvent = true;
        setStreamConnectionState("terminal");
        setPhase("failed");
        setTrackProgress(false);
        setErrorMessage(
          next.error ||
            (next.status === "cancelled"
              ? "Video processing was cancelled."
              : "The video could not be transcoded."),
        );
      } else {
        setErrorMessage(null);
        setPhase("transcoding");
      }
    };
    const scheduleStreamReconnect = (message: string) => {
      if (disposed || receivedTerminalEvent) return;

      const reconnectAttempt = streamReconnectAttemptRef.current;
      const reconnectDelay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
      streamReconnectAttemptRef.current = Math.min(reconnectAttempt + 1, 6);
      setStreamConnectionState("reconnecting");
      setProgressStreamError(message);

      if (reconnectTimerRef.current === null) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          if (!disposed && mountedRef.current) {
            setProgressStreamAttempt((attempt) => attempt + 1);
          }
        }, reconnectDelay);
      }
    };

    const onStreamError = (event: Event) => {
      if (disposed || receivedTerminalEvent) return;

      const data = getEventData(event);
      const closedReadyState = window.EventSource.CLOSED ?? 2;
      setStreamErrorCount((count) => Math.min(count + 1, 3));

      if (data) {
        let message = "The transcoding status could not be loaded.";
        try {
          const parsed = JSON.parse(data) as { message?: unknown };
          if (typeof parsed.message === "string" && parsed.message.trim()) {
            message = parsed.message;
          }
        } catch {
          // Keep the generic stream error for malformed server events.
        }

        // The API can close the first stream while the transcoding job is
        // still being created. Treat the error as transient. If EventSource
        // is still CONNECTING, its native reconnect loop owns the connection;
        // creating another source here would produce parallel stream requests.
        setStreamConnectionState("reconnecting");
        setProgressStreamError(message);
        if (source.readyState === closedReadyState) {
          scheduleStreamReconnect(message);
        }
        return;
      }

      // EventSource reconnects automatically while the connection is in the
      // CONNECTING state. Preserve the last known job state and percentage.
      if (source.readyState !== closedReadyState) {
        setStreamConnectionState("reconnecting");
        setProgressStreamError(
          "Live status updates are temporarily unavailable. Reconnecting…",
        );
        return;
      }

      scheduleStreamReconnect(
        "Live status updates are temporarily unavailable. Reconnecting automatically…",
      );
    };
    source.addEventListener("open", onOpen);
    source.addEventListener("progress", onProgress);
    source.addEventListener("error", onStreamError);
    return () => {
      disposed = true;
      source.removeEventListener("open", onOpen);
      source.removeEventListener("progress", onProgress);
      source.removeEventListener("error", onStreamError);
      source.close();
      clearScheduledReconnect();
    };
  }, [
    activeMediaId,
    candidateMediaId,
    commitCandidate,
    clearScheduledReconnect,
    mediaAssetId,
    notifyProcessingComplete,
    progressStreamAttempt,
    resetReconnectBackoff,
    trackProgress,
  ]);

  // An uploaded video that is processing (or processed) but not yet attached.
  // Read by the unmount cleanup below, which cannot see current state.
  const unattachedCandidateRef = useRef<string | null>(null);
  useEffect(() => {
    unattachedCandidateRef.current =
      candidateMediaId && (phase === "transcoding" || phase === "ready")
        ? candidateMediaId
        : null;
  }, [candidateMediaId, phase]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      uploadAbortControllerRef.current?.abort();

      // The lesson's first video is attached when this component sees
      // processing finish. If the editor closes before that — another step,
      // another lesson, another page — nothing was left to attach it and the
      // uploaded video was orphaned. Attach it now instead: processing
      // carries on server-side, and a lesson cannot be published with a
      // video that is not ready. A replacement is left alone, so the video
      // students are watching stays in place until its successor is ready.
      const unattached = unattachedCandidateRef.current;
      if (
        unattached &&
        replacementForMediaIdRef.current === null &&
        committedMediaIdRef.current !== unattached &&
        committingMediaIdRef.current !== unattached
      ) {
        void Promise.resolve(onMediaAttachedRef.current(unattached)).catch(
          () => undefined,
        );
      }
    };
  }, []);

  useEffect(() => {
    // A candidate becomes the current lesson asset only after a completed
    // terminal event invokes onMediaAttached and the parent sends the new ID
    // back through this prop. Do not reset the candidate while that commit is
    // in flight.
    if (candidateMediaId && mediaAssetId !== candidateMediaId) {
      // The normal replacement render keeps the original current media ID.
      // If another tab/editor changed the lesson binding, stop tracking this
      // local candidate so it cannot overwrite the newer binding.
      if (replacementForMediaIdRef.current === (mediaAssetId ?? null)) return;

      setCandidateMediaId(null);
      replacementForMediaIdRef.current = null;
      setSelectedFile(null);
      setActiveMediaId(mediaAssetId ?? null);
      setTrackProgress(Boolean(mediaAssetId && isUploadSurfaceActive));
      setTranscodeProgress(0);
      setTranscodeStatus(undefined);
      setProgressStreamError(null);
      setStreamConnectionState("idle");
      setHasReceivedProgress(false);
      setAttachmentError(null);
      setPhase(mediaAssetId ? "attached" : "idle");
      setErrorMessage(null);
      return;
    }

    if (candidateMediaId && mediaAssetId === candidateMediaId) {
      // The parent may optimistically render the candidate before its lesson
      // update has finished. Keep the candidate state until the persistence
      // callback explicitly succeeds, otherwise a failed save is mistaken for
      // a completed attachment.
      if (committedMediaIdRef.current !== candidateMediaId) return;

      setCandidateMediaId(null);
      replacementForMediaIdRef.current = null;
      setSelectedFile(null);
      uploadedThisSessionRef.current = false;
      setPhase("ready");
      setTrackProgress(false);
      setProgressStreamError(null);
      setAttachmentError(null);
      setErrorMessage(null);
      return;
    }

    if (mediaAssetId === activeMediaId) return;

    setActiveMediaId(mediaAssetId ?? null);
    setTrackProgress(Boolean(mediaAssetId && isUploadSurfaceActive));
    setTranscodeProgress(0);
    setTranscodeStatus(undefined);
    setProgressStreamError(null);
    setStreamConnectionState("idle");
    setHasReceivedProgress(false);
    setAttachmentError(null);
    setPhase(mediaAssetId ? "attached" : "idle");
    setErrorMessage(null);
  }, [activeMediaId, candidateMediaId, isUploadSurfaceActive, mediaAssetId]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;

    previousActiveElementRef.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
    document.body.setAttribute("data-modal-open", "true");

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("modal-open");
      document.body.removeAttribute("data-modal-open");
      previousActiveElementRef.current?.focus();
    };
  }, [isOpen]);

  const openModal = useCallback(() => {
    if (disabled) return;
    setIsReplacingVideo(false);
    if (activeMediaId && phase === "idle") {
      setPhase("attached");
    }
    if (activeMediaId) setTrackProgress(true);
    if (!activeMediaId) setStreamConnectionState("idle");
    setIsOpen(true);
  }, [activeMediaId, disabled, phase]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setIsDragging(false);
    setIsReplacingVideo(false);
  }, []);

  const retryProcessingStatus = useCallback(() => {
    if (!activeMediaId) return;
    resetReconnectBackoff();
    setErrorMessage(null);
    setProgressStreamError(null);
    setStreamErrorCount(0);
    setStreamConnectionState("connecting");
    if (phase === "attached") setPhase("transcoding");
    setTrackProgress(true);
    setProgressStreamAttempt((attempt) => attempt + 1);
  }, [activeMediaId, phase, resetReconnectBackoff]);

  const retryTranscoding = useCallback(async () => {
    if (!activeMediaId) return;
    resetReconnectBackoff();
    setErrorMessage(null);
    setProgressStreamError(null);
    setStreamErrorCount(0);
    setStreamConnectionState("connecting");
    setHasReceivedProgress(false);
    setTranscodeProgress(0);
    highestTranscodeProgressRef.current = 0;
    setTranscodeStatus("queued");
    setPhase("transcoding");
    setTrackProgress(false);
    try {
      if (youtubeImportMediaId === activeMediaId) {
        await mediaService.retryYoutubeImport(activeMediaId);
      } else {
        await mediaService.retryTranscode(activeMediaId);
      }
      setTrackProgress(true);
      setProgressStreamAttempt((attempt) => attempt + 1);
    } catch (error) {
      setPhase("failed");
      setTrackProgress(false);
      setStreamConnectionState("closed");
      setErrorMessage(
        error instanceof Error ? error.message : "Retry could not be started.",
      );
    }
  }, [activeMediaId, resetReconnectBackoff, youtubeImportMediaId]);

  const cancelTranscoding = useCallback(async () => {
    if (!activeMediaId) return;
    setErrorMessage(null);
    setTrackProgress(false);
    resetReconnectBackoff();
    try {
      if (youtubeImportMediaId === activeMediaId) {
        await mediaService.cancelYoutubeImport(activeMediaId);
      } else {
        await mediaService.cancelTranscode(activeMediaId);
      }
      setProgressStreamAttempt((attempt) => attempt + 1);
      setTranscodeStatus("cancelled");
      setPhase("failed");
      setErrorMessage("Video processing was cancelled.");
    } catch (error) {
      setTrackProgress(true);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to cancel video processing.",
      );
    }
  }, [activeMediaId, resetReconnectBackoff, youtubeImportMediaId]);

  /**
   * A YouTube import was queued (or an earlier import of the same video is
   * reused): follow it exactly like an uploaded video after its upload, so
   * the lesson gets it when processing completes.
   */
  const followYoutubeImport = useCallback(
    (mediaId: string, attachesOnServer: boolean) => {
      resetReconnectBackoff();
      setYoutubeImportOnServer(attachesOnServer);
      committedMediaIdRef.current = null;
      replacementForMediaIdRef.current = mediaAssetId ?? null;
      uploadedThisSessionRef.current = true;
      onPreviewFile?.(null);
      setSelectedFile(null);
      setIsReplacingVideo(false);
      setYoutubeImportMediaId(mediaId);
      setActiveMediaId(mediaId);
      setCandidateMediaId(mediaId);
      setErrorMessage(null);
      setAttachmentError(null);
      setUploadProgress(100);
      setTranscodeProgress(0);
      highestTranscodeProgressRef.current = 0;
      setTranscodeStatus("queued");
      setHasReceivedProgress(false);
      setStreamErrorCount(0);
      setStreamConnectionState("idle");
      setPhase("transcoding");
      setTrackProgress(true);
    },
    [mediaAssetId, onPreviewFile, resetReconnectBackoff],
  );

  // An import runs on the server and the lesson only gets the video once it
  // is ready, so an editor opened meanwhile would show an empty picker.
  // Pick a running (or failed, retryable) import back up instead.
  const isIdleForResume =
    (phase === "idle" || phase === "attached") &&
    !candidateMediaId &&
    !selectedFile;
  // Only a saved lesson has imports of its own to resume.
  const savedImportLesson =
    youtubeImport?.courseId && youtubeImport.lessonId
      ? { courseId: youtubeImport.courseId, lessonId: youtubeImport.lessonId }
      : null;
  const { data: lessonImport } = useLessonYoutubeImport(
    savedImportLesson,
    showYoutubeImport && isIdleForResume,
  );
  const resumedImportMediaIdRef = useRef<string | null>(null);
  const resumableImportMediaId = lessonImport?.import?.mediaId ?? null;
  useEffect(() => {
    if (
      !resumableImportMediaId ||
      !isIdleForResume ||
      resumedImportMediaIdRef.current === resumableImportMediaId
    ) {
      return;
    }
    resumedImportMediaIdRef.current = resumableImportMediaId;
    // Only imports into the saved lesson are found here, and those attach
    // themselves on the server.
    followYoutubeImport(resumableImportMediaId, true);
  }, [followYoutubeImport, isIdleForResume, resumableImportMediaId]);

  // A lesson can already hold a video that is still being processed: the
  // editor was closed during an upload or import (the first video of a
  // lesson is attached then, see the unmount effect). Opening it again only
  // set "attached" and showed an empty player; follow the processing instead.
  const isAttachedOnly =
    phase === "attached" &&
    Boolean(mediaAssetId) &&
    activeMediaId === mediaAssetId &&
    !candidateMediaId;
  const { data: attachedStatus } = useAttachedVideoStatus(
    mediaAssetId ?? null,
    isUploadSurfaceActive && isAttachedOnly,
  );
  const checkedAttachedMediaIdRef = useRef<string | null>(null);
  const adoptAttachedVideoStatus = useCallback(
    (mediaId: string, status: VideoJobProgressResponse) => {
      if (status.source === "youtube") {
        setYoutubeImportMediaId(mediaId);
        // It is the lesson's video already: nothing is left to attach here.
        setYoutubeImportOnServer(true);
      }
      if (
        status.status === "queued" ||
        status.status === "provisioning" ||
        status.status === "processing"
      ) {
        highestTranscodeProgressRef.current = status.progressPercent;
        setTranscodeProgress(status.progressPercent);
        setTranscodeStatus(status.status);
        setHasReceivedProgress(true);
        setPhase("transcoding");
        setTrackProgress(true);
      } else if (status.status === "failed" || status.status === "cancelled") {
        setTranscodeStatus(status.status);
        setPhase("failed");
        setErrorMessage(
          status.error ||
            (status.status === "cancelled"
              ? "Video processing was cancelled."
              : "The video could not be processed."),
        );
      }
    },
    [],
  );
  useEffect(() => {
    if (
      !attachedStatus ||
      !mediaAssetId ||
      !isAttachedOnly ||
      checkedAttachedMediaIdRef.current === mediaAssetId
    ) {
      return;
    }
    checkedAttachedMediaIdRef.current = mediaAssetId;
    adoptAttachedVideoStatus(mediaAssetId, attachedStatus);
  }, [adoptAttachedVideoStatus, attachedStatus, isAttachedOnly, mediaAssetId]);

  const retryAttachment = useCallback(async () => {
    if (!candidateMediaId || phase !== "ready") return;
    await commitCandidate(candidateMediaId);
  }, [candidateMediaId, commitCandidate, phase]);

  const validateFile = useCallback((file: File): string | null => {
    if (!file.type.toLowerCase().startsWith("video/")) {
      return "Please choose a video file.";
    }
    if (file.size <= 0) {
      return "The selected video is empty.";
    }
    if (file.size > MEDIA_MAX_SIZES.video) {
      return "Video files must be 5 GB or smaller.";
    }
    return null;
  }, []);

  const selectFile = useCallback(
    (file: File) => {
      if (isBusy(phase)) return;

      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }

      uploadedThisSessionRef.current = false;
      resetReconnectBackoff();
      committedMediaIdRef.current = null;
      replacementForMediaIdRef.current = null;
      setCandidateMediaId(null);
      setActiveMediaId(mediaAssetId ?? null);
      setResumeAvailable(
        readVideoUploadCheckpoint(file, visibility ?? "protected") !== null,
      );
      onPreviewFile?.(file);
      setSelectedFile(file);
      setErrorMessage(null);
      setUploadProgress(0);
      setUploadLoadedBytes(0);
      setTranscodeProgress(0);
      setTranscodeStatus(undefined);
      setProgressStreamError(null);
      setStreamErrorCount(0);
      setStreamConnectionState("idle");
      setHasReceivedProgress(false);
      setAttachmentError(null);
      setPhase("idle");
      setTrackProgress(false);
    },
    [
      mediaAssetId,
      onPreviewFile,
      phase,
      resetReconnectBackoff,
      validateFile,
      visibility,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      open: (file) => {
        if (disabled) return;
        if (inline) {
          if (file) {
            selectFile(file);
            return;
          }
          fileInputRef.current?.click();
          return;
        }
        openModal();
        if (file) selectFile(file);
      },
    }),
    [disabled, inline, openModal, selectFile],
  );

  const startUpload = useCallback(
    async (file: File) => {
      if (isBusy(phase)) return;

      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        if (!activeMediaId) setPhase("failed");
        return;
      }

      uploadAbortControllerRef.current?.abort();
      const uploadAbortController = new AbortController();
      uploadAbortControllerRef.current = uploadAbortController;
      discardUploadRef.current = false;
      const requestId = ++requestIdRef.current;
      uploadedThisSessionRef.current = true;
      resetReconnectBackoff();
      committedMediaIdRef.current = null;
      replacementForMediaIdRef.current = mediaAssetId ?? null;
      onPreviewFile?.(file);
      setSelectedFile(file);
      setIsReplacingVideo(false);
      setErrorMessage(null);
      setUploadProgress(0);
      setUploadLoadedBytes(0);
      setTranscodeProgress(0);
      setHasReceivedProgress(false);
      setStreamErrorCount(0);
      setStreamConnectionState("idle");
      setAttachmentError(null);
      setPhase("uploading");
      setTrackProgress(false);

      try {
        const result = await uploadVideoResumable({
          file,
          visibility,
          signal: uploadAbortController.signal,
          discardOnAbort: () => discardUploadRef.current,
          onResuming: ({ loadedBytes, percent }) => {
            if (!mountedRef.current || requestId !== requestIdRef.current) {
              return;
            }
            setUploadProgress(percent);
            setUploadLoadedBytes(loadedBytes);
          },
          onProgress: ({ loadedBytes, percent }) => {
            if (mountedRef.current && requestId === requestIdRef.current) {
              setUploadProgress(percent);
              setUploadLoadedBytes(loadedBytes);
            }
          },
          onCompleting: () => {
            if (mountedRef.current && requestId === requestIdRef.current) {
              setPhase("confirming");
            }
          },
        });

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        setResumeAvailable(false);
        setActiveMediaId(result.mediaAssetId);
        setCandidateMediaId(result.mediaAssetId);
        uploadedThisSessionRef.current = true;
        setTranscodeStatus("queued");
        setPhase("transcoding");
        setHasReceivedProgress(false);
        setAttachmentError(null);
        setTrackProgress(true);
      } catch (error: unknown) {
        if (
          !mountedRef.current ||
          requestId !== requestIdRef.current ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          return;
        }

        setPhase("failed");
        setTrackProgress(false);
        setResumeAvailable(
          readVideoUploadCheckpoint(file, visibility ?? "protected") !== null,
        );
        setErrorMessage(resolveUploadError(error));
      } finally {
        if (uploadAbortControllerRef.current === uploadAbortController) {
          uploadAbortControllerRef.current = null;
        }
      }
    },
    [
      activeMediaId,
      mediaAssetId,
      onPreviewFile,
      phase,
      resetReconnectBackoff,
      validateFile,
      visibility,
    ],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) selectFile(file);
    },
    [selectFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (isBusy(phase)) return;

      const file = event.dataTransfer.files?.[0];
      if (file) selectFile(file);
    },
    [phase, selectFile],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!isBusy(phase)) setIsDragging(true);
    },
    [phase],
  );

  const canChooseFile = !isBusy(phase);
  const uploadStage = getUploadStage(
    phase,
    selectedFile,
    activeMediaId,
    uploadedThisSessionRef.current,
  );
  const showFilePicker = Boolean(
    !isBusy(phase) &&
    (phase === "failed" ||
      (activeMediaId && !candidateMediaId && !selectedFile)),
  );
  const isStreamError = Boolean(
    progressStreamError ||
    (errorMessage && errorMessage.toLowerCase().includes("stream")),
  );
  const isPendingReplacement = Boolean(
    candidateMediaId && mediaAssetId && candidateMediaId !== mediaAssetId,
  );
  const isReplacementFlow = Boolean(
    mediaAssetId && (selectedFile || candidateMediaId),
  );
  const canRetryStatus = Boolean(activeMediaId && isStreamError);
  const canRetryTranscoding = Boolean(
    activeMediaId &&
    (transcodeStatus === "failed" ||
      transcodeStatus === "cancelled" ||
      (phase === "failed" && !isStreamError)),
  );
  const canRetryAttachment = Boolean(
    candidateMediaId && phase === "ready" && attachmentError,
  );
  const canRetry = Boolean(
    activeMediaId &&
    (canRetryStatus || canRetryTranscoding || canRetryAttachment),
  );
  const canChooseAnotherFile = Boolean(canRetryAttachment && !isBusy(phase));
  const retryButtonLabel = canRetryAttachment
    ? "Retry Attachment"
    : canRetryTranscoding
      ? isFollowingImport
        ? "Retry Import"
        : "Retry Transcoding"
      : "Retry Status";

  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (!activeMediaId || isRetrying) return;
    setIsRetrying(true);
    try {
      if (canRetryAttachment) {
        await retryAttachment();
      } else if (canRetryTranscoding) {
        await retryTranscoding();
      } else {
        retryProcessingStatus();
      }
    } finally {
      setIsRetrying(false);
    }
  }, [
    activeMediaId,
    canRetryAttachment,
    canRetryTranscoding,
    isRetrying,
    retryProcessingStatus,
    retryAttachment,
    retryTranscoding,
  ]);

  const statusLabel = getStatusLabel(
    phase,
    transcodeStatus,
    streamConnectionState,
  );

  const cancelUpload = useCallback(() => {
    requestIdRef.current += 1;
    discardUploadRef.current = true;
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    setResumeAvailable(false);
    uploadedThisSessionRef.current = false;
    resetReconnectBackoff();
    replacementForMediaIdRef.current = null;
    setCandidateMediaId(null);
    setActiveMediaId(mediaAssetId ?? null);
    onPreviewFile?.(null);
    setSelectedFile(null);
    setUploadProgress(0);
    setUploadLoadedBytes(0);
    setTranscodeProgress(0);
    setTranscodeStatus(undefined);
    setProgressStreamError(null);
    setStreamErrorCount(0);
    setStreamConnectionState("idle");
    setHasReceivedProgress(false);
    setErrorMessage(null);
    setPhase(mediaAssetId ? "attached" : "idle");
    setTrackProgress(Boolean(mediaAssetId && isUploadSurfaceActive));
    setIsReplacingVideo(false);
  }, [
    isUploadSurfaceActive,
    mediaAssetId,
    onPreviewFile,
    resetReconnectBackoff,
  ]);

  const removeSelectedFile = useCallback(() => {
    onPreviewFile?.(null);
    setSelectedFile(null);
    setResumeAvailable(false);
    setErrorMessage(null);
    setIsReplacingVideo(false);
    setPhase(mediaAssetId ? "attached" : "idle");
  }, [mediaAssetId, onPreviewFile]);

  const displayErrorMessage =
    errorMessage ||
    attachmentError ||
    (progressStreamError &&
    (hasReceivedProgress ||
      streamConnectionState === "closed" ||
      streamErrorCount >= 3)
      ? progressStreamError
      : null) ||
    (phase === "failed" ? "Video processing could not be completed." : null);

  const hasVideo = Boolean(activeMediaId || mediaAssetId);

  const renderSelectStage = (isReplacement: boolean) => {
    const filePicker = (
      <SelectVideoStage
        canChooseFile={canChooseFile}
        isDragging={isDragging}
        minimal={inline}
        onChooseFile={() => fileInputRef.current?.click()}
        onUploadFile={() => {
          if (selectedFile) void startUpload(selectedFile);
        }}
        onDragEnter={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onRemoveFile={removeSelectedFile}
        selectedFile={selectedFile}
        isReplacement={isReplacement}
        resumeAvailable={resumeAvailable}
      />
    );
    if (!showYoutubeImport || !youtubeImport) return filePicker;
    return (
      <div className="min-w-0 space-y-3.5">
        <VideoSourceTabs
          value={videoSource}
          onChange={setVideoSource}
          disabled={!canChooseFile || Boolean(selectedFile)}
        />
        {videoSource === "youtube" ? (
          <YoutubeImportPanel
            courseId={youtubeImport.courseId}
            lessonId={youtubeImport.lessonId}
            isReplacement={isReplacement}
            disabled={disabled || !canChooseFile}
            onImportStarted={(mediaId) =>
              followYoutubeImport(mediaId, Boolean(youtubeImport.lessonId))
            }
            onReuseExisting={(mediaId) => followYoutubeImport(mediaId, false)}
          />
        ) : (
          filePicker
        )}
      </div>
    );
  };

  const stageContent = isReplacingVideo ? (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <div
        className={`flex items-center justify-between gap-3 p-3 sm:p-3.5 ${RAISED_CARD_CLASS}`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-emerald-500/15 text-emerald-400">
            <CheckCircle size={16} weight="fill" />
          </div>
          <div className="min-w-0">
            <p className="m-0 truncate text-[0.78rem] sm:text-[0.8rem] font-semibold text-(--text)">
              Replacing current video
            </p>
            <p className="m-0 mt-0.5 truncate text-[0.7rem] sm:text-[0.72rem] text-(--muted)">
              Your active video stays live until the replacement completes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onPreviewFile?.(null);
            setSelectedFile(null);
            setIsReplacingVideo(false);
          }}
          className="shrink-0 cursor-pointer rounded-[7px] border-none bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2.5 py-1 text-[0.72rem] font-semibold text-(--text) transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] active:scale-95"
        >
          Keep current
        </button>
      </div>

      {renderSelectStage(true)}
    </div>
  ) : uploadStage === "select" ? (
    renderSelectStage(false)
  ) : uploadStage === "uploading" ? (
    <UploadProgressStage
      file={selectedFile}
      loadedBytes={uploadLoadedBytes}
      phase={phase}
      progress={uploadProgress}
      embedded={inline}
    />
  ) : (
    <TranscodingProgressStage
      file={selectedFile}
      mediaAttached={!selectedFile && Boolean(activeMediaId)}
      videoNoun={videoNoun}
      progress={hasReceivedProgress ? transcodeProgress : null}
      status={transcodeStatus}
      errorMessage={isStreamError ? null : errorMessage}
      isReplacement={isPendingReplacement}
      embedded={inline}
      standalone={inlineStandalone}
      isYoutubeImport={isFollowingImport}
      onReplace={
        mediaAssetId && !isReplacingVideo && !selectedFile
          ? () => fileInputRef.current?.click()
          : undefined
      }
      onReplaceFromYoutube={
        showYoutubeImport &&
        mediaAssetId &&
        !isReplacingVideo &&
        !selectedFile &&
        !isBusy(phase)
          ? () => {
              setVideoSource("youtube");
              setIsReplacingVideo(true);
            }
          : undefined
      }
    />
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={!canChooseFile}
        aria-label="Choose a video file"
        onChange={handleFileInputChange}
      />

      {!hideTrigger ? (
        <div
          className={`${stackStatusBelow ? "flex flex-col items-center gap-1.5" : "flex flex-wrap items-center gap-2"} max-[768px]:w-full`}
        >
          {(!hideUploadWhenAttached || activeMediaId) && (
            <button
              type="button"
              disabled={disabled}
              onClick={openModal}
              style={{
                fontSize: "0.80rem",
                fontWeight: 700,
                height: "34px",
                borderRadius: "8px",
                gap: "6px",
                paddingLeft: "16px",
                paddingRight: "16px",
              }}
              className={`${stackStatusBelow ? "inline-flex h-8.5 items-center justify-center gap-1.5 rounded-[8px] border-none bg-(--accent) text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] text-[0.8rem] font-bold" : "inline-flex h-8.5 items-center justify-center gap-1.5 rounded-[8px] border-none bg-(--accent) px-4 text-[0.8rem] font-bold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)]"} transition-all duration-150 hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 max-[768px]:flex-1 cursor-pointer`}
            >
              {hasVideo ? <PlayCircle size={15} /> : <UploadSimple size={15} />}
              <span>{hasVideo ? attachedActionLabel : uploadLabel}</span>
            </button>
          )}
          {isReplacementFlow && mediaAssetId ? (
            <span
              aria-live="polite"
              className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.76rem] text-(--muted)"
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle
                  size={14}
                  weight="fill"
                  className="text-emerald-400"
                />
                Current video kept
              </span>
              <span className="text-[color-mix(in_srgb,var(--muted)_70%,transparent)]">
                · Replacement: {statusLabel || "Ready to upload"}
              </span>
            </span>
          ) : (
            activeMediaId && (
              <span
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-[0.76rem] text-(--muted)"
              >
                {phase === "transcoding" && (
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                )}
                {phase === "ready" && (
                  <CheckCircle
                    size={14}
                    weight="fill"
                    className="text-emerald-400"
                  />
                )}
                {statusLabel}
              </span>
            )
          )}
        </div>
      ) : null}

      {inline &&
      (!activeMediaId ||
        isReplacingVideo ||
        Boolean(selectedFile) ||
        isBusy(phase) ||
        phase === "failed" ||
        Boolean(candidateMediaId)) ? (
        <div
          className="min-w-0 space-y-3.5 sm:space-y-4"
          data-inline-video-upload="true"
        >
          {isReplacementFlow && phase !== "idle" && (
            <div className="flex items-start gap-2.5 rounded-[12px] border-none bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-3.5 text-[0.74rem] leading-relaxed text-(--text-secondary) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_8%,transparent))]">
              <CheckCircle
                size={18}
                weight="fill"
                className="mt-0.5 shrink-0 text-emerald-400"
              />
              <span>
                Your current {videoNoun} stays available until this replacement
                is ready.
              </span>
            </div>
          )}

          {displayErrorMessage && (
            <div
              role="alert"
              className={`flex flex-col items-start justify-between gap-3 p-3.5 sm:flex-row sm:items-center sm:p-4 ${inline ? (inlineStandalone ? STANDALONE_CARD_CLASS : "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface))") : RAISED_CARD_CLASS}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <WarningCircle
                  size={19}
                  weight="fill"
                  className="shrink-0 text-amber-400"
                />
                <p className="m-0 break-words text-[0.82rem] font-semibold leading-snug text-(--text)">
                  {displayErrorMessage}
                </p>
              </div>
              {canRetry && (
                <button
                  type="button"
                  disabled={isRetrying}
                  onClick={() => void handleRetry()}
                  className="inline-flex h-8.5 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-none bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3.5 text-[0.74rem] font-semibold text-(--text) transition-all hover:bg-[color-mix(in_srgb,var(--text)_16%,transparent)] active:scale-95 disabled:opacity-50"
                >
                  <ArrowsClockwise
                    size={14}
                    weight="bold"
                    className={isRetrying ? "animate-spin" : ""}
                  />
                  {isRetrying ? "Retrying…" : retryButtonLabel}
                </button>
              )}
            </div>
          )}

          {stageContent}
        </div>
      ) : null}

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-xs p-2 sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lesson-video-upload-title"
              aria-busy={isBusy(phase)}
              data-modal-open="true"
              data-lesson-video-modal=""
            >
              <div className={MODAL_FRAME_CLASS}>
                <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3">
                  <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                    <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[10px] border-none bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_22%,var(--surface))_0%,color-mix(in_srgb,var(--accent)_10%,var(--canvas))_100%)] text-(--accent) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_12%,transparent))]">
                      <PlayCircle size={19} weight="fill" />
                    </div>
                    <div className="min-w-0">
                      <h2
                        id="lesson-video-upload-title"
                        className="m-0 truncate text-[0.98rem] sm:text-[1.05rem] font-semibold tracking-[-0.01em] text-(--text)"
                      >
                        {isReplacingVideo
                          ? `Replace ${toTitleCase(videoNoun)}`
                          : phase === "ready" || phase === "attached"
                            ? toTitleCase(videoNoun)
                            : `Upload ${toTitleCase(videoNoun)}`}
                      </h2>
                    </div>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={closeModal}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-none bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-(--muted) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface)_80%,transparent),0_1px_2px_color-mix(in_srgb,var(--text)_8%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] hover:text-(--text) active:scale-95 cursor-pointer"
                    aria-label="Close video upload dialog"
                  >
                    <X size={16} weight="bold" />
                  </button>
                </div>

                <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
                  {isReplacementFlow && (
                    <div className="mb-3.5 flex items-start gap-2.5 rounded-[12px] border-none bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-3.5 text-[0.74rem] leading-relaxed text-(--text-secondary) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_8%,transparent))]">
                      <CheckCircle
                        size={18}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-emerald-400"
                      />
                      <span>
                        Your current lesson binding is unchanged while this
                        replacement is uploaded and processed.
                      </span>
                    </div>
                  )}

                  {/* Top-level Error Alert with Retry button - NEVER requires scrolling */}
                  {displayErrorMessage && (
                    <div
                      role="alert"
                      className={`mb-3.5 flex flex-col items-start justify-between gap-3 p-3.5 sm:flex-row sm:items-center sm:p-4 ${RAISED_CARD_CLASS}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] bg-amber-500/15 text-amber-500 shadow-[inset_0_1px_0_color-mix(in_srgb,white_15%,transparent)] dark:text-amber-400 sm:h-9 sm:w-9">
                          <WarningCircle size={19} weight="fill" />
                        </div>
                        <div className="min-w-0">
                          <p className="m-0 break-words text-[0.82rem] font-semibold leading-snug text-(--text) sm:text-[0.85rem]">
                            {displayErrorMessage}
                          </p>
                          <p className="m-0 mt-0.5 text-[0.7rem] text-(--muted) sm:text-[0.72rem]">
                            {canRetryAttachment
                              ? "The video is ready, but the lesson update did not save. Retry attaching it."
                              : canRetryTranscoding
                                ? isFollowingImport
                                  ? "You can restart the import; finished steps are kept."
                                  : "You can restart the video transcoding job."
                                : isStreamError
                                  ? "The video state is preserved. Reconnect to resume live updates."
                                  : "Review the error and choose another video if needed."}
                          </p>
                        </div>
                      </div>
                      {canRetry && (
                        <button
                          type="button"
                          disabled={isRetrying}
                          onClick={() => void handleRetry()}
                          className="inline-flex h-8.5 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border-none bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3.5 text-[0.74rem] font-semibold text-(--text) shadow-none transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_16%,transparent)] active:scale-95 disabled:opacity-50 sm:w-auto sm:text-[0.76rem]"
                        >
                          <ArrowsClockwise
                            size={14}
                            weight="bold"
                            className={isRetrying ? "animate-spin" : ""}
                          />
                          <span>
                            {isRetrying ? "Retrying…" : retryButtonLabel}
                          </span>
                        </button>
                      )}
                      {canChooseAnotherFile && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex h-8.5 w-full shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-none bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-3.5 text-[0.74rem] font-semibold text-(--text) shadow-none transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] active:scale-95 sm:w-auto sm:text-[0.76rem]"
                        >
                          Choose another video
                        </button>
                      )}
                    </div>
                  )}

                  {phase === "ready" && !isReplacingVideo && (
                    <div
                      className={`mb-3.5 flex items-center gap-3 p-3.5 sm:p-4 ${RAISED_CARD_CLASS}`}
                    >
                      <div className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[10px] bg-emerald-500/15 text-emerald-400 shadow-[inset_0_1px_0_color-mix(in_srgb,white_15%,transparent)] sm:h-9 sm:w-9">
                        <CheckCircle size={19} weight="fill" />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 break-words text-[0.82rem] font-semibold leading-snug text-(--text) sm:text-[0.85rem]">
                          Video is ready
                        </p>
                        <p className="m-0 mt-0.5 text-[0.7rem] text-(--muted) sm:text-[0.72rem]">
                          This video is ready and can be used when publishing
                          the course.
                        </p>
                      </div>
                    </div>
                  )}

                  {stageContent}
                </div>

                <div className="flex items-center justify-end gap-2 sm:gap-2.5 px-4 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-2">
                  {isReplacingVideo && !selectedFile && (
                    <button
                      type="button"
                      onClick={() => setIsReplacingVideo(false)}
                      className={`${SECONDARY_ACTION_CLASS} w-[100px]`}
                    >
                      Cancel
                    </button>
                  )}

                  {(uploadStage === "select" || isReplacingVideo) &&
                    selectedFile && (
                      <button
                        type="button"
                        onClick={removeSelectedFile}
                        className={`${SECONDARY_ACTION_CLASS} w-[100px]`}
                      >
                        Cancel
                      </button>
                    )}

                  {(uploadStage === "select" || isReplacingVideo) &&
                  selectedFile ? (
                    <button
                      type="button"
                      onClick={() => void startUpload(selectedFile)}
                      className={`${PRIMARY_ACTION_CLASS} min-w-[120px] px-5`}
                    >
                      {resumeAvailable
                        ? "Resume Upload"
                        : isReplacingVideo
                          ? "Upload Replacement"
                          : "Upload Video"}
                    </button>
                  ) : uploadStage === "uploading" ? (
                    <button
                      type="button"
                      onClick={cancelUpload}
                      className={`${SECONDARY_ACTION_CLASS} min-w-[120px] px-5`}
                    >
                      Cancel Upload
                    </button>
                  ) : phase === "transcoding" ? (
                    <button
                      type="button"
                      onClick={() => void cancelTranscoding()}
                      className={`${SECONDARY_ACTION_CLASS} min-w-[140px] px-5`}
                    >
                      Cancel Processing
                    </button>
                  ) : !isReplacingVideo ? (
                    <button
                      type="button"
                      onClick={closeModal}
                      className={`${SECONDARY_ACTION_CLASS} w-[100px]`}
                    >
                      Close
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
});

interface SelectVideoStageProps {
  canChooseFile: boolean;
  isDragging: boolean;
  isReplacement?: boolean;
  minimal?: boolean;
  onChooseFile: () => void;
  onUploadFile?: () => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRemoveFile?: () => void;
  selectedFile: File | null;
  resumeAvailable?: boolean;
}

function SelectVideoStage({
  canChooseFile,
  isDragging,
  isReplacement = false,
  minimal = false,
  onChooseFile,
  onUploadFile,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onRemoveFile,
  selectedFile,
  resumeAvailable = false,
}: SelectVideoStageProps) {
  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      {!minimal && (
        <p className="m-0 break-words text-[0.78rem] sm:text-[0.8rem] leading-relaxed text-(--muted)">
          {isReplacement
            ? "Choose a replacement video. Your current video stays available until the new one is ready."
            : "Upload a video for this lesson."}{" "}
          Supported formats: MP4, MOV, AVI, WebM.
        </p>
      )}

      {!selectedFile &&
        (minimal ? (
          <LessonUploadDropzone
            title={
              isReplacement
                ? "Drag and drop the replacement video here"
                : "Drag and drop your video here"
            }
            supportText="Supports MP4, MOV, AVI, WebM."
            isDragging={isDragging}
            disabled={!canChooseFile}
            ariaLabel="Video upload dropzone"
            onChooseFile={onChooseFile}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        ) : (
          <div
            className={`flex min-h-[210px] flex-col items-center justify-center rounded-[16px] border-none p-4 text-center transition-all duration-150 sm:min-h-[250px] sm:p-6 ${
              isDragging
                ? "bg-[linear-gradient(160deg,color-mix(in_srgb,var(--accent)_16%,var(--canvas))_0%,color-mix(in_srgb,var(--accent)_8%,var(--surface))_100%)] shadow-[inset_0_0_0_2px_var(--accent),0_0_24px_var(--accent-shadow)]"
                : "bg-[linear-gradient(155deg,color-mix(in_srgb,var(--canvas)_80%,var(--surface))_0%,color-mix(in_srgb,var(--surface)_65%,var(--canvas))_100%)] shadow-[inset_0_2px_6px_color-mix(in_srgb,black_28%,transparent),inset_0_1px_2px_color-mix(in_srgb,var(--text)_10%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--surface)_90%,transparent)]"
            } ${canChooseFile ? "cursor-pointer" : "cursor-not-allowed opacity-75"}`}
            onClick={() => {
              if (canChooseFile) onChooseFile();
            }}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            role="button"
            tabIndex={canChooseFile ? 0 : -1}
            aria-disabled={!canChooseFile}
            aria-label="Video upload dropzone"
            onKeyDown={(event) => {
              if (
                canChooseFile &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onChooseFile();
              }
            }}
          >
            <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_20%,var(--surface))_0%,color-mix(in_srgb,var(--accent)_8%,var(--canvas))_100%)] text-(--accent) shadow-[var(--card-compact-shadow,0_3px_8px_color-mix(in_srgb,var(--text)_12%,transparent))] sm:h-16 sm:w-16">
              <CloudArrowUp size={34} weight="duotone" />
            </div>
            <p className="m-0 mt-3 text-[0.88rem] font-semibold text-(--text) sm:mt-4 sm:text-[0.92rem]">
              {isReplacement
                ? "Drag and drop the replacement video here"
                : "Drag and drop your video here"}
            </p>
            <p className="m-0 mt-1 text-[0.72rem] font-medium text-(--muted) sm:text-[0.74rem]">
              <span>or </span>
              <span className="text-(--accent) underline-offset-4 hover:underline">
                click to browse
              </span>
            </p>
            <p className="m-0 mt-2 text-[0.70rem] text-(--muted) sm:text-[0.74rem]">
              Supports MP4, MOV, AVI, WebM.
            </p>
            <button
              type="button"
              disabled={!canChooseFile}
              aria-label={
                isReplacement ? "Choose Replacement Video" : "Choose Video File"
              }
              onClick={(event) => {
                event.stopPropagation();
                onChooseFile();
              }}
              className={`${PRIMARY_ACTION_CLASS} mt-3 px-6 sm:mt-3.5`}
            >
              Choose
            </button>
          </div>
        ))}

      {selectedFile && resumeAvailable && (
        <p className="m-0 rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-3 py-2 text-[0.72rem] leading-relaxed text-(--text-secondary)">
          An interrupted upload of{" "}
          <span className="font-semibold text-(--text)">
            {selectedFile.name}
          </span>{" "}
          was found. Uploading resumes from the parts already sent.
        </p>
      )}

      {selectedFile && (
        <VideoFileSummary
          file={selectedFile}
          embedded={minimal}
          onUpload={minimal ? onUploadFile : undefined}
          uploadTextOnly={minimal}
          uploadLabel={resumeAvailable ? "Resume" : "Upload"}
          onRemove={onRemoveFile}
        />
      )}
    </div>
  );
}

interface UploadProgressStageProps {
  file: File | null;
  loadedBytes: number;
  phase: UploadPhase;
  progress: number;
  embedded?: boolean;
}

function UploadProgressStage({
  file,
  loadedBytes,
  phase,
  progress,
  embedded = false,
}: UploadProgressStageProps) {
  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <VideoFileSummary file={file} embedded={embedded} isUploading />

      <section
        className={`min-w-0 ${
          embedded
            ? "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-3.5 sm:p-4"
            : `${RAISED_CARD_CLASS} p-3.5 sm:p-4`
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-[0.84rem] sm:text-[0.86rem] font-semibold text-(--text)">
              Uploading video
            </h3>
            <p className="m-0 mt-0.5 sm:mt-1 text-[0.72rem] sm:text-[0.74rem] text-(--muted)">
              If this is interrupted, choose the same file again to resume.
            </p>
          </div>
          <span className="shrink-0 text-[0.88rem] sm:text-[0.92rem] font-bold text-(--text) tabular-nums">
            {progress}%
          </span>
        </div>
        <ProgressBar label="Video upload progress" value={progress} />
        <div className="mt-2.5 flex items-center justify-between gap-3 text-[0.7rem] sm:text-[0.72rem] text-(--muted) font-medium">
          <span>
            {formatBytes(loadedBytes)} of {formatBytes(file?.size ?? 0)}
          </span>
          <span>{phase === "confirming" ? "Finalizing" : "Uploading"}</span>
        </div>
      </section>
    </div>
  );
}

interface TranscodingProgressStageProps {
  file: File | null;
  mediaAttached: boolean;
  videoNoun: string;
  progress?: number | null;
  status?: string;
  errorMessage?: string | null;
  isReplacement: boolean;
  embedded?: boolean;
  /** Inline with no player above it: drawn as a card of its own. */
  standalone?: boolean;
  /** The video is a YouTube import rather than a file chosen here. */
  isYoutubeImport?: boolean;
  onReplace?: () => void;
  onReplaceFromYoutube?: () => void;
}

function TranscodingProgressStage({
  file,
  mediaAttached,
  videoNoun,
  progress = null,
  status,
  errorMessage,
  isReplacement,
  embedded = false,
  standalone = false,
  isYoutubeImport = false,
  onReplace,
  onReplaceFromYoutube,
}: TranscodingProgressStageProps) {
  // A worker can report 100% FFmpeg progress while the job is still doing
  // final output/attachment work. Only the durable completed status means the
  // playback files are verified and safe to show as Ready.
  const isReady = status === "completed";
  const isFailed =
    status === "failed" || status === "cancelled" || Boolean(errorMessage);
  const badge = isReady ? "Ready" : isFailed ? "Failed" : "Processing";

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <VideoFileSummary
        file={file}
        mediaAttached={mediaAttached}
        videoNoun={videoNoun}
        badge={badge}
        processingProgress={badge === "Processing" ? progress : undefined}
        embedded={embedded}
        standalone={standalone}
        onReplace={onReplace}
        labels={
          isYoutubeImport
            ? {
                name: "YouTube video",
                meta: isReady
                  ? "Imported from YouTube"
                  : isFailed
                    ? "From YouTube"
                    : "Importing from YouTube",
              }
            : null
        }
      />
      {onReplaceFromYoutube ? (
        <button
          type="button"
          onClick={onReplaceFromYoutube}
          className="cursor-pointer border-none bg-transparent px-1 text-[0.74rem] font-semibold text-(--accent) underline-offset-4 hover:underline"
        >
          Import a replacement from YouTube
        </button>
      ) : null}
    </div>
  );
}

interface VideoFileSummaryProps {
  badge?: string;
  embedded?: boolean;
  file: File | null;
  isUploading?: boolean;
  onUpload?: () => void;
  mediaAttached?: boolean;
  videoNoun?: string;
  onRemove?: () => void;
  onReplace?: () => void;
  processingProgress?: number | null;
  uploadLabel?: string;
  uploadTextOnly?: boolean;
  /** Name and second line when there is no local file to describe. */
  labels?: { name: string; meta: string } | null;
  /** Drawn as a card of its own (see STANDALONE_CARD_CLASS). */
  standalone?: boolean;
}

function VideoFileSummary({
  badge,
  embedded = false,
  file,
  isUploading = false,
  onUpload,
  mediaAttached = false,
  videoNoun = "lesson video",
  onRemove,
  onReplace,
  processingProgress = null,
  uploadLabel = "Upload",
  uploadTextOnly = false,
  labels = null,
  standalone = false,
}: VideoFileSummaryProps) {
  const name =
    file?.name ||
    labels?.name ||
    (mediaAttached ? `Current ${videoNoun}` : "Selected video");
  const processingTooltipId = useId();
  const [videoDimensions, setVideoDimensions] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setVideoDimensions(null);
      return;
    }

    let active = true;
    const previewUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (active && video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoDimensions(`${video.videoWidth} × ${video.videoHeight}`);
      }
    };
    video.src = previewUrl;
    video.load();

    return () => {
      active = false;
      video.onloadedmetadata = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(previewUrl);
    };
  }, [file]);

  const badgeClasses =
    badge === "Ready"
      ? "bg-emerald-500/15 text-emerald-400 font-semibold shadow-[inset_0_1px_0_color-mix(in_srgb,white_12%,transparent),0_1px_3px_rgba(0,0,0,0.15)]"
      : badge === "Failed"
        ? "bg-red-500/15 text-red-400 font-semibold shadow-[inset_0_1px_0_color-mix(in_srgb,white_12%,transparent),0_1px_3px_rgba(0,0,0,0.15)]"
        : "bg-(--accent-soft,rgba(113,72,255,0.16)) text-(--accent) font-semibold shadow-[inset_0_1px_0_color-mix(in_srgb,white_12%,transparent),0_1px_3px_rgba(0,0,0,0.15)]";

  return (
    <div
      className={`flex min-w-0 items-center gap-3 sm:gap-3.5 ${
        standalone
          ? `${STANDALONE_CARD_CLASS} p-3.5 sm:p-4`
          : embedded
            ? `border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) px-2.5 ${isUploading ? "pb-3.5 sm:pb-4" : "pb-2.5 sm:pb-3"} pt-2 sm:px-3 sm:pt-2.5`
            : `${RAISED_CARD_CLASS} p-2.5 sm:p-3`
      }`}
    >
      <VideoThumbnail file={file} />
      <div className="min-w-0 flex-1">
        <p
          className="m-0 truncate text-[0.78rem] sm:text-[0.82rem] font-medium text-(--text)"
          title={name}
        >
          {name}
        </p>
        <p className="m-0 mt-0.5 text-[0.7rem] sm:text-[0.72rem] text-(--muted)">
          {file
            ? `${formatBytes(file.size)}${videoDimensions ? ` • ${videoDimensions}` : ""}`
            : (labels?.meta ?? `Existing ${videoNoun}`)}
        </p>
      </div>
      {onReplace && (
        <button
          type="button"
          onClick={onReplace}
          aria-label={
            mediaAttached ? "Choose Replacement Video" : "Replace video"
          }
          className="inline-flex h-7.5 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border-none bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2.5 text-[0.72rem] font-semibold text-(--text) shadow-none transition-all hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] active:scale-95"
        >
          <ArrowsClockwise size={13} weight="bold" />
          <span>Replace</span>
        </button>
      )}
      {onUpload && (
        <button
          type="button"
          onClick={onUpload}
          aria-label={`${uploadLabel} video`}
          className={`inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border-none bg-(--accent) px-3.5 text-[0.76rem] font-semibold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all hover:bg-(--accent-hover,var(--accent)) active:scale-95 ${uploadTextOnly ? "" : "gap-1.5"}`}
        >
          {!uploadTextOnly && <CloudArrowUp size={15} weight="bold" />}
          <span>{uploadLabel}</span>
        </button>
      )}
      {badge === "Processing" ? (
        <span
          className="group/processing-badge relative shrink-0 rounded-[8px] outline-none focus-visible:outline-2 focus-visible:outline-(--accent) focus-visible:outline-offset-2"
          tabIndex={0}
          aria-describedby={processingTooltipId}
        >
          <span
            className={`block rounded-[8px] border-none px-2 py-0.5 sm:px-2.5 sm:py-1 text-[0.68rem] sm:text-[0.7rem] font-semibold ${badgeClasses}`}
          >
            {badge}
          </span>
          <span
            id={processingTooltipId}
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 hidden w-max max-w-56 items-center gap-1.5 rounded bg-black/90 px-2 py-1 text-xs font-medium text-white shadow-lg group-hover/processing-badge:flex group-focus-visible/processing-badge:flex"
          >
            {processingProgress === null
              ? "Waiting for progress update"
              : `Processing ${processingProgress}% complete`}
          </span>
        </span>
      ) : (
        badge && (
          <span
            className={`shrink-0 rounded-[8px] border-none px-2 py-0.5 sm:px-2.5 sm:py-1 text-[0.68rem] sm:text-[0.7rem] font-semibold ${badgeClasses}`}
          >
            {badge}
          </span>
        )
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove selected video"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface)_80%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:text-(--text) active:scale-95 cursor-pointer"
        >
          <X size={15} weight="bold" />
        </button>
      )}
    </div>
  );
}

function VideoThumbnail({ file }: { file: File | null }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || typeof URL === "undefined" || !URL.createObjectURL) {
      setPreviewUrl(null);
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!previewUrl) {
    return (
      <div className="flex h-11 w-18 sm:h-12 sm:w-20 shrink-0 items-center justify-center rounded-[9px] border-none bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_18%,var(--surface))_0%,color-mix(in_srgb,var(--accent)_8%,var(--canvas))_100%)] text-(--accent) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_10%,transparent))]">
        <FileVideo size={21} weight="duotone" />
      </div>
    );
  }

  return (
    <div className="relative h-11 w-18 sm:h-12 sm:w-20 shrink-0 overflow-hidden rounded-[9px] border-none bg-black/60 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]">
      <video
        src={previewUrl}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
        aria-hidden="true"
      />
      <PlayCircle
        size={20}
        weight="fill"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]"
      />
    </div>
  );
}

function ProgressBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const isIndeterminate = value === null;

  return (
    <div
      className="mt-3 sm:mt-3.5 h-2 w-full overflow-hidden rounded-full border-none bg-[color-mix(in_srgb,var(--canvas)_75%,var(--text)_14%)] p-[1px] shadow-[inset_0_1.5px_3px_color-mix(in_srgb,black_25%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--surface)_85%,transparent)]"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isIndeterminate ? undefined : value}
      aria-busy={isIndeterminate}
    >
      <div
        className={`h-full rounded-full bg-[linear-gradient(90deg,var(--accent)_0%,color-mix(in_srgb,var(--accent)_85%,white)_100%)] shadow-[0_0_10px_var(--accent-shadow),inset_0_1px_0_color-mix(in_srgb,white_35%,transparent)] ${isIndeterminate ? "lesson-video-progress-indeterminate motion-reduce:animate-none" : "transition-[width] duration-300"}`}
        style={
          isIndeterminate
            ? undefined
            : { width: `${Math.max(0, Math.min(100, value))}%` }
        }
      />
    </div>
  );
}

function isBusy(phase: UploadPhase): boolean {
  return BUSY_PHASES.has(phase);
}

function getUploadStage(
  phase: UploadPhase,
  selectedFile: File | null,
  mediaAssetId: string | null,
  uploadedThisSession: boolean,
): "select" | "uploading" | "processing" {
  if (phase === "uploading" || phase === "confirming") return "uploading";
  if (
    phase === "transcoding" ||
    phase === "ready" ||
    (phase === "attached" && mediaAssetId) ||
    (phase === "failed" && mediaAssetId && !selectedFile) ||
    (phase === "failed" && mediaAssetId && uploadedThisSession)
  ) {
    return "processing";
  }
  return "select";
}

function getStatusLabel(
  phase: UploadPhase,
  jobStatus?: string,
  streamConnectionState?: StreamConnectionState,
): string {
  if (phase === "ready") return "Video ready";
  if (phase === "failed") return "Video processing failed";
  if (phase === "uploading") return "Uploading…";
  if (phase === "confirming") return "Confirming upload…";
  if (streamConnectionState === "reconnecting") return "Reconnecting…";
  if (streamConnectionState === "closed") return "Status unavailable";
  if (phase === "transcoding") return getJobLabel(jobStatus);
  if (phase === "attached") return "Video attached";
  return "";
}

function getJobLabel(status?: string): string {
  switch (status) {
    case "queued":
      return "Waiting for transcoder";
    case "provisioning":
      return "Preparing transcoder";
    case "processing":
      return "Transcoding video";
    case "completed":
      return "Video ready";
    case "failed":
      return "Transcoding failed";
    case "cancelled":
      return "Transcoding cancelled";
    default:
      return "Checking video status";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function resolveUploadError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "The video upload could not be completed. Please try again.";
}

function getEventData(event: Event): string {
  if (!("data" in event)) return "";
  const data = (event as MessageEvent<unknown>).data;
  return typeof data === "string" ? data : "";
}
