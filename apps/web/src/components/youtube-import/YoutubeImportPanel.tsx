import { CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { YoutubeLogo } from "@phosphor-icons/react/YoutubeLogo";
import { useId, useState, type FormEvent } from "react";
import {
  parseYoutubeVideoId,
  type YoutubeImportPreviewResponse,
} from "@veolms/contracts";
import { Checkbox } from "../Checkbox";
import { getApiError } from "../../lib/api-error";
import {
  usePreviewYoutubeImport,
  useStartYoutubeImport,
} from "../../services/media";

export type VideoSource = "upload" | "youtube";

const TAB_BASE_CLASS =
  "inline-flex h-8.5 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border-none px-3 text-[0.78rem] font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60";

/** "Upload file" / "Import from YouTube" switch above the video picker. */
export function VideoSourceTabs({
  value,
  onChange,
  disabled = false,
}: {
  value: VideoSource;
  onChange: (source: VideoSource) => void;
  disabled?: boolean;
}) {
  const options: Array<{
    id: VideoSource;
    label: string;
    icon: typeof YoutubeLogo;
  }> = [
    { id: "upload", label: "Upload file", icon: UploadSimple },
    { id: "youtube", label: "Import from YouTube", icon: YoutubeLogo },
  ];
  return (
    <div
      role="tablist"
      aria-label="Video source"
      className="flex gap-1 rounded-[10px] bg-[color-mix(in_srgb,var(--text)_6%,var(--surface))] p-1"
    >
      {options.map(({ id, label, icon: Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={`${TAB_BASE_CLASS} ${
              selected
                ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_10%,transparent))]"
                : "bg-transparent text-(--muted) hover:text-(--text)"
            }`}
          >
            <Icon size={15} weight={selected ? "fill" : "regular"} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** What the imported video is for, which only changes the wording. */
export type YoutubeImportContext = "lesson" | "home-page";

const COPY: Record<
  YoutubeImportContext,
  { replacement: string; rights: string }
> = {
  lesson: {
    replacement:
      "The lesson keeps its current video until the imported one is ready.",
    rights: "I own this video or have the rights to use it in this course.",
  },
  "home-page": {
    replacement:
      "The laptop plays the imported video once it is ready; until then the play button does nothing.",
    rights:
      "I own this video or have the rights to use it on this academy's home page.",
  },
};

export interface YoutubeImportPanelProps {
  /** Null while the course is not saved yet, and for a video of no course. */
  courseId: string | null;
  /** Null while the lesson is not saved yet: the editor attaches the video. */
  lessonId: string | null;
  isReplacement: boolean;
  context?: YoutubeImportContext;
  disabled?: boolean;
  /** The import is queued: follow `mediaId` like an uploaded video. */
  onImportStarted: (mediaId: string, title: string) => void;
  /** This account already imported the video: use that copy. */
  onReuseExisting: (mediaId: string, title: string) => void;
}

/**
 * Paste a YouTube link, check the video it points to, confirm the academy
 * may use it, and queue the import. The server downloads and prepares the
 * video; this panel only starts it.
 */
export function YoutubeImportPanel({
  courseId,
  lessonId,
  isReplacement,
  context = "lesson",
  disabled = false,
  onImportStarted,
  onReuseExisting,
}: YoutubeImportPanelProps) {
  const copy = COPY[context];
  const inputId = useId();
  const rightsId = useId();
  const [url, setUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const previewMutation = usePreviewYoutubeImport();
  const startMutation = useStartYoutubeImport();
  const preview = previewMutation.data;
  const linkIsValid = parseYoutubeVideoId(url) !== null;
  const busy = previewMutation.isPending || startMutation.isPending;

  const fetchPreview = (event: FormEvent) => {
    event.preventDefault();
    if (!linkIsValid || busy) return;
    startMutation.reset();
    previewMutation.mutate(url.trim());
  };

  const startImport = () => {
    if (!preview || !rightsConfirmed || busy) return;
    startMutation.mutate(
      {
        url: url.trim(),
        ...(courseId ? { courseId } : {}),
        ...(courseId && lessonId ? { lessonId } : {}),
        rightsConfirmed: true,
      },
      {
        onSuccess: (result) => onImportStarted(result.mediaId, preview.title),
      },
    );
  };

  const error = previewMutation.error ?? startMutation.error;

  return (
    <div className="min-w-0 space-y-3.5">
      <form onSubmit={fetchPreview} className="space-y-2">
        <label
          htmlFor={inputId}
          className="block text-[0.8rem] font-semibold text-(--text-secondary)"
        >
          YouTube link
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            disabled={disabled || busy}
            onChange={(event) => {
              setUrl(event.target.value);
              if (previewMutation.data || previewMutation.error) {
                previewMutation.reset();
                setRightsConfirmed(false);
              }
            }}
            className="h-10 min-w-0 flex-1 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3.5 text-[0.86rem] text-(--text) outline-none transition-[border-color] duration-150 focus:border-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={disabled || busy || !linkIsValid}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none bg-[color-mix(in_srgb,var(--text)_8%,var(--surface))] px-4 text-[0.8rem] font-semibold text-(--text) shadow-[var(--card-compact-shadow,0_2px_6px_color-mix(in_srgb,var(--text)_10%,transparent))] transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--text)_13%,var(--surface))] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {previewMutation.isPending ? (
              <CircleNotch size={15} className="animate-spin" />
            ) : null}
            {previewMutation.isPending ? "Checking…" : "Find video"}
          </button>
        </div>
        <p className="m-0 text-[0.72rem] leading-relaxed text-(--muted)">
          {url && !linkIsValid
            ? "Paste a link to a single video (watch, youtu.be or shorts link), not a playlist."
            : isReplacement
              ? copy.replacement
              : "The video is downloaded and prepared for streaming on the server; long videos take a while."}
        </p>
      </form>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[12px] bg-amber-500/10 p-3 text-[0.78rem] font-medium text-(--text)"
        >
          <WarningCircle
            size={17}
            weight="fill"
            className="mt-0.5 shrink-0 text-amber-500"
          />
          <span>{getApiError(error).message}</span>
        </div>
      ) : null}

      {preview ? (
        <YoutubeVideoPreview
          preview={preview}
          rightsId={rightsId}
          rightsConfirmed={rightsConfirmed}
          onRightsConfirmedChange={setRightsConfirmed}
          busy={busy}
          disabled={disabled}
          starting={startMutation.isPending}
          rightsLabel={copy.rights}
          onImport={startImport}
          onReuse={(mediaId) => onReuseExisting(mediaId, preview.title)}
        />
      ) : null}
    </div>
  );
}

function YoutubeVideoPreview({
  preview,
  rightsId,
  rightsConfirmed,
  onRightsConfirmedChange,
  busy,
  disabled,
  starting,
  rightsLabel,
  onImport,
  onReuse,
}: {
  preview: YoutubeImportPreviewResponse;
  rightsId: string;
  rightsConfirmed: boolean;
  onRightsConfirmedChange: (checked: boolean) => void;
  busy: boolean;
  disabled: boolean;
  starting: boolean;
  rightsLabel: string;
  onImport: () => void;
  onReuse: (mediaId: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-[14px] bg-(--card-surface-raised,color-mix(in_srgb,var(--surface-strong,var(--surface))_85%,var(--surface))) p-3 shadow-(--card-shadow,var(--surface-depth-shadow)) sm:p-3.5">
      <div className="flex min-w-0 gap-3">
        {preview.thumbnailUrl ? (
          <img
            src={preview.thumbnailUrl}
            alt=""
            width={128}
            height={72}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="aspect-video w-32 shrink-0 rounded-[8px] object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="m-0 line-clamp-2 text-[0.84rem] font-semibold leading-snug text-(--text)">
            {preview.title}
          </p>
          <p className="m-0 mt-1 truncate text-[0.72rem] text-(--muted)">
            {[
              preview.channel,
              preview.durationSeconds !== null
                ? formatDuration(preview.durationSeconds)
                : null,
              preview.qualities.length ? preview.qualities.join(" · ") : null,
            ]
              .filter(Boolean)
              .join(" — ")}
          </p>
        </div>
      </div>

      {preview.existingMediaId ? (
        <div className="flex flex-col gap-2 rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-2.5 text-[0.75rem] text-(--text-secondary) sm:flex-row sm:items-center sm:justify-between">
          <span>
            You already imported this video. Use that copy instead of
            downloading it again.
          </span>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onReuse(preview.existingMediaId!)}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-none bg-(--accent) px-3 text-[0.74rem] font-bold text-(--on-accent,#ffffff) disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use existing copy
          </button>
        </div>
      ) : null}

      <Checkbox
        id={rightsId}
        checked={rightsConfirmed}
        onCheckedChange={onRightsConfirmedChange}
        disabled={disabled || busy}
        label={rightsLabel}
        className="px-0"
      />

      <div className="flex justify-end">
        <button
          type="button"
          disabled={disabled || busy || !rightsConfirmed}
          onClick={onImport}
          className="inline-flex h-10 min-w-30 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border-none bg-(--accent) px-5 text-[0.82rem] font-bold text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all duration-150 hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {starting ? <CircleNotch size={15} className="animate-spin" /> : null}
          {starting ? "Starting…" : "Import video"}
        </button>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}
