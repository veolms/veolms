import {
  CloudArrowUpIcon as CloudArrowUp,
  FileTextIcon as FileText,
  HeadphonesIcon as Headphones,
  ImageIcon as Image,
  InfoIcon as Info,
  MusicNotesIcon as MusicNotes,
  PlayCircleIcon as PlayCircle,
  PlayIcon as Play,
  PuzzlePieceIcon as PuzzlePiece,
  UploadSimpleIcon as UploadSimple,
  VideoIcon as Video,
  XIcon as X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { LessonAudioPlayer } from "./LessonAudioPlayer";
import type { StudioLessonContentType } from "./LessonContentTypeSelector";
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
  resolveCourseHlsSrc,
  resolveCourseVideoThumbnailSrc,
} from "../../learning/courseContent";

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

export interface LessonMediaWorkspaceProps {
  contentType: StudioLessonContentType;
  lessonTitle: string;
  lessonNumber?: number;
  courseSlug?: string;
  courseTitle?: string;
  mediaInfo?: AttachedMediaInfo | null;
  previewFile?: File | null;
  disabled?: boolean;
  onUploadFile?: (file: File) => void | Promise<void>;
  onChangeVideoClick?: () => void;
  videoUploadSection?: ReactNode;
  onUploadThumbnail?: (file: File) => void | Promise<void>;
  descriptionSection?: ReactNode;
  quizSection?: ReactNode;
  playbackSuspended?: boolean;
}

export function LessonMediaWorkspace({
  contentType,
  lessonTitle,
  lessonNumber,
  courseSlug,
  courseTitle = "Web Development Course for Absolute Beginners",
  mediaInfo,
  previewFile = null,
  disabled = false,
  onUploadFile,
  onChangeVideoClick,
  videoUploadSection,
  onUploadThumbnail,
  descriptionSection,
  quizSection,
  playbackSuspended = false,
}: LessonMediaWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<"media" | "description" | "quiz">("media");
  const [playbackBootstrap, setPlaybackBootstrap] =
    useState<VideoPlaybackBootstrap | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    if (!courseSlug || !lessonNumber || contentType !== "video" || previewFile) {
      setPlaybackBootstrap(null);
      return;
    }

    let active = true;
    setPlaybackBootstrap(null);
    void getVideoPlaybackBootstrap({ courseSlug, lessonNumber })
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
  }, [contentType, courseSlug, lessonNumber, mediaInfo?.id, previewFile]);

  const refreshPlaybackToken = useCallback((): Promise<VideoPlaybackToken> => {
    if (!courseSlug || !lessonNumber) {
      return Promise.reject(new Error("A course lesson is required for playback."));
    }
    return refreshVideoPlaybackToken({ courseSlug, lessonNumber });
  }, [courseSlug, lessonNumber]);

  const videoMedia = useMemo<CourseVideo>(() => {
    const fileName =
      previewFile?.name ||
      mediaInfo?.name ||
      "The Complete JavaScript Course Trailer.mp4";

    return {
      fileName,
      duration: mediaInfo?.durationSeconds || 754,
      src:
        previewUrl ||
        mediaInfo?.url ||
        resolveCourseHlsSrc("The Complete JavaScript Course Trailer.mp4"),
      thumbnailSrc:
        mediaInfo?.thumbnailUrl ||
        resolveCourseVideoThumbnailSrc("The Complete JavaScript Course Trailer.mp4"),
    };
  }, [
    mediaInfo?.durationSeconds,
    mediaInfo?.name,
    mediaInfo?.thumbnailUrl,
    mediaInfo?.url,
    previewFile?.name,
    previewUrl,
  ]);

  const hasMediaAttached = Boolean(mediaInfo?.url || mediaInfo?.id || mediaInfo?.name);
  const hasVideoPreview = Boolean(previewUrl) && contentType === "video";
  const hasVideoSource = hasMediaAttached || hasVideoPreview;
  const isAttachedVideo = hasMediaAttached && contentType === "video";
  const isGroupedVideo =
    contentType === "video" &&
    (isAttachedVideo || (hasVideoSource && Boolean(videoUploadSection)));

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "0 MB";
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (secs?: number) => {
    if (!secs || secs <= 0) return "12:34";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && onUploadFile) {
      void onUploadFile(file);
    }
  };

  const handleChooseFile = () => {
    if (disabled) return;
    if (contentType === "video" && onChangeVideoClick) {
      onChangeVideoClick();
      return;
    }
    fileInputRef.current?.click();
  };

  const getAcceptType = () => {
    switch (contentType) {
      case "video":
        return "video/*";
      case "audio":
        return "audio/*";
      case "image":
        return "image/*";
      case "document":
        return ".pdf,.doc,.docx,.txt";
      default:
        return "*/*";
    }
  };

  const videoPlayer = hasVideoSource && contentType === "video" ? (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-black ${
        isGroupedVideo
          ? "rounded-t-[14px] sm:rounded-t-[16px] rounded-b-none shadow-none"
          : "rounded-[14px] shadow-(--card-shadow)"
      }`}
    >
      <LessonVideoPlayer
        media={videoMedia}
        lessonTitle={lessonTitle}
        resumePersistenceKey={previewUrl || undefined}
        playbackBootstrap={hasVideoPreview ? null : playbackBootstrap}
        refreshPlaybackToken={refreshPlaybackToken}
        protectedPlayback={Boolean(courseSlug) && !hasVideoPreview}
        showAutoplayControl={false}
        circularSettingsControl
        showLessonNavigation={false}
        playbackSuspended={playbackSuspended}
        theaterMode={false}
        onTheaterToggle={() => {}}
      />
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
          if (file && onUploadFile) {
            void onUploadFile(file);
          }
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
          if (file && onUploadThumbnail) {
            void onUploadThumbnail(file);
          }
        }}
      />

      <div
        className={
          isGroupedVideo
            ? "overflow-hidden rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) shadow-(--card-shadow)"
            : "contents"
        }
      >

      {/* 1. Main 16:9 Workspace (Player or Empty Dropzone) */}
      {contentType === "video" && videoUploadSection ? (
        <>
          <div className="contents">{videoPlayer}</div>
          <div className="contents">{videoUploadSection}</div>
        </>
      ) : hasVideoSource ? (
        contentType === "video" ? (
          videoPlayer
        ) : contentType === "audio" ? (
          <LessonAudioPlayer
            title={mediaInfo?.name?.replace(/\.[^/.]+$/, "") || lessonTitle}
            subtitle={courseTitle}
            audioUrl={mediaInfo?.url}
            durationSeconds={mediaInfo?.durationSeconds}
            thumbnailUrl={mediaInfo?.thumbnailUrl}
          />
        ) : contentType === "image" ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-[16px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-black shadow-(--card-shadow)">
            <img
              src={mediaInfo?.url || "/api/placeholder/1280/720"}
              alt="Lesson Content Preview"
              className="h-full w-full object-contain"
            />
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
              {formatFileSize(mediaInfo?.sizeBytes)} • Ready for students
            </p>
          </div>
        )
      ) : contentType === "video" && videoUploadSection ? (
        videoUploadSection
      ) : (
        /* Empty State Dropzone */
        <div
          onClick={handleChooseFile}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleFileDrop}
          className={`group relative flex aspect-video w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[16px] border-2 border-dashed p-6 text-center transition-all duration-200 ${
            isDragOver
              ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] shadow-[0_0_24px_var(--accent-shadow)]"
              : "border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-[linear-gradient(155deg,color-mix(in_srgb,var(--canvas)_80%,var(--surface))_0%,color-mix(in_srgb,var(--surface)_65%,var(--canvas))_100%)] shadow-(--card-shadow) hover:border-[color-mix(in_srgb,var(--text)_25%,transparent)] hover:bg-[color-mix(in_srgb,var(--surface)_95%,var(--hover))]"
          }`}
        >
          {/* Subtle Background Art for Audio/Image/Doc/Video */}
          {contentType === "audio" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-15">
              <div className="flex h-20 items-end gap-1.5">
                {[15, 25, 45, 30, 60, 40, 80, 50, 70, 35, 20].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className="w-1.5 rounded-full bg-rose-500"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Centered Glowing Icon */}
          <div
            className={`relative mb-3 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl shadow-lg transition-transform duration-200 group-hover:scale-105 ${
              contentType === "video"
                ? "bg-blue-500/15 text-blue-500 shadow-blue-500/20"
                : contentType === "audio"
                  ? "bg-rose-500/15 text-rose-500 shadow-rose-500/20"
                  : contentType === "image"
                    ? "bg-emerald-500/15 text-emerald-500 shadow-emerald-500/20"
                    : "bg-amber-500/15 text-amber-500 shadow-amber-500/20"
            }`}
          >
            {contentType === "video" ? (
              <Play size={28} weight="fill" className="ml-0.5" />
            ) : contentType === "audio" ? (
              <Headphones size={28} weight="fill" />
            ) : contentType === "image" ? (
              <Image size={28} weight="fill" />
            ) : (
              <FileText size={28} weight="fill" />
            )}
          </div>

          <p className="m-0 text-[0.94rem] sm:text-[1.02rem] font-bold text-(--text)">
            {contentType === "video"
              ? "Drag and drop a video file here"
              : contentType === "audio"
                ? "Drag and drop an audio file here"
                : contentType === "image"
                  ? "Drag and drop an image here"
                  : "Drag and drop a document here"}
          </p>
          <p className="m-0 mt-1 text-[0.80rem] sm:text-[0.84rem] text-(--accent) font-medium group-hover:underline">
            or click to browse
          </p>
          <p className="m-0 mt-2 text-[0.72rem] sm:text-[0.74rem] text-(--muted)">
            {contentType === "video"
              ? "Supports MP4, WebM, MOV (max 2 GB)."
              : contentType === "audio"
                ? "Supports MP3, WAV, M4A, OGG (max 500 MB)."
                : contentType === "image"
                  ? "Supports JPG, PNG, WebP (max 5 MB)."
                  : "Supports PDF, DOC, DOCX, TXT (max 100 MB)."}
          </p>
        </div>
      )}

      {/* 2. Media Settings Card (Video Settings, Audio Settings, etc.) */}
      {(contentType !== "video" || isAttachedVideo || !videoUploadSection) && (
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
              {hasMediaAttached ? (
                mediaInfo?.thumbnailUrl ? (
                  <img
                    src={mediaInfo.thumbnailUrl}
                    alt="File thumbnail"
                    className="h-full w-full rounded-[8px] object-cover"
                  />
                ) : contentType === "video" ? (
                  <Video size={20} weight="fill" />
                ) : contentType === "audio" ? (
                  <MusicNotes size={20} weight="fill" />
                ) : contentType === "image" ? (
                  <Image size={20} weight="fill" />
                ) : (
                  <FileText size={20} weight="fill" />
                )
              ) : contentType === "video" ? (
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
                  ? mediaInfo?.name || `intro-to-web-dev.${contentType === "video" ? "mp4" : contentType === "audio" ? "mp3" : contentType === "image" ? "png" : "pdf"}`
                  : `No ${contentType} uploaded yet`}
              </p>
              <p className="m-0 mt-0.5 truncate text-[0.70rem] sm:text-[0.74rem] text-(--muted)">
                {hasMediaAttached ? (
                  <span>
                    {formatFileSize(mediaInfo?.sizeBytes || 128 * 1024 * 1024)}
                    {mediaInfo?.dimensions ? ` • ${mediaInfo.dimensions}` : contentType === "video" || contentType === "image" ? " • 1920 × 1080" : ""}
                    {contentType === "video" || contentType === "audio" ? ` • ${formatDuration(mediaInfo?.durationSeconds)}` : ""}
                    {contentType === "audio" ? " • .mp3" : ""}
                  </span>
                ) : (
                  `Upload a ${contentType} file to get started.`
                )}
              </p>
            </div>
          </div>

          {/* Action Button */}
          {hasMediaAttached && (
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
          )}
        </div>
      </div>
      )}

      {/* 3. Secondary Card (Thumbnail Card for Video/Audio, or Guidelines for Image/Doc) */}
      {contentType === "video" || contentType === "audio" ? (
        <div
          className={`flex flex-col ${
            isGroupedVideo
              ? "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5"
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
                {mediaInfo?.thumbnailUrl ? (
                  <img
                    src={mediaInfo.thumbnailUrl}
                    alt="Current thumbnail"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Headphones size={20} weight="fill" className="text-purple-400" />
                )}
              </div>

              <div className="min-w-0">
                <p className="m-0 truncate text-[0.82rem] sm:text-[0.86rem] font-bold text-(--text)">
                  Current thumbnail
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
              <span>Change Thumbnail</span>
            </button>
          </div>
        </div>
      ) : (
        /* Image or Document Guidelines */
        <div className="flex flex-col rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-4.5 shadow-(--card-shadow)">
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
                {contentType === "image" ? "Image Guidelines" : "Document Guidelines"}
              </h4>
              <p className="m-0 mt-1 text-[0.74rem] sm:text-[0.78rem] text-(--muted) leading-relaxed">
                {contentType === "image"
                  ? "For best results, use a 16:9 ratio. Supported formats: JPG, PNG, WebP (max 5 MB)."
                  : "Supported formats: PDF, DOC, DOCX, TXT. PDF is recommended for native in-browser reading."}
              </p>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* 4. Integrated Accordion Tabs for Lesson Description & Quiz Assessment */}
      {(descriptionSection || quizSection) && (
        <div className="mt-1 flex w-full flex-col rounded-[14px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface,var(--surface)) shadow-(--card-shadow) overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3">
            {descriptionSection && (
              <button
                type="button"
                onClick={() =>
                  setActiveTab((prev) => (prev === "description" ? "media" : "description"))
                }
                className={`flex items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] sm:text-[0.82rem] font-bold cursor-pointer transition-colors ${
                  activeTab === "description"
                    ? "border-(--accent) text-(--accent)"
                    : "border-transparent text-(--muted) hover:text-(--text)"
                }`}
              >
                <FileText size={15} weight="bold" />
                <span>Description</span>
              </button>
            )}

            {quizSection && (
              <button
                type="button"
                onClick={() =>
                  setActiveTab((prev) => (prev === "quiz" ? "media" : "quiz"))
                }
                className={`flex items-center gap-1.5 !rounded-none border-b-2 px-3.5 py-2.5 text-[0.80rem] sm:text-[0.82rem] font-bold cursor-pointer transition-colors ${
                  activeTab === "quiz"
                    ? "border-(--accent) text-(--accent)"
                    : "border-transparent text-(--muted) hover:text-(--text)"
                }`}
              >
                <PuzzlePiece size={15} weight="fill" />
                <span>Quiz Assessment</span>
              </button>
            )}

          </div>

          {/* Tab Content */}
          <div className="w-full p-4">
            {activeTab === "description" && descriptionSection}
            {activeTab === "quiz" && quizSection}
            {activeTab === "media" && (
              <p className="m-0 text-xs text-(--muted) italic">
                Click a tab above to edit the lesson description or attach a quiz assessment.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
