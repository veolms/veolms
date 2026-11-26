import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/SlidersHorizontal";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/UploadSimple";
import {
  CERTIFICATE_DESIGN_MAX_BYTES,
  CERTIFICATE_DESIGN_MIN_IMAGE_SIDE,
  type CertificateDesign,
} from "@veolms/contracts/certificate-design";
import { useRef, useState } from "react";

import { ConfirmDeleteModal } from "../../ConfirmDeleteModal";
import { Button } from "../../components/Button";
import {
  certificateDesignsService,
  useActivateCertificateDesign,
  useCertificateDesigns,
  useDeleteCertificateDesign,
  useUploadCertificateDesign,
} from "../../services/certificates";
import { CertificateDesignEditor } from "./CertificateDesignEditor";
import { useDesignImage } from "./useDesignImage";

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"];

function describe(design: CertificateDesign): string {
  if (design.kind === "builtin") return "Ships with VeoLMS · A4 landscape";
  const type =
    design.contentType === "application/pdf"
      ? "PDF"
      : design.contentType === "image/png"
        ? "PNG"
        : "JPEG";
  const size = design.fileSize
    ? `${(design.fileSize / (1024 * 1024)).toFixed(1)} MB`
    : "";
  const shape =
    design.pageWidth >= design.pageHeight ? "landscape" : "portrait";
  return [type, size, shape].filter(Boolean).join(" · ");
}

/** A design's card: its picture with a sample certificate, and its actions. */
function DesignCard({
  design,
  busy,
  onActivate,
  onEdit,
  onDelete,
}: {
  design: CertificateDesign;
  busy: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const picture = useDesignImage(design, { withDetails: true });
  const [opening, setOpening] = useState(false);
  const openPreview = async () => {
    const tab = window.open("", "_blank");
    setOpening(true);
    try {
      const url = URL.createObjectURL(
        await certificateDesignsService.preview(design.id),
      );
      if (tab) tab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      tab?.close();
    } finally {
      setOpening(false);
    }
  };

  return (
    <li
      className={`flex flex-col overflow-hidden rounded-[14px] border bg-(--surface) shadow-(--card-shadow) ${
        design.isActive
          ? "border-[color-mix(in_srgb,var(--accent)_70%,transparent)]"
          : "border-[color-mix(in_srgb,var(--text)_8%,transparent)]"
      }`}
    >
      <div
        className="relative w-full bg-(--surface-strong)"
        style={{ aspectRatio: `${design.pageWidth} / ${design.pageHeight}` }}
      >
        {picture.data ? (
          <img
            src={picture.data}
            alt={`Sample certificate on ${design.name}`}
            loading="lazy"
            className="absolute inset-0 size-full object-fill"
          />
        ) : (
          <span
            className={`absolute inset-0 ${picture.error ? "" : "animate-pulse"} bg-[color-mix(in_srgb,var(--text)_6%,transparent)]`}
          />
        )}
        {design.isActive ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[0.72rem] font-bold text-white shadow">
            <CheckCircle size={14} weight="fill" aria-hidden="true" />
            Finalised
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="min-w-0">
          <p className="m-0 truncate text-[0.95rem] font-bold text-(--text)">
            {design.name}
          </p>
          <p className="m-0 mt-0.5 text-[0.78rem] text-(--muted)">
            {describe(design)}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {design.isActive ? null : (
            <Button
              className="h-9 rounded-lg px-3 text-sm"
              disabled={busy}
              onClick={onActivate}
            >
              Finalise
            </Button>
          )}
          {design.kind === "upload" ? (
            <Button
              variant="quiet"
              className="h-9 rounded-lg px-3 text-sm"
              onClick={onEdit}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              Place details
            </Button>
          ) : null}
          <Button
            variant="quiet"
            className="h-9 rounded-lg px-3 text-sm"
            disabled={opening}
            onClick={() => void openPreview()}
          >
            <Eye size={15} aria-hidden="true" />
            {opening ? "Preparing…" : "Preview"}
          </Button>
          {design.kind === "upload" && !design.isActive ? (
            <Button
              variant="danger"
              className="h-9 rounded-lg px-3 text-sm"
              aria-label={`Delete ${design.name}`}
              onClick={onDelete}
            >
              <Trash size={15} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * Platform > Certificates: the design certificates are drawn on. Staff
 * upload blank sheets, place the details on each, preview them, and
 * finalise one; every certificate downloaded from then on uses it.
 */
export function PlatformCertificatesTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const designs = useCertificateDesigns();
  const upload = useUploadCertificateDesign();
  const activate = useActivateCertificateDesign();
  const remove = useDeleteCertificateDesign();
  const fileInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CertificateDesign | null>(null);

  const items = designs.data?.items ?? [];
  const editing = items.find((item) => item.id === editingId) ?? null;

  const pick = (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!ACCEPTED.includes(file.type)) {
      setProblem("Upload a PDF, PNG or JPEG.");
      return;
    }
    if (file.size > CERTIFICATE_DESIGN_MAX_BYTES) {
      setProblem("The design must be 15 MB or smaller.");
      return;
    }
    const name =
      file.name.replace(/\.[a-z0-9]+$/iu, "").slice(0, 80) || "Design";
    setProgress(0);
    upload.mutate(
      { file, name, onProgress: setProgress },
      {
        onSuccess: (design) => {
          setNotice?.(
            `Uploaded ${design.name}. Place its details, then finalise it.`,
          );
          setEditingId(design.id);
        },
        onError: (error) => setProblem(error.message),
        onSettled: () => setProgress(null),
      },
    );
  };

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Certificates</h2>
          <p>
            The design certificates are printed on. Upload blank certificate
            sheets (a PDF, or a PNG or JPEG at least{" "}
            {CERTIFICATE_DESIGN_MIN_IMAGE_SIDE} pixels wide), place the
            learner&apos;s name and the other details on each, and finalise one.
            Every certificate downloaded from then on is drawn on the finalised
            design; certificates themselves are never stored, only their
            details.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          className="h-10 rounded-xl px-4 font-semibold"
          disabled={upload.isPending}
          onClick={() => fileInput.current?.click()}
        >
          <UploadSimple size={17} weight="bold" aria-hidden="true" />
          {upload.isPending
            ? progress !== null && progress < 100
              ? `Uploading… ${progress}%`
              : "Checking the file…"
            : "Upload a design"}
        </Button>
        {problem ? (
          <p className="m-0 text-[0.84rem] text-rose-500" role="alert">
            {problem}
          </p>
        ) : null}
        {activate.error || remove.error ? (
          <p className="m-0 text-[0.84rem] text-rose-500" role="alert">
            {(activate.error ?? remove.error)?.message}
          </p>
        ) : null}
      </div>

      {editing ? (
        <CertificateDesignEditor
          key={editing.id}
          design={editing}
          onClose={() => setEditingId(null)}
          setNotice={setNotice}
        />
      ) : null}

      {designs.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((key) => (
            <div
              key={key}
              className="aspect-[1.414] animate-pulse rounded-[14px] bg-(--surface-strong)"
            />
          ))}
        </div>
      ) : designs.error ? (
        <p className="m-0 text-sm text-(--muted)">
          We couldn&apos;t load the designs.{" "}
          <button
            type="button"
            onClick={() => void designs.refetch()}
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-(--accent) hover:underline"
          >
            Try again
          </button>
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((design) => (
            <DesignCard
              key={design.id}
              design={design}
              busy={activate.isPending}
              onActivate={() =>
                activate.mutate(design.id, {
                  onSuccess: () =>
                    setNotice?.(
                      `${design.name} is finalised. New downloads use it.`,
                    ),
                })
              }
              onEdit={() => setEditingId(design.id)}
              onDelete={() => setDeleting(design)}
            />
          ))}
        </ul>
      )}

      <ConfirmDeleteModal
        isOpen={deleting !== null}
        title="Delete design"
        message={`Delete ${deleting?.name ?? "this design"}? Its file is removed. Certificates are not affected: they are drawn on the finalised design.`}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          if (editingId === deleting.id) setEditingId(null);
          remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
