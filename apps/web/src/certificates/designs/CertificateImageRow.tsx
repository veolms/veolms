import { ImageIcon as ImageGlyph } from "@phosphor-icons/react/Image";
import { SealIcon as Seal } from "@phosphor-icons/react/Seal";
import { SignatureIcon as Signature } from "@phosphor-icons/react/Signature";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import {
  CERTIFICATE_IMAGE_RULES,
  type CertificateAcademySettings,
  type CertificateImageKind,
} from "@veolms/contracts/certificate";
import { useRef, useState } from "react";

import { Button } from "../../components/Button";
import {
  useCertificateImage,
  useRemoveCertificateImage,
  useUploadCertificateImage,
} from "../../services/certificates";

const IMAGE_TYPES = ["image/png", "image/jpeg"];

const COPY: Record<
  CertificateImageKind,
  { title: string; hint: string; none: string; saved: string; removed: string }
> = {
  signature: {
    title: "Signature",
    hint: "Printed above the signature line. The built-in design is navy, so use white ink on a transparent PNG.",
    none: "Anurag Singh's signature (built in)",
    saved: "The signature is saved. New certificates print it.",
    removed: "Certificates print Anurag Singh's signature again.",
  },
  badge: {
    title: "Badge",
    hint: "The seal on the right of the built-in design. A transparent PNG looks best.",
    none: "The ProCodrr badge (built in)",
    saved: "The badge is saved. New certificates print it.",
    removed: "Certificates print the ProCodrr badge again.",
  },
  background: {
    title: "Background",
    hint: "Artwork only (no text): the certificate's text is printed on it. Landscape A4 shape, such as 3508 × 2480 pixels.",
    none: "The navy background (built in)",
    saved: "The background is saved. New certificates use it.",
    removed: "Certificates use the navy background again.",
  },
};

const ICONS = { signature: Signature, badge: Seal, background: ImageGlyph };

/** Width and height of a picked image, read in the browser before uploading. */
function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The image could not be read."));
    };
    image.src = url;
  });
}

/**
 * One image of Platform > Certificates (signature, badge or background):
 * what is printed now, and upload, replace or remove. The file goes
 * straight to storage; the API checks it before it is used.
 */
export function CertificateImageRow({
  kind,
  settings,
  className,
  setNotice,
}: {
  kind: CertificateImageKind;
  settings: CertificateAcademySettings;
  className: string;
  setNotice?: (message: string) => void;
}) {
  const rules = CERTIFICATE_IMAGE_RULES[kind];
  const copy = COPY[kind];
  const Icon = ICONS[kind];
  const saved = settings[kind];
  const picture = useCertificateImage(kind, saved?.updatedAt ?? null);
  const upload = useUploadCertificateImage(kind);
  const remove = useRemoveCertificateImage(kind);
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const megabytes = Math.round(rules.maxBytes / (1024 * 1024));

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!IMAGE_TYPES.includes(file.type)) {
      setProblem("Upload a PNG or JPEG.");
      return;
    }
    if (file.size > rules.maxBytes) {
      setProblem(`The ${rules.label} must be ${megabytes} MB or smaller.`);
      return;
    }
    try {
      const size = await imageSize(file);
      if (size.width < rules.minWidth) {
        setProblem(
          `Use a sharper picture: at least ${rules.minWidth} pixels wide.`,
        );
        return;
      }
      const ratio = size.width / size.height;
      if (kind === "background" && (ratio < 1.3 || ratio > 1.55)) {
        setProblem(
          "The background must be landscape, in A4's shape (like 3508 × 2480 pixels).",
        );
        return;
      }
    } catch {
      setProblem("The image could not be read. Try another file.");
      return;
    }
    setProgress(0);
    upload.mutate(
      { file, onProgress: setProgress },
      {
        onSuccess: () => setNotice?.(copy.saved),
        onError: (error) => setProblem(error.message),
        onSettled: () => setProgress(null),
      },
    );
  };

  // Previews sit on the certificate's navy, as they are printed.
  const frame =
    kind === "background"
      ? "aspect-[1.414] w-44"
      : kind === "badge"
        ? "size-24"
        : "h-20 w-56";

  return (
    <div className={className}>
      <div>
        <p className="m-0 text-[0.9rem] font-semibold text-(--text)">
          {copy.title}
        </p>
        <p className="m-0 mt-0.5 text-[0.8rem] text-(--muted)">
          {copy.hint} At least {rules.minWidth} pixels wide, {megabytes} MB at
          most.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`grid ${frame} max-w-full shrink-0 place-items-center overflow-hidden rounded-lg bg-[#0B1036] shadow-[0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)]`}
        >
          {saved ? (
            picture.data ? (
              <img
                src={picture.data}
                alt={`The uploaded ${rules.label}`}
                className={
                  kind === "background"
                    ? "size-full object-cover"
                    : "max-h-full max-w-full object-contain p-1.5"
                }
              />
            ) : (
              <span
                className={`size-3/4 rounded ${picture.error ? "" : "animate-pulse"} bg-white/10`}
              />
            )
          ) : (
            <span className="inline-flex flex-col items-center gap-1 px-2 text-center text-[0.72rem] leading-tight text-white/70">
              <Icon size={18} aria-hidden="true" />
              {copy.none}
            </span>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          aria-label={`Upload a ${rules.label}`}
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={saved ? "quiet" : "primary"}
            className="h-9 rounded-lg px-3 text-sm"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <UploadSimple size={15} weight="bold" aria-hidden="true" />
            {upload.isPending
              ? progress !== null && progress < 100
                ? `Uploading… ${progress}%`
                : "Checking…"
              : saved
                ? "Replace"
                : `Upload ${rules.label}`}
          </Button>
          {saved ? (
            <Button
              variant="danger"
              className="h-9 rounded-lg px-3 text-sm"
              disabled={remove.isPending || upload.isPending}
              aria-label={`Remove the uploaded ${rules.label}`}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => setNotice?.(copy.removed),
                })
              }
            >
              <Trash size={15} aria-hidden="true" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {problem || remove.error ? (
        <p className="m-0 text-[0.82rem] text-rose-500" role="alert">
          {problem ?? remove.error?.message}
        </p>
      ) : null}
    </div>
  );
}
