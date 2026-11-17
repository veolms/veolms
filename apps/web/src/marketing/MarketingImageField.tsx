import { useId, useRef, useState, type DragEvent } from "react";
import {
  MARKETING_IMAGE_CONTENT_TYPES,
  MARKETING_IMAGE_MAX_BYTES,
} from "@veolms/contracts";
import { ImageIcon as ImageSquare } from "@phosphor-icons/react/Image";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import { getApiError } from "../lib/api-error";
import { useUploadMarketingImage } from "../services/marketing";
import { inputClass } from "../workshops/workshopHelpers";
import { isWebAddress } from "./marketingHelpers";

const ACCEPT = MARKETING_IMAGE_CONTENT_TYPES.join(",");

function hasImage(url: string | null): url is string {
  return Boolean(url && isWebAddress(url) && url.length > 10);
}

/**
 * An email picture: drop a file, choose one, or paste a link. Uploads go
 * straight to storage and come back as a public address, which is what
 * the block keeps.
 */
export function MarketingImageField({
  label,
  value,
  onChange,
  disabled = false,
  optional = false,
  compact = false,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** The picture can be left out (a card's). */
  optional?: boolean;
  compact?: boolean;
}) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useUploadMarketingImage();
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const shown = hasImage(value) ? value : null;
  const linkInvalid =
    pasting &&
    Boolean(value) &&
    (value ?? "").length > 8 &&
    !(value!.startsWith("https://") && isWebAddress(value!));

  async function send(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (
      !(MARKETING_IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)
    ) {
      setError("Choose a PNG, JPEG, GIF or WebP image.");
      return;
    }
    if (file.size > MARKETING_IMAGE_MAX_BYTES) {
      setError("That image is over 5 MB. Choose a smaller one.");
      return;
    }
    try {
      const result = await upload.mutateAsync(file);
      setPasting(false);
      onChange(result.url);
    } catch (problem) {
      setError(getApiError(problem).message);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    void send(event.dataTransfer.files[0]);
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-[12px] font-medium text-(--muted)">{label}</span>
      <div
        onDragOver={(event) => {
          if (disabled || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex min-w-0 items-center gap-3 rounded-xl border border-dashed p-2.5 transition-colors ${
          dragOver
            ? "border-(--accent) bg-(--accent)/8"
            : "border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-(--canvas)/40"
        }`}
      >
        <div
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--canvas) text-(--muted) ${
            compact ? "h-14 w-20" : "h-20 w-32"
          }`}
          aria-hidden="true"
        >
          {shown ? (
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <ImageSquare size={22} />
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || upload.isPending}
              onClick={() => fileInput.current?.click()}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) px-2.5 text-[12px] font-semibold text-(--text) transition-colors hover:border-(--accent)/40 disabled:pointer-events-none disabled:opacity-50"
            >
              <UploadSimple size={14} className="text-(--accent)" />
              {upload.isPending
                ? "Uploading…"
                : shown
                  ? "Replace"
                  : "Upload image"}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPasting((open) => !open)}
              aria-expanded={pasting}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 text-[12px] font-semibold text-(--muted) transition-colors hover:text-(--text) disabled:opacity-50"
            >
              <LinkSimple size={14} />
              Paste a link
            </button>
            {shown && optional ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(null)}
                aria-label="Remove the picture"
                title="Remove the picture"
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) hover:bg-rose-500/10 hover:text-rose-500"
              >
                <Trash size={14} />
              </button>
            ) : null}
          </div>
          <p className="m-0 text-[11.5px] text-(--muted)">
            {error ? (
              <span className="text-rose-500" role="alert">
                {error}
              </span>
            ) : (
              "Drop an image here. PNG, JPEG, GIF or WebP, up to 5 MB; 1200 px wide looks sharp."
            )}
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            void send(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {pasting ? (
        <div>
          <label htmlFor={inputId} className="sr-only">
            Image link
          </label>
          <input
            id={inputId}
            type="url"
            inputMode="url"
            value={value ?? ""}
            onChange={(event) =>
              onChange(
                optional && !event.target.value.trim()
                  ? null
                  : event.target.value,
              )
            }
            placeholder="https://.../banner.png"
            disabled={disabled}
            aria-invalid={linkInvalid || undefined}
            className={`${inputClass} w-full`}
          />
          {linkInvalid ? (
            <p className="mt-1 mb-0 text-[12px] text-rose-500">
              Use an image address starting with https://
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
