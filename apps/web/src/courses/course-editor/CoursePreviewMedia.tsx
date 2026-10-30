import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, LazyExoticComponent } from "react";
import type { VideoEngine } from "@veolms/video-player";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { ImageIcon } from "@phosphor-icons/react/Image";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { VideoCameraIcon as VideoCamera } from "@phosphor-icons/react/VideoCamera";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import type { LessonVideoUploadHandle } from "../lesson-video-upload/LessonVideoUpload";

export interface CoursePreviewMediaProps {
  courseId: string | null;
  /** Locked while the course is not saved yet, or basics are saving. */
  disabled: boolean;
  thumbnail: string | null;
  isThumbnailBusy: boolean;
  thumbnailUploadError: string | null;
  triggerThumbnailUpload: () => void;
  /** Uploads and saves an image as the thumbnail (a dropped file). */
  uploadThumbnailFile: (file: File) => Promise<void>;
  trailerMediaId: string | null | undefined;
  LessonVideoUpload: LazyExoticComponent<
    typeof import("../lesson-video-upload/LessonVideoUpload").LessonVideoUpload
  >;
  handleTrailerMediaAttached: (mediaAssetId: string) => Promise<boolean>;
  onTrailerProcessed: () => void;
  handleRemoveTrailer: () => Promise<void>;
}

/** The dark glass the buttons over the picture wear, in either theme. */
const overlayButtonClasses =
  "absolute top-2 z-20 inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-none bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * The course preview's picture, where the thumbnail and the trailer are both
 * set. The thumbnail is the picture; with a trailer it carries a play button
 * that plays the trailer in its place. The ⋯ menu in its corner replaces the
 * thumbnail (which is required, so it is never removed) and adds, replaces
 * or removes the trailer. An image dropped on it becomes the thumbnail, a
 * video the trailer.
 */
export function CoursePreviewMedia({
  courseId,
  disabled,
  thumbnail,
  isThumbnailBusy,
  thumbnailUploadError,
  triggerThumbnailUpload,
  uploadThumbnailFile,
  trailerMediaId,
  LessonVideoUpload,
  handleTrailerMediaAttached,
  onTrailerProcessed,
  handleRemoveTrailer,
}: CoursePreviewMediaProps) {
  const [playing, setPlaying] = useState(false);
  const [removingTrailer, setRemovingTrailer] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const trailerUploadRef = useRef<LessonVideoUploadHandle | null>(null);
  // A trailer picked in this session plays from the file at once, before
  // the saved copy has been processed.
  const [localTrailerUrl, setLocalTrailerUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (localTrailerUrl) URL.revokeObjectURL(localTrailerUrl);
    },
    [localTrailerUrl],
  );

  // The uploader reports its file again whenever this callback changes, and
  // reports none once the upload is attached or given up: so the callback
  // is stable, a repeat is ignored, and a file that was attached keeps
  // playing from disk while the saved copy is processed.
  const previewFileRef = useRef<File | null>(null);
  const keepLocalTrailerRef = useRef(false);
  const previewTrailerFile = useCallback((file: File | null) => {
    if (file === previewFileRef.current) return;
    previewFileRef.current = file;
    if (file) {
      keepLocalTrailerRef.current = false;
      setPlaying(false);
      setLocalTrailerUrl(URL.createObjectURL(file));
    } else if (!keepLocalTrailerRef.current) {
      setPlaying(false);
      setLocalTrailerUrl(null);
    }
  }, []);
  const attachTrailer = async (mediaAssetId: string) => {
    const attached = await handleTrailerMediaAttached(mediaAssetId);
    if (attached) keepLocalTrailerRef.current = true;
    return attached;
  };

  const hasTrailer = Boolean(trailerMediaId || localTrailerUrl);
  const thumbnailLocked = disabled || isThumbnailBusy;
  const trailerLocked = disabled || !courseId || removingTrailer;
  const canUploadThumbnail = !thumbnail && !thumbnailLocked;

  const removeTrailer = async () => {
    setPlaying(false);
    setRemovingTrailer(true);
    try {
      await handleRemoveTrailer();
      keepLocalTrailerRef.current = false;
      setLocalTrailerUrl(null);
    } finally {
      setRemovingTrailer(false);
    }
  };

  const acceptsDrop = (event: DragEvent) =>
    !disabled && event.dataTransfer.types.includes("Files");

  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptsDrop(event)) return;
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const type = file.type.toLowerCase();
    if (type.startsWith("image/")) {
      if (thumbnailLocked) return;
      setDropError(null);
      void uploadThumbnailFile(file);
    } else if (type.startsWith("video/")) {
      if (trailerLocked) return;
      setDropError(null);
      trailerUploadRef.current?.open(file);
    } else {
      setDropError(
        "Drop an image for the thumbnail or a video for the trailer.",
      );
    }
  };

  return (
    <div>
      <div
        className={`relative aspect-video overflow-hidden rounded-[10px] border border-dashed bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] transition-[border-color,background-color] duration-180 ease-out ${
          dragging
            ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
            : "border-[color-mix(in_srgb,var(--text)_14%,transparent)]"
        } ${
          canUploadThumbnail
            ? "cursor-pointer hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]"
            : ""
        }`}
        onClick={canUploadThumbnail ? triggerThumbnailUpload : undefined}
        title={canUploadThumbnail ? "Click to upload thumbnail" : undefined}
        role={canUploadThumbnail ? "button" : undefined}
        tabIndex={canUploadThumbnail ? 0 : undefined}
        onKeyDown={
          canUploadThumbnail
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  triggerThumbnailUpload();
                }
              }
            : undefined
        }
        onDragEnter={(event) => {
          if (!acceptsDrop(event)) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (!acceptsDrop(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (
            event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            return;
          }
          setDragging(false);
        }}
        onDrop={dropFile}
      >
        {playing && hasTrailer ? (
          <>
            <TrailerVideo
              courseId={courseId}
              localUrl={localTrailerUrl}
              poster={thumbnail}
            />
            <button
              type="button"
              className={`${overlayButtonClasses} left-2`}
              onClick={() => setPlaying(false)}
              aria-label="Close trailer"
              title="Close trailer"
            >
              <X size={15} weight="bold" />
            </button>
          </>
        ) : (
          <>
            {thumbnail ? (
              <img
                src={thumbnail}
                alt="Course Thumbnail"
                className="block h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[0.8rem] text-(--muted)">
                <div className="flex items-center justify-center opacity-60">
                  <ImageIcon size={32} weight="light" />
                </div>
                <span className="opacity-70">
                  Click or drop an image for the thumbnail
                </span>
                <span className="mt-0.5 inline-block rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-[0.72rem] font-semibold text-(--accent)">
                  Required · 1280x720 (16:9)
                </span>
              </div>
            )}
            {hasTrailer ? (
              <button
                type="button"
                className="absolute top-1/2 left-1/2 z-10 inline-flex size-14 -translate-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-black/45 text-white shadow-[0_8px_30px_rgb(0_0_0/0.3)] backdrop-blur-md transition-colors duration-150 hover:bg-black/65"
                onClick={(event) => {
                  event.stopPropagation();
                  setPlaying(true);
                }}
                aria-label="Play trailer"
                title="Play trailer"
              >
                <Play size={22} weight="fill" />
              </button>
            ) : null}
          </>
        )}

        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-4 text-center text-[0.82rem] font-semibold text-white">
            Drop an image for the thumbnail, or a video for the trailer
          </div>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            className={`${overlayButtonClasses} right-2`}
            aria-label="Thumbnail and trailer"
            title="Thumbnail and trailer"
            disabled={disabled}
            onClick={(event) => event.stopPropagation()}
          >
            <DotsThreeVertical size={18} weight="bold" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            aria-label="Thumbnail and trailer"
            className="w-max min-w-0"
          >
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={thumbnailLocked}
                onClick={triggerThumbnailUpload}
              >
                <ImageIcon size={16} aria-hidden="true" />
                {thumbnail ? "Change thumbnail" : "Upload thumbnail"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={trailerLocked}
                onClick={() => trailerUploadRef.current?.open()}
              >
                <VideoCamera size={16} aria-hidden="true" />
                {trailerMediaId ? "Change trailer" : "Add trailer"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {trailerMediaId ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={trailerLocked}
                    onClick={() => {
                      void removeTrailer();
                    }}
                  >
                    <Trash size={16} aria-hidden="true" />
                    Remove trailer
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* The trailer's uploader works in its own pop-up, opened from the
          menu or by a dropped video; it has no button of its own here. */}
      <Suspense fallback={null}>
        <LessonVideoUpload
          ref={trailerUploadRef}
          hideTrigger
          disabled={trailerLocked}
          mediaAssetId={trailerMediaId}
          visibility="public"
          videoNoun="trailer"
          onPreviewFile={previewTrailerFile}
          onMediaAttached={attachTrailer}
          onProcessingComplete={onTrailerProcessed}
        />
      </Suspense>

      {thumbnailUploadError || dropError ? (
        <p className="m-0 mt-2 text-[0.75rem] text-red-400" role="alert">
          {thumbnailUploadError ?? dropError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The trailer, playing in the picture's place: the file picked in this
 * session when there is one, the saved trailer's stream otherwise.
 */
function TrailerVideo({
  courseId,
  localUrl,
  poster,
}: {
  courseId: string | null;
  localUrl: string | null;
  poster: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || localUrl || !courseId) return;

    let engine: VideoEngine | undefined;
    let cancelled = false;
    void import("./courseTrailerVideoEngine")
      .then(({ loadCourseTrailerVideo }) =>
        loadCourseTrailerVideo(video, courseId),
      )
      .then(async (loaded) => {
        if (cancelled) {
          await loaded.destroy().catch(() => undefined);
          return;
        }
        engine = loaded;
        await loaded.play().catch(() => undefined);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const failure = caught as
          { status?: number; response?: { status?: number } } | undefined;
        const status = failure?.status ?? failure?.response?.status;
        setError(
          status === 409
            ? "The trailer is still being prepared. Try again in a moment."
            : "The trailer could not be played.",
        );
      });

    return () => {
      cancelled = true;
      void engine?.destroy().catch(() => undefined);
    };
  }, [courseId, localUrl]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        src={localUrl ?? undefined}
        poster={poster ?? undefined}
        autoPlay={Boolean(localUrl)}
        controls
        playsInline
        className="block h-full w-full object-contain"
        aria-label="Course trailer"
      />
      {error ? (
        <p
          className="absolute inset-x-3 bottom-3 m-0 rounded-md bg-black/70 px-3 py-2 text-center text-[0.78rem] text-white"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
