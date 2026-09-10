import {
  ArrowsClockwise,
  Check,
  CheckCircle,
  CircleNotch,
  CloudArrowUp,
  FileVideo,
  Info,
  PlayCircle,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  MEDIA_MAX_SIZES,
  videoJobProgressResponseSchema,
  type VideoJobProgressResponse,
  type VideoJobStatus,
} from "@veolms/contracts";
import { mediaService } from "../../services/media";

export interface LessonVideoUploadProps {
  mediaAssetId?: string | null;
  disabled?: boolean;
  hideUploadWhenAttached?: boolean;
  attachedActionLabel?: string;
  stackStatusBelow?: boolean;
  onMediaAttached: (
    mediaAssetId: string,
  ) => void | boolean | Promise<void | boolean>;
  onProcessingComplete?: (mediaAssetId: string) => void | Promise<void>;
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

const BUSY_PHASES = new Set<UploadPhase>([
  "uploading",
  "confirming",
  "transcoding",
]);

// 3D design system surface tokens: 0 borders, pure tactile depth via theme-adaptive shadows & highlights
const MODAL_FRAME_CLASS =
  "relative flex max-h-[calc(100dvh-16px)] w-full max-w-[680px] min-w-0 flex-col overflow-hidden rounded-[20px] sm:rounded-[24px] border-none bg-(--card-surface,var(--surface)) text-(--text) shadow-[var(--surface-frame-edge-shadow),var(--card-floating-shadow)] sm:max-h-[calc(100dvh-32px)]";

const RAISED_CARD_CLASS =
  "rounded-[14px] sm:rounded-[16px] border-none bg-(--card-surface-raised,color-mix(in_srgb,var(--surface-strong,var(--surface))_85%,var(--surface))) shadow-(--card-shadow,var(--surface-depth-shadow))";

const INSET_WELL_CLASS =
  "rounded-[14px] sm:rounded-[16px] border-none bg-[linear-gradient(155deg,color-mix(in_srgb,var(--canvas)_80%,var(--surface))_0%,color-mix(in_srgb,var(--surface)_65%,var(--canvas))_100%)] shadow-[inset_0_2px_6px_color-mix(in_srgb,black_28%,transparent),inset_0_1px_2px_color-mix(in_srgb,var(--text)_10%,transparent),inset_0_-1px_0_color-mix(in_srgb,var(--surface)_90%,transparent)]";

const PRIMARY_ACTION_CLASS =
  "inline-flex h-10 items-center justify-center rounded-[10px] border-none bg-(--accent) px-5 text-[0.82rem] font-bold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all duration-150 hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

const SECONDARY_ACTION_CLASS =
  "inline-flex h-10 items-center justify-center rounded-[10px] border-none bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--text)_13%,var(--surface))] active:bg-[color-mix(in_srgb,var(--text)_5%,var(--surface))] px-5 text-[0.82rem] font-semibold text-(--text) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_10%,transparent))] transition-all duration-150 active:scale-[0.98] cursor-pointer whitespace-nowrap";

export function LessonVideoUpload({
  mediaAssetId,
  disabled = false,
  hideUploadWhenAttached = false,
  attachedActionLabel = "Replace",
  stackStatusBelow = false,
  onMediaAttached,
  onProcessingComplete,
}: LessonVideoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef(0);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    onMediaAttachedRef.current = onMediaAttached;
  }, [onMediaAttached]);

  useEffect(() => {
    onProcessingCompleteRef.current = onProcessingComplete;
  }, [onProcessingComplete]);

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      uploadAbortControllerRef.current?.abort();
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
      setTrackProgress(Boolean(mediaAssetId && isOpen));
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
    setTrackProgress(Boolean(mediaAssetId && isOpen));
    setTranscodeProgress(0);
    setTranscodeStatus(undefined);
    setProgressStreamError(null);
    setStreamConnectionState("idle");
    setHasReceivedProgress(false);
    setAttachmentError(null);
    setPhase(mediaAssetId ? "attached" : "idle");
    setErrorMessage(null);
  }, [activeMediaId, candidateMediaId, isOpen, mediaAssetId]);

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
      await mediaService.retryTranscode(activeMediaId);
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
  }, [activeMediaId, resetReconnectBackoff]);

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
    [mediaAssetId, phase, resetReconnectBackoff, validateFile],
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
      const requestId = ++requestIdRef.current;
      uploadedThisSessionRef.current = true;
      resetReconnectBackoff();
      committedMediaIdRef.current = null;
      replacementForMediaIdRef.current = mediaAssetId ?? null;
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
        const presigned = await mediaService.presignVideoUpload({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
        });

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        await mediaService.uploadFileToPresignedUrl(
          presigned.uploadUrl,
          file,
          ({ loadedBytes, percent }) => {
            if (mountedRef.current && requestId === requestIdRef.current) {
              setUploadProgress(percent);
              setUploadLoadedBytes(loadedBytes);
            }
          },
          uploadAbortController.signal,
        );

        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setPhase("confirming");

        await mediaService.confirmUpload(presigned.mediaAssetId);

        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        setActiveMediaId(presigned.mediaAssetId);
        setCandidateMediaId(presigned.mediaAssetId);
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
        setErrorMessage(resolveUploadError(error));
      } finally {
        if (uploadAbortControllerRef.current === uploadAbortController) {
          uploadAbortControllerRef.current = null;
        }
      }
    },
    [activeMediaId, mediaAssetId, phase, resetReconnectBackoff, validateFile],
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
      ? "Retry Transcoding"
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
    uploadAbortControllerRef.current?.abort();
    uploadAbortControllerRef.current = null;
    uploadedThisSessionRef.current = false;
    resetReconnectBackoff();
    replacementForMediaIdRef.current = null;
    setCandidateMediaId(null);
    setActiveMediaId(mediaAssetId ?? null);
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
    setTrackProgress(Boolean(mediaAssetId && isOpen));
    setIsReplacingVideo(false);
  }, [isOpen, mediaAssetId, resetReconnectBackoff]);

  const removeSelectedFile = useCallback(() => {
    setSelectedFile(null);
    setErrorMessage(null);
    if (!isReplacingVideo) {
      setPhase(activeMediaId ? "attached" : "idle");
    }
  }, [activeMediaId, isReplacingVideo]);

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

  return (
    <>
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
            <span>
              {hasVideo ? (activeMediaId ? attachedActionLabel : "Change Video") : "Upload"}
            </span>
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

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-black/60 p-2 sm:p-4 backdrop-blur-[8px]"
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
                          ? "Replace Lesson Video"
                          : phase === "ready" || phase === "attached"
                            ? "Lesson Video"
                            : "Upload Lesson Video"}
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    disabled={!canChooseFile}
                    aria-label="Choose a video file"
                    onChange={handleFileInputChange}
                  />

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
                                ? "You can restart the video transcoding job."
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

                  {isReplacingVideo ? (
                    <div className="min-w-0 space-y-3.5 sm:space-y-4">
                      {/* Context banner reminding user current video remains active */}
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
                              Your active video stays live until the replacement
                              completes.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setIsReplacingVideo(false);
                          }}
                          className="shrink-0 cursor-pointer rounded-[7px] border-none bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2.5 py-1 text-[0.72rem] font-semibold text-(--text) transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] active:scale-95"
                        >
                          Keep current
                        </button>
                      </div>

                      <SelectVideoStage
                        canChooseFile={canChooseFile}
                        isDragging={isDragging}
                        onChooseFile={() => fileInputRef.current?.click()}
                        onDragEnter={handleDragOver}
                        onDragLeave={() => setIsDragging(false)}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onRemoveFile={removeSelectedFile}
                        selectedFile={selectedFile}
                        isReplacement={true}
                      />
                    </div>
                  ) : uploadStage === "select" ? (
                    <SelectVideoStage
                      canChooseFile={canChooseFile}
                      isDragging={isDragging}
                      onChooseFile={() => fileInputRef.current?.click()}
                      onDragEnter={handleDragOver}
                      onDragLeave={() => setIsDragging(false)}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onRemoveFile={removeSelectedFile}
                      selectedFile={selectedFile}
                      isReplacement={false}
                    />
                  ) : uploadStage === "uploading" ? (
                    <UploadProgressStage
                      file={selectedFile}
                      loadedBytes={uploadLoadedBytes}
                      phase={phase}
                      progress={uploadProgress}
                    />
                  ) : (
                    <TranscodingProgressStage
                      file={selectedFile}
                      mediaAttached={!selectedFile && Boolean(activeMediaId)}
                      progress={transcodeProgress}
                      status={transcodeStatus}
                      attachmentError={attachmentError}
                      errorMessage={isStreamError ? null : errorMessage}
                      hasReceivedProgress={hasReceivedProgress}
                      streamConnectionState={streamConnectionState}
                      isReplacement={isPendingReplacement}
                      onReplace={
                        mediaAssetId && !isReplacingVideo && !selectedFile
                          ? () => setIsReplacingVideo(true)
                          : undefined
                      }
                    />
                  )}
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
                      {isReplacingVideo ? "Upload Replacement" : "Upload Video"}
                    </button>
                  ) : uploadStage === "uploading" ? (
                    <button
                      type="button"
                      onClick={cancelUpload}
                      className={`${SECONDARY_ACTION_CLASS} min-w-[120px] px-5`}
                    >
                      Cancel Upload
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
}

interface SelectVideoStageProps {
  canChooseFile: boolean;
  isDragging: boolean;
  isReplacement?: boolean;
  onChooseFile: () => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRemoveFile?: () => void;
  selectedFile: File | null;
}

function SelectVideoStage({
  canChooseFile,
  isDragging,
  isReplacement = false,
  onChooseFile,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onRemoveFile,
  selectedFile,
}: SelectVideoStageProps) {
  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <p className="m-0 break-words text-[0.78rem] sm:text-[0.8rem] leading-relaxed text-(--muted)">
        {isReplacement
          ? "Choose a replacement video. Your current video stays available until the new one is ready."
          : "Upload a video for this lesson."}{" "}
        Supported formats: MP4, MOV, AVI, WebM (Max 5 GB)
      </p>

      {/* Tactile 3D sunken socket dropzone - 0 borders */}
      <div
        className={`flex min-h-[210px] sm:min-h-[250px] flex-col items-center justify-center rounded-[16px] border-none p-4 sm:p-6 text-center transition-all duration-150 ${
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
        role="region"
        aria-label="Video upload dropzone"
      >
        <div className="flex h-13 w-13 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_20%,var(--surface))_0%,color-mix(in_srgb,var(--accent)_8%,var(--canvas))_100%)] text-(--accent) shadow-[var(--card-compact-shadow,0_3px_8px_color-mix(in_srgb,var(--text)_12%,transparent))]">
          <CloudArrowUp size={34} weight="duotone" />
        </div>
        <p className="m-0 mt-3 sm:mt-4 text-[0.88rem] sm:text-[0.92rem] font-semibold text-(--text)">
          {isReplacement
            ? "Drag and drop the replacement video here"
            : "Drag and drop your video here"}
        </p>
        <p className="m-0 mt-1 text-[0.72rem] sm:text-[0.74rem] font-medium text-[color-mix(in_srgb,var(--muted)_75%,transparent)]">
          or
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
          className={`${PRIMARY_ACTION_CLASS} mt-3 sm:mt-3.5 px-6`}
        >
          Choose
        </button>
      </div>

      {selectedFile && (
        <VideoFileSummary file={selectedFile} onRemove={onRemoveFile} />
      )}

      {/* Video requirements: 3D raised surface, 0 borders, content-based low opacity */}
      <div className={`${RAISED_CARD_CLASS} p-3.5 sm:p-4`}>
        <h3 className="m-0 text-[0.8rem] sm:text-[0.82rem] font-semibold text-(--text)">
          {isReplacement
            ? "Replacement video requirements"
            : "Video requirements"}
        </h3>
        <div className="mt-2.5 sm:mt-3 space-y-2 text-[0.72rem] sm:text-[0.74rem] text-(--text-secondary)">
          <RequirementRow>MP4, MOV, AVI, WebM supported</RequirementRow>
          <RequirementRow>Maximum file size: 5 GB</RequirementRow>
          <RequirementRow>Recommended: 1080p or higher</RequirementRow>
          <RequirementRow>
            Clear audio for a better learning experience
          </RequirementRow>
        </div>
      </div>
    </div>
  );
}

interface UploadProgressStageProps {
  file: File | null;
  loadedBytes: number;
  phase: UploadPhase;
  progress: number;
}

function UploadProgressStage({
  file,
  loadedBytes,
  phase,
  progress,
}: UploadProgressStageProps) {
  const uploadState: ProgressState =
    phase === "confirming" ? "complete" : progress > 0 ? "active" : "pending";
  const preparingState: ProgressState =
    phase === "uploading" && progress === 0 ? "active" : "complete";
  const finalizingState: ProgressState =
    phase === "confirming" ? "active" : "pending";

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <VideoFileSummary file={file} />

      {/* Progress Card: 3D raised surface, 0 borders */}
      <section className={`min-w-0 ${RAISED_CARD_CLASS} p-3.5 sm:p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-[0.84rem] sm:text-[0.86rem] font-semibold text-(--text)">
              Uploading video
            </h3>
            <p className="m-0 mt-0.5 sm:mt-1 text-[0.72rem] sm:text-[0.74rem] text-(--muted)">
              Please keep this window open while uploading.
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

      {/* Checklist Card: 3D raised surface, 0 borders, clear opacity hierarchy */}
      <section className={`${RAISED_CARD_CLASS} p-3.5 sm:p-4 space-y-1`}>
        <UploadChecklistItem
          description="Getting your video ready to upload..."
          label="Preparing upload"
          state={preparingState}
        />
        <UploadChecklistItem
          description="Uploading video file"
          label="Uploading file"
          state={uploadState}
          value={progress > 0 ? `${progress}%` : undefined}
        />
        <UploadChecklistItem
          description="Confirming upload completion"
          label="Finalizing upload"
          state={finalizingState}
        />
        <UploadChecklistItem
          description="Queued for transcoding"
          label="Starting video processing"
          state="pending"
        />
      </section>

      {/* Background info note: 0 borders, subtle tinted depth */}
      <div className="flex items-start gap-2.5 rounded-[12px] border-none bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-3.5 py-3 text-[0.72rem] sm:text-[0.73rem] leading-relaxed text-(--text-secondary) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_8%,transparent))]">
        <Info
          size={16}
          weight="fill"
          className="mt-0.5 shrink-0 text-(--accent)"
        />
        <span>
          You can close this modal and the upload will continue in the
          background.
        </span>
      </div>
    </div>
  );
}

interface TranscodingProgressStageProps {
  file: File | null;
  mediaAttached: boolean;
  progress: number;
  status?: string;
  attachmentError?: string | null;
  errorMessage?: string | null;
  hasReceivedProgress: boolean;
  streamConnectionState: StreamConnectionState;
  isReplacement: boolean;
  onReplace?: () => void;
}

function TranscodingProgressStage({
  file,
  mediaAttached,
  progress,
  status,
  attachmentError,
  errorMessage,
  hasReceivedProgress,
  streamConnectionState,
  isReplacement,
  onReplace,
}: TranscodingProgressStageProps) {
  // A worker can report 100% FFmpeg progress while the job is still doing
  // final output/attachment work. Only the durable completed status means the
  // playback files are verified and safe to show as Ready.
  const isReady = status === "completed";
  const isFailed =
    status === "failed" || status === "cancelled" || Boolean(errorMessage);
  const isConnectionDegraded =
    streamConnectionState === "reconnecting" ||
    streamConnectionState === "closed";
  const isWaitingForWorker = status === "queued" || status === "provisioning";
  const hasDeterminateProgress = isReady || isFailed || progress > 0;
  const visibleProgress = hasDeterminateProgress ? progress : null;
  const isCheckingStatus =
    !isFailed &&
    !isReady &&
    !isWaitingForWorker &&
    !hasReceivedProgress &&
    !isConnectionDegraded;
  const badge = isReady ? "Ready" : isFailed ? "Failed" : "Processing";

  return (
    <div className="min-w-0 space-y-3.5 sm:space-y-4">
      <VideoFileSummary
        file={file}
        mediaAttached={mediaAttached}
        badge={badge}
        onReplace={onReplace}
      />

      {/* Processing Progress Card: 3D raised, 0 borders */}
      <section className={`min-w-0 ${RAISED_CARD_CLASS} p-3.5 sm:p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-[0.84rem] sm:text-[0.86rem] font-semibold text-(--text)">
              {isFailed
                ? "Video processing failed"
                : isReady
                  ? "Video processing complete"
                  : isConnectionDegraded
                    ? "Processing status unavailable"
                    : isWaitingForWorker
                      ? "Waiting for transcoder"
                      : isCheckingStatus
                        ? "Checking video status"
                        : "Video is being processed"}
            </h3>
            <p className="m-0 mt-0.5 sm:mt-1 text-[0.72rem] sm:text-[0.74rem] leading-relaxed text-(--muted)">
              {isFailed
                ? errorMessage || "The video could not be transcoded."
                : isReady
                  ? "Your playback files are ready for this lesson."
                  : isConnectionDegraded
                    ? "The last known status is preserved. Reconnect to continue receiving live updates."
                    : isWaitingForWorker
                      ? "Your upload is complete. A transcoding worker will start processing it shortly."
                      : isCheckingStatus
                        ? "Loading the latest transcoding status."
                        : "Your video has been uploaded. We're now transcoding it into playback files for the best learning experience."}
            </p>
          </div>
          <div className="shrink-0">
            <span className="text-[0.88rem] sm:text-[0.92rem] font-bold text-(--text) tabular-nums">
              {visibleProgress === null
                ? isWaitingForWorker
                  ? "Preparing…"
                  : "Checking…"
                : `${visibleProgress}%`}
            </span>
          </div>
        </div>
        <ProgressBar
          label="Video transcoding progress"
          value={visibleProgress}
        />
        <p className="m-0 mt-2.5 text-[0.7rem] sm:text-[0.72rem] text-(--muted)">
          {isFailed
            ? isReplacement
              ? "The current lesson video is still available. Retry this replacement or choose another video."
              : "Click Retry above to reconnect the status stream or restart the job."
            : isReady
              ? "The video can now be used when publishing the course."
              : isConnectionDegraded
                ? "Processing continues in the background while live updates reconnect."
                : "This may take a few minutes. Processing will continue in the background."}
        </p>
      </section>

      {/* Transcoding Status Card: 3D raised container + sunken inner socket, 0 borders */}
      <section className={`${RAISED_CARD_CLASS} p-3.5 sm:p-4`}>
        <h3 className="m-0 text-[0.8rem] sm:text-[0.82rem] font-semibold text-(--text)">
          Transcoding status
        </h3>
        <div
          className={`mt-2.5 sm:mt-3 overflow-hidden ${INSET_WELL_CLASS} divide-y divide-[color-mix(in_srgb,var(--text)_8%,transparent)]`}
        >
          <TranscodingStatusRow
            label="Transcoding job"
            state={isFailed ? "failed" : isReady ? "complete" : "active"}
            value={
              isFailed
                ? status === "cancelled"
                  ? "Transcoding cancelled"
                  : "Transcoding failed"
                : getJobLabel(status)
            }
          />
          <TranscodingStatusRow
            label="Playback output"
            state={isReady ? "complete" : isFailed ? "failed" : "pending"}
            value={
              isReady
                ? "Verified"
                : isFailed
                  ? "Not generated"
                  : isConnectionDegraded
                    ? "Last known status"
                    : "Pending verification"
            }
          />
          <TranscodingStatusRow
            label="Lesson attachment"
            state={
              attachmentError
                ? "failed"
                : isReady
                  ? "complete"
                  : isFailed
                    ? "failed"
                    : "pending"
            }
            value={
              attachmentError
                ? "Attachment failed"
                : isReady
                  ? isReplacement
                    ? "Will replace current"
                    : "Ready"
                  : isFailed
                    ? isReplacement
                      ? "Current video kept"
                      : "Not attached"
                    : isReplacement
                      ? "Current video kept"
                      : "Pending"
            }
          />
        </div>
      </section>

      {/* After Processing Card: 3D raised, 0 borders - only shown when not failed to avoid scrolling */}
      {!isFailed && (
        <section className={`${RAISED_CARD_CLASS} p-3.5 sm:p-4`}>
          <h3 className="m-0 text-[0.8rem] sm:text-[0.82rem] font-semibold text-(--text)">
            After processing
          </h3>
          <div className="mt-2 sm:mt-2.5 space-y-2 text-[0.72rem] sm:text-[0.73rem] text-(--text-secondary)">
            <RequirementRow>
              {isReplacement
                ? "The current video remains attached until this replacement is ready"
                : "Video will be attached to this lesson automatically"}
            </RequirementRow>
            <RequirementRow>
              You&apos;ll be able to preview the video in the player
            </RequirementRow>
          </div>
        </section>
      )}
    </div>
  );
}

interface VideoFileSummaryProps {
  badge?: string;
  file: File | null;
  mediaAttached?: boolean;
  onRemove?: () => void;
  onReplace?: () => void;
}

function VideoFileSummary({
  badge,
  file,
  mediaAttached = false,
  onRemove,
  onReplace,
}: VideoFileSummaryProps) {
  const badgeClasses =
    badge === "Ready"
      ? "bg-emerald-500/15 text-emerald-400 font-semibold shadow-[inset_0_1px_0_color-mix(in_srgb,white_12%,transparent),0_1px_3px_rgba(0,0,0,0.15)]"
      : badge === "Failed"
        ? "bg-red-500/15 text-red-400 font-semibold shadow-[inset_0_1px_0_color-mix(in_srgb,white_12%,transparent),0_1px_3px_rgba(0,0,0,0.15)]"
        : "bg-(--accent-soft,rgba(113,72,255,0.16)) text-(--accent) font-semibold shadow-[inset_0_1px_0_color-mix(in_srgb,white_12%,transparent),0_1px_3px_rgba(0,0,0,0.15)]";

  return (
    <div
      className={`flex min-w-0 items-center gap-3 sm:gap-3.5 ${RAISED_CARD_CLASS} p-2.5 sm:p-3`}
    >
      <VideoThumbnail file={file} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[0.78rem] sm:text-[0.82rem] font-medium text-(--text)">
          {file?.name ||
            (mediaAttached ? "Current lesson video" : "Selected video")}
        </p>
        <p className="m-0 mt-0.5 text-[0.7rem] sm:text-[0.72rem] text-(--muted)">
          {file ? formatBytes(file.size) : "Existing lesson media"}
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
      {badge && (
        <span
          className={`shrink-0 rounded-[8px] border-none px-2 py-0.5 sm:px-2.5 sm:py-1 text-[0.68rem] sm:text-[0.7rem] font-semibold ${badgeClasses}`}
        >
          {badge}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove selected video"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-none bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--muted) shadow-[inset_0_1px_0_color-mix(in_srgb,var(--surface)_80%,transparent)] transition-all hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:text-(--text) active:scale-95 cursor-pointer"
        >
          <X size={13} weight="bold" />
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

function RequirementRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Check size={14} weight="bold" className="shrink-0 text-emerald-400" />
      <span>{children}</span>
    </div>
  );
}

type ProgressState = "pending" | "active" | "complete" | "failed";

function UploadChecklistItem({
  description,
  label,
  state,
  value,
}: {
  description: string;
  label: string;
  state: ProgressState;
  value?: string;
}) {
  const isPending = state === "pending";
  const isActive = state === "active";
  const isComplete = state === "complete";
  const isFailed = state === "failed";

  return (
    <div className="flex items-center gap-2.5 sm:gap-3 py-1.5">
      <ProgressStateIcon state={state} />
      <div className="min-w-0 flex-1">
        <p
          className={`m-0 text-[0.76rem] sm:text-[0.78rem] ${
            isActive
              ? "font-semibold text-(--text)"
              : isComplete
                ? "font-medium text-(--text-secondary)"
                : isFailed
                  ? "font-semibold text-red-400"
                  : "font-normal text-[color-mix(in_srgb,var(--muted)_65%,transparent)]"
          }`}
        >
          {label}
        </p>
        <p
          className={`m-0 mt-0.5 text-[0.68rem] sm:text-[0.7rem] ${
            isActive
              ? "text-(--text-secondary)"
              : isComplete
                ? "text-(--muted)"
                : isFailed
                  ? "text-red-400/85"
                  : "text-[color-mix(in_srgb,var(--muted)_40%,transparent)]"
          }`}
        >
          {description}
        </p>
      </div>
      {value && (
        <span
          className={`text-[0.72rem] sm:text-[0.74rem] tabular-nums ${
            isActive
              ? "font-semibold text-(--accent)"
              : isPending
                ? "text-[color-mix(in_srgb,var(--muted)_60%,transparent)]"
                : isFailed
                  ? "font-semibold text-red-400"
                  : "text-(--muted)"
          }`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function TranscodingStatusRow({
  label,
  state,
  value,
}: {
  label: string;
  state: ProgressState;
  value: string;
}) {
  const isPending = state === "pending";
  const isActive = state === "active";
  const isComplete = state === "complete";
  const isFailed = state === "failed";

  return (
    <div className="flex items-center justify-between gap-2.5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <ProgressStateIcon state={state} />
        <span
          className={`truncate text-[0.72rem] sm:text-[0.74rem] ${
            isPending
              ? "text-[color-mix(in_srgb,var(--muted)_65%,transparent)]"
              : isFailed
                ? "font-medium text-(--text)"
                : "text-(--text-secondary)"
          }`}
        >
          {label}
        </span>
      </div>
      <span
        className={`shrink-0 text-right text-[0.72rem] sm:text-[0.74rem] ${
          isActive
            ? "font-semibold text-(--accent)"
            : isComplete
              ? "font-semibold text-emerald-400"
              : isFailed
                ? "font-semibold text-red-400"
                : "font-normal text-[color-mix(in_srgb,var(--muted)_45%,transparent)]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ProgressStateIcon({ state }: { state: ProgressState }) {
  if (state === "complete") {
    return (
      <CheckCircle
        size={18}
        weight="fill"
        className="shrink-0 text-emerald-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
      />
    );
  }
  if (state === "active") {
    return (
      <CircleNotch
        size={18}
        className="shrink-0 animate-spin text-(--accent) drop-shadow-[0_1px_3px_var(--accent-shadow)]"
      />
    );
  }
  if (state === "failed") {
    return (
      <WarningCircle
        size={18}
        weight="fill"
        className="shrink-0 text-red-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
      />
    );
  }
  return (
    <span className="h-[18px] w-[18px] shrink-0 rounded-full border-none bg-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-[inset_0_1px_2px_color-mix(in_srgb,black_20%,transparent)]" />
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
