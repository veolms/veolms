import {
  formatStorageBytes,
  STORAGE_GB,
  STORAGE_MAX_LIMIT_BYTES,
  STORAGE_NOTE_MAX_LENGTH,
} from "@veolms/contracts";
import { useEffect, useId, useState } from "react";

import { Button } from "../../components/Button";
import { cn } from "../../lib/utils";
import {
  StorageDialog,
  storageFieldClass,
  storageLabelClass,
} from "../../storage/StorageDialog";

/** Added to the current limit: the quick choices. */
const PRESETS_GB = [1, 5, 10] as const;

function toGb(bytes: number) {
  return Math.round((bytes / STORAGE_GB) * 100) / 100;
}

/**
 * Picks a new limit: +1, +5 or +10 GB on top of the current one, or any
 * size in GB. For approving a request, setting a student's limit and the
 * default for everyone (`withNote` false).
 */
export function StorageLimitDialog({
  open,
  title,
  subtitle,
  currentLimitBytes,
  usedBytes,
  confirmLabel,
  withNote = true,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  currentLimitBytes: number;
  usedBytes?: number;
  confirmLabel: string;
  withNote?: boolean;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (limitBytes: number, note: string) => void;
}) {
  const sizeId = useId();
  const noteId = useId();
  const [gb, setGb] = useState(() =>
    String(toGb(currentLimitBytes + STORAGE_GB)),
  );
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setGb(String(toGb(currentLimitBytes + STORAGE_GB)));
      setNote("");
    }
  }, [currentLimitBytes, open]);

  const bytes = Math.round(Number(gb) * STORAGE_GB);
  const valid =
    gb.trim() !== "" &&
    Number.isFinite(bytes) &&
    bytes >= 0 &&
    bytes <= STORAGE_MAX_LIMIT_BYTES;

  return (
    <StorageDialog
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || pending}
            aria-busy={pending}
            onClick={() => onConfirm(bytes, note.trim())}
          >
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="m-0 mb-3 text-[0.82rem] text-(--text-secondary)">
        Now {formatStorageBytes(currentLimitBytes)}
        {usedBytes !== undefined
          ? `, ${formatStorageBytes(usedBytes)} used`
          : ""}
        .
      </p>
      <div
        className="mb-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Quick choices"
      >
        {PRESETS_GB.map((add) => {
          const value = String(toGb(currentLimitBytes + add * STORAGE_GB));
          return (
            <button
              key={add}
              type="button"
              onClick={() => setGb(value)}
              aria-pressed={gb === value}
              className={cn(
                "min-h-9 cursor-pointer rounded-lg border px-3 text-[0.8rem] font-semibold transition-colors",
                gb === value
                  ? "border-(--accent) bg-(--accent)/12 text-(--accent-ink)"
                  : "border-transparent bg-(--surface-strong) text-(--text-secondary) hover:bg-(--hover) hover:text-(--text)",
              )}
            >
              +{add} GB
            </button>
          );
        })}
      </div>
      <label htmlFor={sizeId} className={storageLabelClass}>
        New limit (GB)
      </label>
      <input
        id={sizeId}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        value={gb}
        onChange={(event) => setGb(event.target.value)}
        className={storageFieldClass}
      />
      {withNote ? (
        <>
          <label htmlFor={noteId} className={cn(storageLabelClass, "mt-3")}>
            Note for the student <span className="font-normal">(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={STORAGE_NOTE_MAX_LENGTH}
            rows={2}
            className={storageFieldClass}
          />
        </>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 mt-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}
    </StorageDialog>
  );
}
