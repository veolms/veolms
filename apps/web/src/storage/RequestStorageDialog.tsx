import { formatStorageBytes, STORAGE_NOTE_MAX_LENGTH } from "@veolms/contracts";
import { useId, useState } from "react";

import { Button } from "../components/Button";
import { useMyStorage, useRequestMoreStorage } from "../services/storage";
import {
  StorageDialog,
  storageFieldClass,
  storageLabelClass,
} from "./StorageDialog";
import { StorageUsageBar } from "./StorageUsageBar";

/**
 * "Request more space": an optional note to the academy's admins. One
 * request is open at a time; asking again shows the open one.
 */
export function RequestStorageDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState("");
  const storage = useMyStorage({ enabled: open });
  const request = useRequestMoreStorage();
  const data = storage.data;

  const close = () => {
    request.reset();
    onClose();
  };

  return (
    <StorageDialog
      open={open}
      title="Request more space"
      subtitle="An admin looks at your request and can give you more space."
      onClose={close}
      footer={
        <>
          <Button variant="quiet" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={request.isPending}
            aria-busy={request.isPending}
            onClick={() =>
              request.mutate(note.trim() ? { note: note.trim() } : {}, {
                onSuccess: () => {
                  setNote("");
                  onSent?.();
                  onClose();
                },
              })
            }
          >
            {request.isPending ? "Sending…" : "Send request"}
          </Button>
        </>
      }
    >
      {data && data.limitBytes !== null ? (
        <div className="mb-4 rounded-xl bg-(--surface-strong) px-3.5 py-3">
          <p className="m-0 mb-2 text-[0.82rem] text-(--text)">
            <span className="font-semibold tabular-nums">
              {formatStorageBytes(data.usedBytes)}
            </span>{" "}
            <span className="text-(--muted)">
              of {formatStorageBytes(data.limitBytes)} used
            </span>
          </p>
          <StorageUsageBar
            usedBytes={data.usedBytes}
            limitBytes={data.limitBytes}
            label="Storage space used"
          />
        </div>
      ) : null}
      <label htmlFor={noteId} className={storageLabelClass}>
        Note for the admin <span className="font-normal">(optional)</span>
      </label>
      <textarea
        id={noteId}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={STORAGE_NOTE_MAX_LENGTH}
        rows={3}
        className={storageFieldClass}
        placeholder="What do you need the space for?"
      />
      {request.error ? (
        <p role="alert" className="m-0 mt-3 text-sm text-rose-500">
          {request.error.message}
        </p>
      ) : null}
    </StorageDialog>
  );
}
