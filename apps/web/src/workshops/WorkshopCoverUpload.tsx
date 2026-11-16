import { useRef, useState } from "react";
import { ImageIcon as Image } from "@phosphor-icons/react/Image";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { XIcon as X } from "@phosphor-icons/react/X";
import { Button } from "../components/Button";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { waitForCourseThumbnailCdnUrl } from "../courses/courseMedia";
import { getApiError } from "../lib/api-error";
import { mediaService } from "../services/media";

export interface CoverValue {
  coverMediaId: string | null;
  coverUrl: string | null;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * The 16:9 image on the workshop card and page. Uploaded the way course
 * banners are (presigned upload, then the processed CDN image), so it is
 * served from the same place at the same sizes.
 */
export function WorkshopCoverUpload({
  value,
  onChange,
  disabled = false,
}: {
  value: CoverValue;
  onChange: (value: CoverValue) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  const pickFile = () => inputRef.current?.click();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPG, PNG or WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Keep the image under 8 MB.");
      return;
    }
    setError(null);
    setStatus("uploading");
    try {
      const presigned = await mediaService.presignMediaUpload({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        type: "image",
        visibility: "public",
      });
      await mediaService.uploadFileToPresignedUrl(presigned.uploadUrl, file);
      await mediaService.confirmUpload(presigned.mediaAssetId);
      const coverUrl = await waitForCourseThumbnailCdnUrl(
        presigned.mediaAssetId,
      );
      onChange({ coverMediaId: presigned.mediaAssetId, coverUrl });
    } catch (caught) {
      setError(getApiError(caught).message || "The upload did not finish.");
    } finally {
      setStatus("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {value.coverUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          <img
            src={value.coverUrl}
            alt="Workshop cover"
            className="aspect-video w-full object-cover"
          />
          {status === "uploading" ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
              <LoadingSpinnerIcon size={22} />
            </div>
          ) : null}
          <div className="absolute right-2 top-2 flex gap-1.5">
            <Button
              variant="quiet"
              elevation="flat"
              className="h-8 px-2.5 text-xs"
              disabled={disabled || status === "uploading"}
              onClick={pickFile}
            >
              <UploadSimple size={14} weight="bold" />
              Replace
            </Button>
            <button
              type="button"
              aria-label="Remove cover"
              disabled={disabled || status === "uploading"}
              onClick={() => onChange({ coverMediaId: null, coverUrl: null })}
              className="inline-flex size-8 items-center justify-center rounded-xl bg-(--surface-strong) text-(--text-secondary) hover:bg-(--hover) hover:text-(--text) cursor-pointer disabled:opacity-50"
            >
              <X size={14} weight="bold" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={pickFile}
          disabled={disabled || status === "uploading"}
          className="grid aspect-video w-full place-items-center rounded-xl border border-dashed border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,transparent)] text-center transition-colors hover:border-(--accent) hover:bg-(--accent)/5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="grid place-items-center gap-2 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
              {status === "uploading" ? (
                <LoadingSpinnerIcon size={20} />
              ) : (
                <Image size={22} weight="duotone" />
              )}
            </span>
            <span className="text-sm font-medium text-(--text)">
              {status === "uploading" ? "Uploading…" : "Add a cover image"}
            </span>
            <span className="text-xs text-(--muted)">
              16:9 works best · JPG, PNG or WebP up to 8 MB
            </span>
          </span>
        </button>
      )}
      {error ? <p className="text-[12px] text-rose-500">{error}</p> : null}
    </div>
  );
}
