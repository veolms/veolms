import { HardDrivesIcon as HardDrives } from "@phosphor-icons/react/HardDrives";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  isStorageErrorCode,
  STORAGE_BLOCKED_ERROR,
  type StorageErrorCode,
} from "@veolms/contracts";
import { useState } from "react";

import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import { useMyStorage } from "../services/storage";
import { LazyMyFilesSheet } from "./LazyMyFilesSheet";
import { RequestStorageDialog } from "./RequestStorageDialog";

/**
 * Shown where an upload was refused for the learner's storage space (a chat
 * message that did not send, a discussion or support attachment): what
 * happened, and "Request more space", or the request already waiting.
 * Blocked uploads have no request to make.
 */
export function StorageFullNotice({
  code,
  message,
  className,
  onDismiss,
}: {
  code: StorageErrorCode;
  /** The server's own words (they carry the sizes). */
  message?: string | null;
  className?: string;
  /** Shows a close button (where nothing else clears the notice). */
  onDismiss?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [managing, setManaging] = useState(false);
  const blocked = code === STORAGE_BLOCKED_ERROR;
  const storage = useMyStorage();
  const pending = storage.data?.request?.status === "pending";

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-rose-500/25 bg-rose-500/8 px-3.5 py-3 text-left",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-rose-500/12 text-rose-500"
      >
        {blocked ? (
          <Prohibit size={18} weight="bold" />
        ) : (
          <HardDrives size={18} weight="duotone" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[0.88rem] font-semibold text-(--text)">
          {blocked
            ? "Sending files is turned off for you"
            : storage.data && storage.data.state !== "full"
              ? "Not enough storage space"
              : "Your storage space is full"}
        </p>
        <p className="m-0 mt-0.5 text-[0.8rem] leading-snug text-(--text-secondary)">
          {blocked
            ? (storage.data?.blocked?.reason ??
              "Contact support if you think this is a mistake.")
            : (message ??
              "Request more space, or delete some photos, videos or files you've sent.")}
        </p>
        {!blocked ? (
          <>
            {pending ? (
              <p className="m-0 mt-2 text-[0.78rem] font-semibold text-(--accent-ink)">
                Request sent. An admin will look at it soon.
              </p>
            ) : null}
            {/* The two ways out, as WhatsApp offers when a phone is full. */}
            <div className="mt-2 flex flex-wrap gap-2">
              {!pending ? (
                <button
                  type="button"
                  onClick={() => setAsking(true)}
                  className="inline-flex min-h-8 cursor-pointer items-center rounded-lg border-0 bg-(--accent) px-3 text-[0.8rem] font-semibold text-(--on-accent) hover:bg-(--accent-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                >
                  Request more space
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setManaging(true)}
                className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-solid border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-transparent px-3 text-[0.8rem] font-semibold text-(--text) hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                <Trash size={15} aria-hidden="true" />
                Delete old files
              </button>
            </div>
          </>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="-mt-1 -mr-1.5 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)"
        >
          <X size={15} />
        </button>
      ) : null}
      <RequestStorageDialog open={asking} onClose={() => setAsking(false)} />
      {managing ? (
        <LazyMyFilesSheet onClose={() => setManaging(false)} />
      ) : null}
    </div>
  );
}

/** The storage refusal in an API error, if that is what it was. */
export function storageRefusalOf(
  error: unknown,
): { code: StorageErrorCode; message: string } | null {
  const { code, message } = getApiError(error);
  return isStorageErrorCode(code) ? { code, message } : null;
}
