import {
  CircleNotch,
  FileText,
  Plus,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useRef, useState, type ChangeEvent } from "react";
import type {
  CreateLessonResourceRequest,
  LessonResource,
} from "@veolms/contracts";
import { mediaService } from "../../services/media";

const RESOURCE_ACCEPT =
  ".pdf,.txt,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.csv,.ppt,.pptx,.xls,.xlsx";
const RESOURCE_MAX_SIZE_BYTES = 100 * 1024 * 1024;

export interface LessonResourceItem {
  id: string;
  name: string;
  type: string;
  size: string;
  mediaAssetId: string;
  mimeType?: string;
  sizeBytes?: number;
  status?: "uploading" | "uploaded" | "ready" | "failed";
}

interface LessonResourceManagerProps {
  courseId: string | null;
  lessonId: string;
  resources: LessonResourceItem[];
  disabled?: boolean;
  onCreateResource: (
    payload: CreateLessonResourceRequest,
  ) => Promise<LessonResource>;
  onResourceAdded: (resource: LessonResourceItem) => void;
  onDeleteResource: (resourceId: string) => Promise<void>;
  onResourceRemoved: (resource: LessonResourceItem) => void;
}

export function LessonResourceManager({
  courseId,
  lessonId,
  resources,
  disabled = false,
  onCreateResource,
  onResourceAdded,
  onDeleteResource,
  onResourceRemoved,
}: LessonResourceManagerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chooseResource = () => {
    if (!courseId || disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setErrorMessage(null);
    const validationError = validateResourceFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (!courseId || disabled || isUploading) return;

    setIsUploading(true);
    setUploadFileName(file.name);
    setUploadProgress(0);

    try {
      const contentType = file.type || "application/octet-stream";
      const presigned = await mediaService.presignMediaUpload({
        filename: file.name,
        contentType,
        fileSize: file.size,
        type: "document",
      });

      await mediaService.uploadFileToPresignedUrl(
        presigned.uploadUrl,
        file,
        ({ percent }) => setUploadProgress(percent),
      );

      const confirmation = await mediaService.confirmUpload(
        presigned.mediaAssetId,
      );
      if (
        confirmation.status !== "uploaded" &&
        confirmation.status !== "ready"
      ) {
        throw new Error("The uploaded resource could not be verified.");
      }

      const created = await onCreateResource({
        mediaAssetId: presigned.mediaAssetId,
        title: truncateResourceTitle(file.name),
      });
      onResourceAdded(toLessonResourceItem(created, file));
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The resource could not be uploaded.",
      );
    } finally {
      setIsUploading(false);
      setUploadFileName(null);
      setUploadProgress(0);
    }
  };

  const handleRemove = async (resource: LessonResourceItem) => {
    if (disabled || isUploading || deletingResourceId) return;

    setErrorMessage(null);
    setDeletingResourceId(resource.id);
    try {
      await onDeleteResource(resource.id);
      onResourceRemoved(resource);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The resource could not be removed.",
      );
    } finally {
      setDeletingResourceId(null);
    }
  };

  return (
    <section className="mb-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 max-[768px]:flex-col max-[768px]:items-start">
        <label className="flex items-center gap-1.5 text-(--text-secondary) text-[0.84rem] font-semibold">
          Lesson Resources
        </label>
        <div className="flex items-center gap-2 max-[768px]:w-full">
          <button
            type="button"
            disabled={!courseId || disabled || isUploading}
            onClick={chooseResource}
            style={{
              fontSize: "0.84rem",
              fontWeight: 600,
            }}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[8px] border-none bg-(--accent) px-3 text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {isUploading ? (
              <CircleNotch size={15} className="animate-spin" />
            ) : (
              <Plus size={15} weight="bold" />
            )}
            {isUploading ? "Adding..." : "Add Resource"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={RESOURCE_ACCEPT}
            onChange={(event) => void handleFileChange(event)}
            className="sr-only"
            aria-label="Choose a lesson resource"
          />
        </div>
      </div>

      {isUploading && uploadFileName && (
        <div
          className="rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-3 py-2.5"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center justify-between gap-3 text-[0.74rem]">
            <span className="min-w-0 truncate text-(--text)">
              Uploading {uploadFileName}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-(--accent)">
              {uploadProgress}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]">
            <div
              className="h-full rounded-full bg-(--accent) transition-[width] duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          className="flex items-start gap-2 rounded-[10px] bg-rose-500/10 px-3 py-2.5 text-[0.74rem] text-rose-400"
          role="alert"
        >
          <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {resources.length > 0 ? (
        <div className="overflow-hidden rounded-[8px] border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
          {resources.map((resource) => {
            const isDeleting = deletingResourceId === resource.id;
            return (
              <div
                key={resource.id}
                className="flex items-center gap-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2 last:border-b-0 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
              >
                <FileText
                  size={16}
                  weight="fill"
                  className="shrink-0 text-red-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.8rem] font-semibold text-(--text)">
                    {resource.name}
                  </div>
                  <div className="mt-0.5 text-[0.72rem] text-(--muted)">
                    <span>{resource.type}</span>{" "}
                    <span aria-hidden="true">·</span>{" "}
                    <span>{resource.size}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={
                    disabled || isUploading || Boolean(deletingResourceId)
                  }
                  onClick={() => void handleRemove(resource)}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-(--muted) transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={"Remove " + resource.name}
                  title={isDeleting ? "Removing resource" : "Remove resource"}
                >
                  {isDeleting ? (
                    <CircleNotch size={14} className="animate-spin" />
                  ) : (
                    <X size={14} weight="bold" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[8px] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-3 py-2.5 text-[0.76rem] text-(--muted)">
          No resources added to this lesson yet.
        </div>
      )}
    </section>
  );
}

function validateResourceFile(file: File): string | null {
  if (file.size <= 0) return "The selected resource is empty.";
  if (file.size > RESOURCE_MAX_SIZE_BYTES) {
    return "Resources must be 100 MB or smaller.";
  }
  return null;
}

function truncateResourceTitle(filename: string): string {
  return filename.trim().slice(0, 100) || "Lesson resource";
}

export function toLessonResourceItem(
  resource: LessonResource,
  fallbackFile?: File,
): LessonResourceItem {
  const filename =
    resource.mediaAsset?.originalFilename ||
    fallbackFile?.name ||
    resource.title;
  const mimeType = resource.mediaAsset?.mimeType || fallbackFile?.type;
  const sizeBytes = resource.mediaAsset?.sizeBytes ?? fallbackFile?.size;

  return {
    id: resource.id,
    name: resource.title || filename,
    type: getResourceType(filename, mimeType),
    size: formatFileSize(sizeBytes),
    mediaAssetId: resource.mediaAssetId,
    mimeType,
    sizeBytes,
    status: resource.mediaAsset?.status,
  };
}

function getResourceType(filename: string, mimeType?: string): string {
  const extension = filename.split(".").pop()?.trim().toUpperCase();
  if (
    extension &&
    extension !== filename.toUpperCase() &&
    extension.length <= 8
  ) {
    return extension === "JPEG" ? "JPG" : extension;
  }

  const subtype = mimeType?.split("/").pop()?.trim().toUpperCase();
  return subtype && subtype.length <= 8 ? subtype : "FILE";
}

function formatFileSize(sizeBytes?: number): string {
  if (sizeBytes === undefined || !Number.isFinite(sizeBytes)) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;

  const units = ["KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = -1;
  do {
    size /= 1024;
    unitIndex += 1;
  } while (size >= 1024 && unitIndex < units.length - 1);

  const rounded = size >= 10 ? Math.round(size) : Number(size.toFixed(1));
  return `${rounded} ${units[unitIndex]}`;
}
