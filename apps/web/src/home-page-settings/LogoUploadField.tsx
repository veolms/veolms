import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import {
  ACADEMY_LOGO_CONTENT_TYPES,
  ACADEMY_LOGO_MAX_BYTES,
} from "@veolms/contracts";
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "../components/Button";
import { getApiError } from "../lib/api-error";

/** The parts of a TanStack mutation the field drives. */
interface LogoMutation<TInput> {
  mutate: (input: TInput, options?: { onSuccess?: () => void }) => void;
  reset: () => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

function logoFileProblem(file: File): string | null {
  if (!(ACADEMY_LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a PNG or JPEG image.";
  }
  if (file.size > ACADEMY_LOGO_MAX_BYTES) {
    return "The logo must be 2 MB or smaller.";
  }
  return null;
}

/**
 * A logo shown on the background it is printed on, with buttons to upload,
 * replace or remove it. Each takes effect at once. Used for the academy's
 * logo (on the emails' navy) and the invoice-only logo (on white paper).
 */
export function LogoUploadField({
  label,
  inputLabel,
  logoUrl,
  alt,
  surface,
  fallback,
  hint,
  upload,
  remove,
  uploadedNotice,
  removedNotice,
  setNotice,
}: {
  label: string;
  /** The hidden file input's accessible name. */
  inputLabel: string;
  logoUrl: string | null;
  alt: string;
  /** What the logo is printed on: the emails' navy, or an invoice's white. */
  surface: "dark" | "light";
  /** Shown in the preview when there is no logo. */
  fallback: ReactNode;
  hint: string;
  upload: LogoMutation<File>;
  remove: LogoMutation<void>;
  uploadedNotice: string;
  removedNotice: string;
  setNotice?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  // The address that failed to load: a new logo (a new address) is tried.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const logoFailed = logoUrl !== null && failedUrl === logoUrl;
  const busy = upload.isPending || remove.isPending;
  const error =
    fileProblem ??
    (upload.isError
      ? getApiError(upload.error).message || "The logo could not be uploaded."
      : remove.isError
        ? getApiError(remove.error).message || "The logo could not be removed."
        : null);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // The same file can be chosen again after a failed upload.
    event.target.value = "";
    if (!file) return;
    upload.reset();
    remove.reset();
    const problem = logoFileProblem(file);
    setFileProblem(problem);
    if (problem) return;
    upload.mutate(file, {
      onSuccess: () => setNotice?.(uploadedNotice),
    });
  };

  const showLogo = logoUrl && !logoFailed;

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-(--text)">{label}</p>
      <div
        className={`flex min-h-18 items-center rounded-xl px-6 py-5 ${
          surface === "dark"
            ? "bg-[#0B0D12]"
            : "border border-(--border) bg-white"
        }`}
      >
        {showLogo ? (
          <img
            alt={alt}
            className="block h-8 w-auto max-w-60"
            onError={() => setFailedUrl(logoUrl)}
            src={logoUrl}
          />
        ) : (
          fallback
        )}
      </div>
      <p className="mt-1.5 text-xs text-(--muted)">
        {logoFailed
          ? "The logo could not be shown here. Try uploading it again."
          : hint}
      </p>
      {error ? (
        <p className="mt-1.5 text-xs text-rose-500" role="alert">
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACADEMY_LOGO_CONTENT_TYPES.join(",")}
        className="hidden"
        onChange={chooseFile}
        aria-label={inputLabel}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          motion="static"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? (
            <CircleNotch size={16} className="animate-spin" />
          ) : (
            <UploadSimple size={16} weight="bold" />
          )}
          {upload.isPending
            ? "Uploading…"
            : logoUrl
              ? "Replace logo"
              : "Upload logo"}
        </Button>
        {logoUrl ? (
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-(--muted) hover:text-rose-500 focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              upload.reset();
              setFileProblem(null);
              remove.mutate(undefined, {
                onSuccess: () => setNotice?.(removedNotice),
              });
            }}
          >
            {remove.isPending ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : (
              <Trash size={16} />
            )}
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
