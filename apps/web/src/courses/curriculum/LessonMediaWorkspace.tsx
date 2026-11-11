import { CloudArrowUpIcon as CloudArrowUp } from "@phosphor-icons/react/CloudArrowUp";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { HeadphonesIcon as Headphones } from "@phosphor-icons/react/Headphones";
import { ImageIcon as Image } from "@phosphor-icons/react/Image";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { MusicNotesIcon as MusicNotes } from "@phosphor-icons/react/MusicNotes";
import { PlayCircleIcon as PlayCircle } from "@phosphor-icons/react/PlayCircle";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { VideoIcon as Video } from "@phosphor-icons/react/Video";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { LessonAudioPlayer } from "./LessonAudioPlayer";
import { isMarkdownFile } from "./LessonReadingEditor";
import {
  lessonContentAccept,
  lessonContentFileProblem,
} from "./lessonContentFiles";
import type { StudioLessonContentType } from "./LessonContentTypeSelector";
import { LessonUploadDropzone } from "../LessonUploadDropzone";
import { LessonVideoPlayer } from "../../learning/player";
import {
  getVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
} from "../../learning/videoPlaybackBootstrap";
import type {
  VideoPlaybackBootstrap,
  VideoPlaybackToken,
} from "@veolms/contracts";
import type { CourseVideo } from "../../learning/courseContent";
import {
  mediaService,
  useMediaImageVariantManifest,
} from "../../services/media";
import { ElevatedCard } from "../../components/ElevatedCard";

export interface AttachedMediaInfo {
  id?: string;
  name?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  dimensions?: string;
  url?: string | null;
  mimeType?: string;
  thumbnailUrl?: string | null;
}

function isVideoFile(file: File) {
  if (file.type.toLowerCase().startsWith("video/")) return true;
  return /\.(mp4|m4v|mov|webm|avi|mkv|mpeg|mpg)$/i.test(file.name);
}

function isImageFile(file: File) {
  if (file.type.toLowerCase().startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name);
}

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export interface LessonMediaWorkspaceProps {
  contentType: StudioLessonContentType;
  lessonTitle: string;
  lessonNumber?: number;
  courseSlug?: string;
  courseTitle?: string;
  mediaInfo?: AttachedMediaInfo | null;
  playbackRevision?: number;
  previewFile?: File | null;
  disabled?: boolean;
  onUploadFile?: (file: File) => void | Promise<void>;
  onChangeVideoClick?: () => void;
  videoUploadSection?: ReactNode;
  onUploadThumbnail?: (file: File) => void | Promise<void>;
  playbackSuspended?: boolean;
  /** Detaches this type's file (it stays in the media library). */
  onRemoveMedia?: () => unknown;
  /** A file the type does not take: what to tell the creator. */
  onInvalidFile?: (message: string) => void;
  /**
   * A document's text editor. Given, a document with no PDF offers to
   * write the reading here instead of uploading one.
   */
  readingEditor?: ReactNode;
  /** Whether the document's text holds anything (it opens on the text). */
  hasReadingText?: boolean;
  /** The attached PDF drawn as learners read it, shown on request. */
  documentPreview?: ReactNode;
  /**
   * Why the attached video cannot be played here yet (its type is not the
   * lesson's saved one, so there is no lesson playback for it).
   */
  videoPreviewUnavailableText?: string | null;
}

export function LessonMediaWorkspace({
  contentType,
  lessonTitle,
  lessonNumber,
  courseSlug,
  courseTitle,
  mediaInfo,
  playbackRevision = 0,
  previewFile = null,
  disabled = false,
  onUploadFile,
  videoUploadSection,
  onUploadThumbnail,
  playbackSuspended = false,
  onRemoveMedia,
  onInvalidFile,
  readingEditor,
  hasReadingText = false,
  documentPreview,
  videoPreviewUnavailableText = null,
}: LessonMediaWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documentMode, setDocumentMode] = useState<"pdf" | "text">(
    hasReadingText ? "text" : "pdf",
  );
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [audioPreview, setAudioPreview] = useState<{
    mediaId: string;
    url: string | null;
    failed: boolean;
  } | null>(null);
  const [audioAttempt, setAudioAttempt] = useState(0);

  useEffect(() => {
    setConfirmingRemove(false);
    setShowDocumentPreview(false);
  }, [contentType, mediaInfo?.id]);

  // An audio file plays in the studio from its address, for its owner.
  const audioMediaId =
    contentType === "audio" && !previewFile ? mediaInfo?.id : undefined;
  useEffect(() => {
    if (!audioMediaId) {
      setAudioPreview(null);
      return undefined;
    }
    let active = true;
    setAudioPreview({ mediaId: audioMediaId, url: null, failed: false });
    mediaService
      .getMediaDelivery(audioMediaId)
      .then(({ url }) => {
        if (active)
          setAudioPreview({ mediaId: audioMediaId, url, failed: false });
      })
      .catch(() => {
        if (active) {
          setAudioPreview({ mediaId: audioMediaId, url: null, failed: true });
        }
      });
    return () => {
      active = false;
    };
  }, [audioMediaId, audioAttempt]);

  /** Hands a file on only when this type takes it; says why otherwise. */
  const submitFile = (file: File) => {
    if (contentType === "document" && isMarkdownFile(file) && readingEditor) {
      // A Markdown file is text: it goes into the reading, not uploaded.
      setDocumentMode("text");
      onInvalidFile?.(
        "Markdown is text: use Import .md in the reading editor.",
      );
      return;
    }
    const problem = lessonContentFileProblem(contentType, file);
    if (problem) {
      onInvalidFile?.(problem);
      return;
    }
    void onUploadFile?.(file);
  };
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [playbackBootstrap, setPlaybackBootstrap] =
    useState<VideoPlaybackBootstrap | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailPreviewFile, setThumbnailPreviewFile] = useState<File | null>(
    null,
  );
  // The generated thumbnail can lag behind processing progress; remember a
  // URL that failed to load so the card falls back to its placeholder.
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(
    null,
  );
  const imageVariantManifestQuery = useMediaImageVariantManifest(
    mediaInfo?.id,
    contentType === "image" && !previewFile,
  );
  const imageVariantManifest = imageVariantManifestQuery.data;
  const mediaInfoId = mediaInfo?.id;
  const imageVariantSrcSet =
    !previewFile && mediaInfoId
      ? imageVariantManifest?.variants
          .map(
            ({ width }) =>
              `${mediaService.getImageVariantUrl(mediaInfoId, width)} ${width}w`,
          )
          .join(", ")
      : undefined;
  // Without variants (still processing, or the manifest could not be read)
  // the asset's own delivery URL is the only image there is to show.
  const imagePreviewSrc = previewFile
    ? (previewUrl ?? undefined)
    : mediaInfoId
      ? imageVariantManifest
        ? imageVariantManifest.variants.length
          ? mediaService.getImageVariantUrl(
              mediaInfoId,
              imageVariantManifest.variants.at(-1)!.width,
            )
          : mediaInfo?.url
        : imageVariantManifestQuery.isError
          ? mediaInfo?.url
          : undefined
      : mediaInfo?.url || "/api/placeholder/1280/720";

  useEffect(() => {
    // A thumbnail requested early in processing may not have existed yet.
    setFailedThumbnailUrl(null);
  }, [playbackRevision]);

  useEffect(() => {
    if (!previewFile) {
      setPreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(previewFile);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [previewFile]);

  useEffect(() => {
    if (
      !courseSlug ||
      !lessonNumber ||
      contentType !== "video" ||
      previewFile
    ) {
      setPlaybackBootstrap(null);
      return;
    }

    let active = true;
    setPlaybackBootstrap(null);
    void getVideoPlaybackBootstrap({
      courseSlug,
      lessonNumber,
      mediaId: mediaInfo?.id,
    })
      .then((bootstrap) => {
        if (active) setPlaybackBootstrap(bootstrap);
      })
      .catch(() => {
        // Keep the shared player mounted if protected preview access is unavailable.
        if (active) setPlaybackBootstrap(null);
      });

    return () => {
      active = false;
    };
  }, [
    contentType,
    courseSlug,
    lessonNumber,
    mediaInfo?.id,
    playbackRevision,
    previewFile,
  ]);

  const refreshPlaybackToken = useCallback((): Promise<VideoPlaybackToken> => {
    if (!courseSlug || !lessonNumber) {
      return Promise.reject(
        new Error("A course lesson is required for playback."),
      );
    }
    return refreshVideoPlaybackToken({ courseSlug, lessonNumber });
  }, [courseSlug, lessonNumber]);

  // Attached lessons play from their playback bootstrap manifest. Until it
  // loads, the player shows the lesson thumbnail rather than any other video.
  // The player takes `fileName` as the video's identity: a new one is another
  // video, loaded from the start. So it names the media and never the lesson
  // title, a draft that changes with every key pressed.
  const videoMedia = useMemo<CourseVideo>(
    () => ({
      fileName:
        previewFile?.name ||
        mediaInfo?.name ||
        mediaInfo?.id ||
        mediaInfo?.url ||
        "",
      duration: mediaInfo?.durationSeconds || 0,
      src: previewUrl || mediaInfo?.url || "",
      thumbnailSrc: previewUrl
        ? undefined
        : mediaInfo?.thumbnailUrl || undefined,
    }),
    [
      mediaInfo?.durationSeconds,
      mediaInfo?.id,
      mediaInfo?.name,
      mediaInfo?.thumbnailUrl,
      mediaInfo?.url,
      previewFile?.name,
      previewUrl,
    ],
  );

  const hasMediaAttached = Boolean(
    mediaInfo?.url || mediaInfo?.id || mediaInfo?.name,
  );
  const hasVideoPreview = Boolean(previewUrl) && contentType === "video";
  const hasPendingVideoPreview =
    Boolean(previewFile) && contentType === "video";
  const hasVideoSource = hasMediaAttached || hasVideoPreview;
  const hasVideoStage = hasVideoSource || hasPendingVideoPreview;
  const isAttachedVideo = hasMediaAttached && contentType === "video";
  const isGroupedVideo =
    contentType === "video" &&
    (isAttachedVideo || (hasVideoStage && Boolean(videoUploadSection)));
  const thumbnailUrl =
    mediaInfo?.thumbnailUrl && mediaInfo.thumbnailUrl !== failedThumbnailUrl
      ? mediaInfo.thumbnailUrl
      : null;
  const hasPersistedThumbnail = Boolean(thumbnailUrl);

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (secs?: number) => {
    if (!secs || secs <= 0) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const applyThumbnail = useCallback(
    (file: File) => {
      if (disabled || !isImageFile(file)) return;
      setThumbnailPreviewFile(file);
      void onUploadThumbnail?.(file);
    },
    [disabled, onUploadThumbnail],
  );

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && onUploadFile) submitFile(file);
  };

  const handleCardDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleCardDrop = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const file =
      e.dataTransfer.files?.[0] ||
      (e.dataTransfer.items
        ? Array.from(e.dataTransfer.items)
            .find((item) => item.kind === "file")
            ?.getAsFile()
        : null);
    if (!file) return;
    if (isVideoFile(file)) {
      submitFile(file);
      return;
    }
    if (isImageFile(file)) {
      applyThumbnail(file);
    }
  };

  const handleChooseFile = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const getAcceptType = () => lessonContentAccept(contentType);

  // A document is a PDF or text written here: which one is being made.
  const documentModeSwitch = (
    <div
      role="radiogroup"
      aria-label="How to make this document"
      className="grid grid-cols-2 gap-1 rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-1"
    >
      {(
        [
          ["pdf", "Upload PDF", CloudArrowUp],
          ["text", "Write text", FileText],
        ] as const
      ).map(([mode, label, Icon]) => {
        const active = documentMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled && mode === "pdf"}
            onClick={() => setDocumentMode(mode)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] text-[0.80rem] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-shadow)"
                : "text-(--muted) hover:text-(--text)"
            }`}
          >
            <Icon size={15} weight={active ? "fill" : "bold"} />
            {label}
          </button>
        );
      })}
    </div>
  );

  const videoPlayer =
    hasVideoStage && contentType === "video" ? (
      <div
        className={`relative aspect-video w-full overflow-hidden bg-black ${
          isGroupedVideo
            ? "rounded-none shadow-none"
            : "rounded-[14px] shadow-(--card-shadow)"
        }`}
      >
        {videoPreviewUnavailableText && !previewFile && hasMediaAttached ? (
          <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40"
                onError={() => setFailedThumbnailUrl(thumbnailUrl)}
              />
            ) : null}
            <Video size={30} weight="fill" className="relative text-blue-400" />
            <p className="relative m-0 max-w-xs text-[0.82rem] font-semibold text-white">
              {videoPreviewUnavailableText}
            </p>
          </div>
        ) : hasVideoSource && (!hasPendingVideoPreview || previewUrl) ? (
          <LessonVideoPlayer
            media={videoMedia}
            lessonTitle={lessonTitle}
            resumePersistenceKey={previewUrl || undefined}
            playbackBootstrap={playbackBootstrap}
            refreshPlaybackToken={refreshPlaybackToken}
            protectedPlayback={false}
            showAutoplayControl={false}
            showCompletionOverlay={false}
            circularSettingsControl
            showLessonNavigation={false}
            playbackSuspended={playbackSuspended}
            theaterMode={false}
            onTheaterToggle={() => {}}
          />
        ) : (
          <div className="h-full w-full bg-black" aria-hidden="true" />
        )}
      </div>
    ) : null;

  return (
    <div className="flex min-w-0 w-full flex-1 flex-col gap-4">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptType()}
        aria-label="Upload lesson media"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (file && onUploadFile) submitFile(file);
        }}
      />
      <input
        ref={thumbnailInputRef}
        type="file"
        accept="image/*"
        aria-label="Upload custom thumbnail"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (file) applyThumbnail(file);
        }}
      />

      <div
        className={
          isGroupedVideo
            ? "overflow-hidden rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) shadow-(--card-shadow)"
            : "contents"
        }
        onDragOverCapture={isGroupedVideo ? handleCardDragOver : undefined}
        onDropCapture={isGroupedVideo ? handleCardDrop : undefined}
      >
        {/* 1. Main 16:9 Workspace (Player or Empty Dropzone) */}
        {contentType === "video" && videoUploadSection ? (
          <>
            <div className="contents">{videoPlayer}</div>
            <div className="contents">{videoUploadSection}</div>
          </>
        ) : hasVideoStage ? (
          contentType === "video" ? (
            videoPlayer
          ) : contentType === "audio" ? (
            <LessonAudioPlayer
              title={mediaInfo?.name?.replace(/\.[^/.]+$/, "") || lessonTitle}
              subtitle={courseTitle}
              audioUrl={
                previewUrl ?? audioPreview?.url ?? mediaInfo?.url ?? null
              }
              durationSeconds={mediaInfo?.durationSeconds}
              thumbnailUrl={mediaInfo?.thumbnailUrl}
              onRetry={() => setAudioAttempt((attempt) => attempt + 1)}
              unavailableText={
                audioPreview?.failed ? "This audio could not be loaded." : null
              }
            />
          ) : contentType === "image" ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-black shadow-(--card-shadow)">
              {imagePreviewSrc ? (
                <img
                  src={imagePreviewSrc}
                  srcSet={imageVariantSrcSet}
                  sizes="(max-width: 820px) calc(100vw - 2rem), 640px"
                  alt="Lesson Content Preview"
                  width={imageVariantManifest?.width ?? 1280}
                  height={imageVariantManifest?.height ?? 720}
                  decoding="async"
                  className="h-full w-full object-contain"
                />
              ) : null}
            </div>
          ) : showDocumentPreview && documentPreview ? (
            <div className="relative max-h-[640px] w-full overflow-y-auto rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface,var(--surface)) p-3 shadow-(--card-shadow) sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="m-0 text-[0.80rem] font-bold text-(--text)">
                  As students see it
                </p>
                <button
                  type="button"
                  onClick={() => setShowDocumentPreview(false)}
                  aria-label="Close preview"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-(--muted) hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) cursor-pointer"
                >
                  <X size={15} weight="bold" />
                </button>
              </div>
              {documentPreview}
            </div>
          ) : (
            <div className="relative flex aspect-video w-full flex-col items-center justify-center rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--accent)_14%,var(--surface))_0%,_var(--canvas)_100%)] p-6 text-center shadow-(--card-shadow)">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500 shadow-md">
                <FileText size={36} weight="fill" />
              </div>
              <h4 className="m-0 mt-3 text-base font-bold text-(--text)">
                {mediaInfo?.name || "Document Preview"}
              </h4>
              <p className="m-0 mt-1 text-xs text-(--muted)">
                {[formatFileSize(mediaInfo?.sizeBytes), "PDF"]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
              {documentPreview ? (
                <button
                  type="button"
                  onClick={() => setShowDocumentPreview(true)}
                  className="mt-4 inline-flex h-8.5 items-center justify-center gap-1.5 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] px-3.5 text-[0.76rem] font-semibold text-(--text) shadow-sm transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-95 cursor-pointer"
                >
                  <Eye size={15} weight="bold" />
                  <span>Preview as students see it</span>
                </button>
              ) : (
                <p className="m-0 mt-3 text-[0.72rem] text-(--muted)">
                  Save the lesson as Doc to preview it as students see it.
                </p>
              )}
            </div>
          )
        ) : contentType === "video" && videoUploadSection ? (
          videoUploadSection
        ) : contentType === "document" &&
          readingEditor &&
          documentMode === "text" ? (
          <div className="flex flex-col gap-3">
            {documentModeSwitch}
            {readingEditor}
          </div>
        ) : (
          /* Empty State Dropzone */
          <div
            className={
              contentType === "document" && readingEditor
                ? "flex flex-col gap-3"
                : "contents"
            }
          >
            {contentType === "document" && readingEditor
              ? documentModeSwitch
              : null}
            <LessonUploadDropzone
              title={
                contentType === "video"
                  ? "Drag and drop your video here"
                  : contentType === "audio"
                    ? "Drag and drop your audio here"
                    : contentType === "image"
                      ? "Drag and drop your image here"
                      : "Drag and drop your document here"
              }
              supportText={
                contentType === "video"
                  ? "Supports MP4, WebM, MOV."
                  : contentType === "audio"
                    ? "Supports MP3, M4A, AAC, WAV, OGG."
                    : contentType === "image"
                      ? "Supports JPG, PNG, WebP, GIF."
                      : "PDF, up to 50 MB. Students read it in the lesson page."
              }
              isDragging={isDragOver}
              disabled={disabled}
              ariaLabel={`${contentType} upload dropzone`}
              onChooseFile={handleChooseFile}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFileDrop}
            />
          </div>
        )}

        {/* 2. Media Settings Card (Video Settings, Audio Settings, etc.) */}
        {/* Writing a reading, there is no file to describe. */}
        {!(
          contentType === "document" &&
          readingEditor &&
          documentMode === "text" &&
          !hasMediaAttached
        ) &&
          (contentType !== "video" ||
            (isAttachedVideo && !hasVideoPreview) ||
            !videoUploadSection) && (
            <div
              className={`flex flex-col ${
                isGroupedVideo
                  ? "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5"
                  : "rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5 shadow-(--card-shadow)"
              }`}
            >
              {!isGroupedVideo ? (
                <h4 className="m-0 text-[0.84rem] sm:text-[0.88rem] font-bold text-(--text)">
                  {contentType === "video"
                    ? "Video Settings"
                    : contentType === "audio"
                      ? "Audio Settings"
                      : contentType === "image"
                        ? "Image Settings"
                        : "Document Settings"}
                </h4>
              ) : null}

              <div
                className={`flex items-center justify-between gap-3 ${
                  isGroupedVideo
                    ? "mt-0 rounded-none border-0 bg-transparent p-0"
                    : "mt-3 rounded-[10px] sm:rounded-[12px] border border-[color-mix(in_srgb,var(--text)_6%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-2.5 sm:p-3"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {/* Square Icon / Thumbnail */}
                  <div
                    className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-[8px] sm:rounded-[10px] ${
                      contentType === "video"
                        ? "bg-blue-500/15 text-blue-500"
                        : contentType === "audio"
                          ? "bg-rose-500/15 text-rose-500"
                          : contentType === "image"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-amber-500/15 text-amber-500"
                    }`}
                  >
                    {contentType === "video" ? (
                      <Video size={20} weight="fill" />
                    ) : contentType === "audio" ? (
                      <MusicNotes size={20} weight="fill" />
                    ) : contentType === "image" ? (
                      <Image size={20} weight="fill" />
                    ) : (
                      <FileText size={20} weight="fill" />
                    )}
                  </div>

                  {/* File Info / Empty info */}
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[0.82rem] sm:text-[0.86rem] font-bold text-(--text)">
                      {hasMediaAttached
                        ? mediaInfo?.name ||
                          `${contentType[0]!.toUpperCase()}${contentType.slice(1)} attached`
                        : `No ${contentType} uploaded yet`}
                    </p>
                    <p className="m-0 mt-0.5 truncate text-[0.70rem] sm:text-[0.74rem] text-(--muted)">
                      {hasMediaAttached ? (
                        <span>
                          {[
                            formatFileSize(mediaInfo?.sizeBytes),
                            mediaInfo?.dimensions,
                            formatDuration(mediaInfo?.durationSeconds),
                          ]
                            .filter(Boolean)
                            .join(" • ") || "Ready for students"}
                        </span>
                      ) : (
                        `Upload a ${contentType} file to get started.`
                      )}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                {hasMediaAttached && confirmingRemove ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="hidden text-[0.74rem] text-(--muted) sm:inline">
                      Remove from lesson?
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setConfirmingRemove(false)}
                      className="inline-flex h-8.5 items-center justify-center rounded-[9px] px-3 text-[0.76rem] font-semibold text-(--muted) hover:text-(--text) cursor-pointer"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setConfirmingRemove(false);
                        void onRemoveMedia?.();
                      }}
                      className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-[9px] bg-red-500/12 px-3 text-[0.76rem] font-semibold text-red-500 hover:bg-red-500/20 cursor-pointer"
                    >
                      <Trash size={14} weight="bold" />
                      Remove
                    </button>
                  </div>
                ) : (
                  hasMediaAttached && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {onRemoveMedia ? (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setConfirmingRemove(true)}
                          aria-label={`Remove ${contentType === "document" ? "document" : contentType} from lesson`}
                          title="Remove from lesson (stays in your library)"
                          className="flex h-8.5 w-8.5 items-center justify-center rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-(--muted) transition-colors hover:border-red-500/40 hover:text-red-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash size={15} weight="bold" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={handleChooseFile}
                        className="inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] px-3.5 text-[0.76rem] font-semibold text-(--text) shadow-sm transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-95 cursor-pointer whitespace-nowrap"
                      >
                        <CloudArrowUp size={15} weight="bold" />
                        <span>
                          {contentType === "video"
                            ? "Change Video"
                            : contentType === "audio"
                              ? "Change Audio"
                              : contentType === "image"
                                ? "Change Image"
                                : "Change Document"}
                        </span>
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

        {/* 3. Secondary Card (Thumbnail Card for Video/Audio, or Guidelines for Image/Doc) */}
        {contentType === "video" || contentType === "audio" ? (
          <div
            className={`flex flex-col ${
              isGroupedVideo
                ? "rounded-b-[14px] sm:rounded-b-[16px] border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5"
                : "rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5 shadow-(--card-shadow)"
            }`}
          >
            {!isGroupedVideo ? (
              <h4 className="m-0 text-[0.84rem] sm:text-[0.88rem] font-bold text-(--text)">
                Thumbnail
              </h4>
            ) : null}

            <div
              className={`flex items-center justify-between gap-3 ${
                isGroupedVideo
                  ? "mt-0 rounded-none border-0 bg-transparent p-0"
                  : "mt-3 rounded-[10px] sm:rounded-[12px] border border-[color-mix(in_srgb,var(--text)_6%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_50%,var(--surface))] p-2.5 sm:p-3"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex h-10 w-14 sm:h-11 sm:w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[radial-gradient(ellipse_at_center,_#1e1b4b_0%,_#09090b_100%)]">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt="Current thumbnail"
                      className="h-full w-full object-cover"
                      onError={() => setFailedThumbnailUrl(thumbnailUrl)}
                    />
                  ) : contentType === "audio" ? (
                    <Headphones
                      size={20}
                      weight="fill"
                      className="text-rose-400"
                    />
                  ) : (
                    <Video size={20} weight="fill" className="text-blue-400" />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="m-0 truncate text-[0.82rem] sm:text-[0.86rem] font-bold text-(--text)">
                    {hasPersistedThumbnail
                      ? "Current thumbnail"
                      : "No thumbnail"}
                  </p>
                  <p className="m-0 mt-0.5 truncate text-[0.70rem] sm:text-[0.74rem] text-(--muted)">
                    Recommended size: 1280 × 720
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={() => thumbnailInputRef.current?.click()}
                className="inline-flex h-8.5 shrink-0 items-center justify-center gap-1.5 rounded-[9px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_7%,var(--surface))] px-3.5 text-[0.76rem] font-semibold text-(--text) shadow-sm transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <Image size={15} weight="bold" />
                <span>
                  {hasPersistedThumbnail || thumbnailPreviewFile
                    ? "Change Thumbnail"
                    : "Add Thumbnail"}
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* Image or Document Guidelines */
          <ElevatedCard as="div" className="flex flex-col p-4 sm:p-4.5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-(--text)">
                {contentType === "image" ? (
                  <Image size={19} weight="fill" />
                ) : (
                  <FileText size={19} weight="fill" />
                )}
              </div>
              <div>
                <h4 className="m-0 text-[0.84rem] sm:text-[0.88rem] font-bold text-(--text)">
                  {contentType === "image"
                    ? "Image Guidelines"
                    : "Document Guidelines"}
                </h4>
                <p className="m-0 mt-1 text-[0.74rem] sm:text-[0.78rem] text-(--muted) leading-relaxed">
                  {contentType === "image"
                    ? "For best results, use a 16:9 ratio. Supported formats: JPG, PNG, WebP."
                    : "Upload a PDF (up to 50 MB), or write the reading with the formatting toolbar. Word files: export them as PDF first."}
                </p>
              </div>
            </div>
          </ElevatedCard>
        )}
      </div>
    </div>
  );
}
