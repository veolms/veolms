import { STORAGE_NOTE_MAX_LENGTH } from "@veolms/contracts";
import { useEffect, useId, useState } from "react";

import { Button } from "../../components/Button";
import {
  StorageDialog,
  storageFieldClass,
  storageLabelClass,
} from "../../storage/StorageDialog";

/** Blocking uploads or turning a request down: a confirmation and a note. */
export function StorageNoteDialog({
  open,
  title,
  subtitle,
  noteLabel,
  confirmLabel,
  danger = false,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  noteLabel: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) setNote("");
  }, [open]);

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
            variant={danger ? "danger" : "primary"}
            disabled={pending}
            aria-busy={pending}
            onClick={() => onConfirm(note.trim())}
          >
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <label htmlFor={noteId} className={storageLabelClass}>
        {noteLabel} <span className="font-normal">(optional)</span>
      </label>
      <textarea
        id={noteId}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={STORAGE_NOTE_MAX_LENGTH}
        rows={3}
        className={storageFieldClass}
      />
      {error ? (
        <p role="alert" className="m-0 mt-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}
    </StorageDialog>
  );
}
