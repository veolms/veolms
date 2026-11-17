import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ImageSquareIcon as ImageSquare } from "@phosphor-icons/react/ImageSquare";
import type { SiteImage } from "@veolms/contracts";
import { useId, useRef, useState } from "react";
import { waitForCourseThumbnailCdnUrl } from "../../courses/courseMedia";
import { mediaService } from "../../services/media";
import {
  fieldLabelClasses,
  smallButtonClasses,
  textInputClasses,
} from "./editorStyles";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * A picture for a section: uploaded (public, served from the CDN) or by
 * address, with words for people who can't see it.
 */
export function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SiteImage;
  onChange: (value: SiteImage, typing?: boolean) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      setState("error");
      setMessage("Choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setState("error");
      setMessage("Choose an image under 8 MB.");
      return;
    }
    setState("uploading");
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
      const url = await waitForCourseThumbnailCdnUrl(presigned.mediaAssetId);
      if (!url || !/^https?:\/\//u.test(url)) {
        throw new Error("The picture couldn't be published. Try again.");
      }
      onChange({ ...value, src: url });
      setState("idle");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The picture couldn't be uploaded.",
      );
    }
  }

  return (
    <div className="grid gap-2">
      <span className={`${fieldLabelClasses} mb-0`}>{label}</span>
      <div className="flex items-center gap-3">
        <span className="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--text)_6%,transparent)] text-(--muted)">
          {value.src ? (
            <img src={value.src} alt="" className="size-full object-cover" />
          ) : (
            <ImageSquare size={22} aria-hidden="true" />
          )}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={smallButtonClasses}
            disabled={state === "uploading"}
            onClick={() => input.current?.click()}
          >
            {state === "uploading" ? (
              <CircleNotch
                size={14}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {state === "uploading"
              ? "Uploading…"
              : value.src
                ? "Change"
                : "Upload"}
          </button>
          {value.src ? (
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-(--muted) hover:text-rose-500"
              onClick={() => onChange({ src: "", alt: "" })}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {state === "error" ? (
        <span className="text-[12px] text-rose-500">{message}</span>
      ) : null}
      {value.src ? (
        <label className="block" htmlFor={id}>
          <span className={fieldLabelClasses}>
            What it shows (for people who can’t see it)
          </span>
          <input
            id={id}
            className={textInputClasses}
            value={value.alt}
            maxLength={200}
            onChange={(event) =>
              onChange({ ...value, alt: event.target.value }, true)
            }
          />
        </label>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
