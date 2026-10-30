import { useCallback, useEffect, useState } from "react";
import { HardDrivesIcon as HardDrives } from "@phosphor-icons/react/HardDrives";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import {
  clearPreviewChunkCache,
  getPreviewChunkCacheUsage,
} from "@veolms/video-player/preview-cache";
import {
  getSegmentCacheUsage,
  resolveSegmentCacheBudget,
} from "../learning/player/segmentCacheBudget";
import { useWebContributions } from "../lib/web-contributions";

export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function StorageRow({
  label,
  size,
  note,
  extra,
  onClear,
}: {
  label: string;
  size: number | null;
  note: string;
  extra?: string;
  onClear: () => Promise<void>;
}) {
  const [clearing, setClearing] = useState(false);
  return (
    <div className="settings-learning-toggle-row">
      <span className="settings-learning-toggle-row__copy">
        <strong>
          {label}
          <span className="ml-2 font-semibold text-(--text-secondary) tabular-nums">
            {size === null ? "…" : formatStorageSize(size)}
          </span>
        </strong>
        <small>{note}</small>
        {extra ? <small>{extra}</small> : null}
      </span>
      <button
        type="button"
        disabled={clearing || !size}
        aria-busy={clearing}
        aria-label={`Clear ${label.toLowerCase()}`}
        onClick={() => {
          setClearing(true);
          void onClear().finally(() => setClearing(false));
        }}
        className="inline-flex min-h-9 items-center gap-2 justify-self-end rounded-lg border border-(--border) bg-(--surface) px-3 text-sm! font-semibold text-(--text) transition-colors hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] hover:bg-(--surface-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-50"
      >
        <Trash size={16} aria-hidden="true" />
        {clearing ? "Clearing…" : "Clear"}
      </button>
    </div>
  );
}

/**
 * What lesson playback keeps on this device: watched video, seek previews,
 * and whatever plugins add (downloads). Clearing here leaves downloads
 * alone, unlike clearing the site's data in the browser.
 */
export function StorageSettingsCard() {
  const [videoBytes, setVideoBytes] = useState<number | null>(null);
  const [previewBytes, setPreviewBytes] = useState<number | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const contributions = useWebContributions();
  const rows = (contributions.settingsRows ?? []).filter(
    (row) => row.section === "storage",
  );

  const refresh = useCallback(() => {
    void getSegmentCacheUsage().then((usage) => setVideoBytes(usage.bytes));
    setPreviewBytes(getPreviewChunkCacheUsage().bytes);
  }, []);

  useEffect(() => {
    refresh();
    void resolveSegmentCacheBudget().then(setBudget);
  }, [refresh]);

  return (
    <section
      className="settings-learning-card"
      aria-labelledby="storage-heading"
    >
      <header className="settings-learning-card__heading">
        <HardDrives size={21} weight="duotone" />
        <h3 id="storage-heading">Storage</h3>
      </header>
      <div className="settings-learning-card__rows">
        <StorageRow
          label="Video cache"
          size={videoBytes}
          note="Lessons you watched, kept so they play again without downloading."
          extra={
            budget === null
              ? undefined
              : `Automatic limit: ${formatStorageSize(budget)} on this device`
          }
          onClear={async () => {
            const { clearSegmentCache } =
              await import("../learning/player/segmentCache");
            await clearSegmentCache();
            refresh();
          }}
        />
        <StorageRow
          label="Seek previews"
          size={previewBytes}
          note="Pictures shown while you move along a lesson's timeline."
          onClear={async () => {
            await clearPreviewChunkCache();
            refresh();
          }}
        />
        {rows.map(({ id, component: Row }) => (
          <Row key={id} />
        ))}
      </div>
    </section>
  );
}
