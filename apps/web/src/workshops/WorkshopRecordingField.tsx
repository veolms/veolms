import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MEDIA_MAX_SIZES, type WorkshopSessionAdmin } from "@veolms/contracts";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import {
  VideoSourceTabs,
  YoutubeImportPanel,
  type VideoSource,
} from "../components/youtube-import/YoutubeImportPanel";
import { useBeforeUnloadWarning } from "../hooks/useBeforeUnloadWarning";
import {
  useUploadVideo,
  useVideoJobProgress,
  useYoutubeImportAvailability,
} from "../services/media";
import { useSetWorkshopRecording } from "../services/workshops";
import { browserTimeZone, formatSessionDay } from "./workshopHelpers";

const insetClass =
  "rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_55%,var(--surface))]";
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

/** Where a recording's processing has got to, until it is ready. */
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
        Processing{status ? ` (${percent}%)` : "..."}. Registrants are told once
        it is ready.
      </p>
      <ProgressBar percent={percent} label="Recording processing" />
    </div>
  );
}

/**
 * One session's recording: upload a video or import one from YouTube. It
 * is attached as soon as it has been sent (or its import queued) and shows
 * to registrants once processed.
 */
export function WorkshopRecordingField({
  workshopId,
  session,
  index,
  disabled,
}: {
  workshopId: string;
  session: WorkshopSessionAdmin;
  index: number;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const upload = useUploadVideo();
  const attach = useSetWorkshopRecording();
  const [percent, setPercent] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [source, setSource] = useState<VideoSource>("upload");
  const [importPanelKey, setImportPanelKey] = useState(0);
  const canImportFromYoutube = useYoutubeImportAvailability(true);
  const importing = canImportFromYoutube && source === "youtube";
  const timeZone = browserTimeZone();

  useBeforeUnloadWarning(upload.isPending);
  useEffect(() => () => abortRef.current?.abort(), []);

  const save = (mediaId: string | null) => {
    setProblem(null);
    attach.mutate(
      { workshopId, sessionId: session.id, mediaId },
      {
        onError: (error) =>
          setProblem(error.message || "The recording could not be saved."),
      },
    );
  };

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
        onSuccess: (mediaId) => save(mediaId),
        onError: (error) => {
          if (error.name !== "AbortError") {
            setProblem(error.message || "The video could not be uploaded.");
          }
        },
      },
    );
  };

  const busy = disabled || upload.isPending || attach.isPending;
  const label = session.title ?? `Session ${index + 1}`;

  return (
    <div className="grid min-w-0 gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] p-3.5">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 truncate text-sm font-semibold text-(--text)">
          {label}
        </p>
        <p className="text-xs text-(--muted)">
          {formatSessionDay(session.startsAt, timeZone)}
        </p>
      </div>

      {session.recordingMediaId && !upload.isPending ? (
        <div className={`grid gap-1.5 p-3 ${insetClass}`}>
          {session.recordingReadyAt ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <CheckCircle size={16} weight="fill" />
              Recording is ready and visible to registrants
            </p>
          ) : (
            <ProcessingStatus mediaId={session.recordingMediaId} />
          )}
          <button
            type="button"
            onClick={() => save(null)}
            disabled={busy}
            className="justify-self-start text-xs font-semibold text-(--muted) hover:text-rose-500 cursor-pointer disabled:opacity-50"
          >
            Remove recording
          </button>
        </div>
      ) : null}

      {canImportFromYoutube ? (
        <VideoSourceTabs
          value={source}
          onChange={(next) => {
            setSource(next);
            setProblem(null);
          }}
          disabled={busy}
        />
      ) : null}

      {importing ? (
        <YoutubeImportPanel
          key={importPanelKey}
          courseId={null}
          lessonId={null}
          isReplacement={session.recordingMediaId !== null}
          context="workshop"
          disabled={busy}
          onImportStarted={(mediaId) => {
            save(mediaId);
            setImportPanelKey((key) => key + 1);
          }}
          onReuseExisting={(mediaId) => {
            save(mediaId);
            setImportPanelKey((key) => key + 1);
          }}
        />
      ) : upload.isPending ? (
        <div className={`grid gap-2 p-3 ${insetClass}`}>
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-(--text)">
              {fileName}
            </p>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 cursor-pointer text-xs font-semibold text-(--muted) hover:text-(--text)"
            >
              Cancel
            </button>
          </div>
          <ProgressBar percent={percent} label="Recording upload" />
          <p className="text-xs text-(--muted) tabular-nums">
            Uploading... {percent}%
          </p>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={`flex w-full cursor-pointer items-center justify-center gap-2 border-dashed p-4 text-sm font-semibold text-(--text) transition-colors hover:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60 ${insetClass}`}
          >
            <UploadSimple size={18} weight="bold" />
            {session.recordingMediaId
              ? "Upload a different recording"
              : "Upload the recording"}
          </button>
          <p className="mt-1.5 text-xs text-(--muted)">
            Up to 5 GB. Learners stream it from the workshop page; the file
            itself is never handed out.
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
