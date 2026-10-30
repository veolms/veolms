import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { YoutubeLogoIcon as YoutubeLogo } from "@phosphor-icons/react/YoutubeLogo";
import { MEDIA_MAX_SIZES } from "@veolms/contracts";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  VideoSourceTabs,
  YoutubeImportPanel,
  type VideoSource,
} from "../components/youtube-import/YoutubeImportPanel";
import { useBeforeUnloadWarning } from "../hooks/useBeforeUnloadWarning";
import {
  useMediaSource,
  useUploadVideo,
  useVideoJobProgress,
  useYoutubeImportAvailability,
} from "../services/media";
import { insetRowClass } from "./homePageSettingsControls";

const trackClass =
  "h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={trackClass}
    >
      <div
        className="h-full rounded-full bg-(--accent) transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function validateVideo(file: File): string | null {
  if (!file.type.toLowerCase().startsWith("video/")) {
    return "Please choose a video file.";
  }
  if (file.size <= 0) return "The selected video is empty.";
  if (file.size > MEDIA_MAX_SIZES.video) {
    return "Video files must be 5 GB or smaller.";
  }
  return null;
}

/** The YouTube video an imported hero video came from, with a link to it. */
function YoutubeSource({ mediaId }: { mediaId: string }) {
  const source = useMediaSource(mediaId).data?.source;
  if (source?.provider !== "youtube") return null;
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-(--muted)">
      <YoutubeLogo size={14} weight="fill" className="shrink-0" />
      <span className="min-w-0 truncate">
        From YouTube{source.channel ? ` · ${source.channel}` : ""}
      </span>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-(--text) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--accent)"
      >
        Open on YouTube
        <ArrowSquareOut size={12} weight="bold" />
      </a>
    </p>
  );
}

/** Where an uploaded hero video's processing has got to. */
function ProcessingStatus({ mediaId }: { mediaId: string }) {
  const progress = useVideoJobProgress(mediaId);
  const status = progress.data?.status;

  if (progress.isError) {
    return (
      <p className="text-xs text-(--muted)">
        Its processing status could not be read.
      </p>
    );
  }
  if (status === "completed") {
    return <p className="text-xs text-(--muted)">Ready to play.</p>;
  }
  if (status === "failed" || status === "cancelled") {
    return (
      <p className="text-xs text-rose-500">
        {progress.data?.error ??
          "The video could not be processed. Upload or import it again."}
      </p>
    );
  }
  const percent = progress.data?.progressPercent ?? 0;
  return (
    <div className="grid gap-1.5">
      <p className="text-xs text-(--muted)">
        Processing{status ? ` (${percent}%)` : "..."}. Visitors see it once it
        is ready; until then the laptop&apos;s play button does nothing.
      </p>
      <ProgressBar percent={percent} label="Video processing" />
    </div>
  );
}

/**
 * Uploads a video for the hero alone, or imports one from YouTube. It goes
 * through the same processing as a lesson's video; it is chosen as soon as
 * it has been sent (or its import queued), and can be saved while it is
 * still being processed.
 */
export function HeroVideoUpload({
  uploaded,
  onUploaded,
}: {
  /** The upload chosen now, if the hero plays one. */
  uploaded: { mediaId: string; fileName: string } | null;
  onUploaded: (mediaId: string, fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const upload = useUploadVideo();
  const [percent, setPercent] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [source, setSource] = useState<VideoSource>("upload");
  // A new key empties the import panel once its import has been queued.
  const [importPanelKey, setImportPanelKey] = useState(0);
  const canImportFromYoutube = useYoutubeImportAvailability(true);
  const importing = canImportFromYoutube && source === "youtube";

  useBeforeUnloadWarning(upload.isPending);
  // Leaving the page stops an upload that is still being sent.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || upload.isPending) return;
    const invalid = validateVideo(file);
    setProblem(invalid);
    if (invalid) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPercent(0);
    setFileName(file.name);
    upload.mutate(
      {
        file,
        onProgress: (progress) => setPercent(progress.percent),
        signal: controller.signal,
      },
      {
        onSuccess: (mediaId) => onUploaded(mediaId, file.name),
        onError: (error) => {
          if (error.name !== "AbortError") {
            setProblem(error.message || "The video could not be uploaded.");
          }
        },
      },
    );
  };

  return (
    <div className="grid min-w-0 gap-3">
      {uploaded && !upload.isPending ? (
        <div className={`grid gap-1.5 p-3 ${insetRowClass}`}>
          <p className="truncate text-sm font-medium text-(--text)">
            {uploaded.fileName}
          </p>
          <YoutubeSource mediaId={uploaded.mediaId} />
          <ProcessingStatus mediaId={uploaded.mediaId} />
        </div>
      ) : null}

      {canImportFromYoutube ? (
        <VideoSourceTabs
          value={source}
          onChange={(next) => {
            setSource(next);
            setProblem(null);
          }}
          disabled={upload.isPending}
        />
      ) : null}

      {importing ? (
        <YoutubeImportPanel
          key={importPanelKey}
          courseId={null}
          lessonId={null}
          isReplacement={uploaded !== null}
          context="home-page"
          onImportStarted={(mediaId, title) => {
            onUploaded(mediaId, title);
            setImportPanelKey((key) => key + 1);
          }}
          onReuseExisting={(mediaId, title) => {
            onUploaded(mediaId, title);
            setImportPanelKey((key) => key + 1);
          }}
        />
      ) : upload.isPending ? (
        <div className={`grid gap-2 p-3 ${insetRowClass}`}>
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-(--text)">
              {fileName}
            </p>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 cursor-pointer text-xs font-semibold text-(--muted) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
            >
              Cancel
            </button>
          </div>
          <ProgressBar percent={percent} label="Video upload" />
          <p className="text-xs text-(--muted) tabular-nums">
            Uploading... {percent}%
          </p>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex w-full cursor-pointer items-center justify-center gap-2 border-dashed p-5 text-sm font-semibold text-(--text) transition-colors hover:border-(--accent) focus-visible:outline-2 focus-visible:outline-(--accent) ${insetRowClass}`}
          >
            <UploadSimple size={18} weight="bold" />
            {uploaded ? "Upload a different video" : "Choose a video to upload"}
          </button>
          <p className="mt-1.5 text-xs text-(--muted)">
            Up to 5 GB. A short, landscape (16:9) clip suits the laptop best.
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={start}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      {problem ? (
        <p className="text-sm text-rose-500" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
