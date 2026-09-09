import {
  CircleNotch,
  FileText,
  UploadSimple,
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
    <section className="mb-5 flex flex-col gap-2">
      <div className="mb-2 flex items-center justify-between gap-3 max-[768px]:flex-col max-[768px]:items-start">
        <label className="flex items-center gap-1.5 text-(--text-secondary) text-[0.84rem] font-semibold">
          Lesson Resources
        </label>
        <div className="flex items-center gap-2 max-[768px]:w-full">
          <button
            type="button"
            disabled={!courseId || disabled || isUploading}
            onClick={chooseResource}
            className="inline-flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[8px] border-none bg-(--accent) px-4 text-[0.8rem] font-bold text-(--on-accent,#ffffff) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            {isUploading ? (
              <CircleNotch size={15} className="animate-spin" />
            ) : (
              <UploadSimple size={15} />
            )}
            {isUploading ? "Uploading..." : "Upload"}
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
        <div className="w-full overflow-x-auto rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))]">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)]">
                <th className="px-4 py-2.5 text-[0.74rem] font-bold uppercase tracking-wider text-(--muted)">
                  File Name
                </th>
                <th className="px-4 py-2.5 text-[0.74rem] font-bold uppercase tracking-wider text-(--muted)">
                  Type
                </th>
                <th className="px-4 py-2.5 text-[0.74rem] font-bold uppercase tracking-wider text-(--muted)">
                  Size
                </th>
                <th className="px-4 py-2.5 pr-4 text-right text-[0.74rem] font-bold uppercase tracking-wider text-(--muted)">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => {
                const isDeleting = deletingResourceId === resource.id;
                return (
                  <tr
                    key={resource.id}
                    className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] last:border-b-0 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
                  >
                    <td className="px-4 py-3 text-[0.82rem] font-semibold text-(--text)">
                      <div className="flex items-center gap-2.5">
                        <FileText
                          size={16}
                          weight="fill"
                          className="shrink-0 text-red-400"
                        />
                        <span className="max-w-[28rem] truncate">
                          {resource.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[0.8rem] font-medium uppercase text-(--text-secondary)">
                      {resource.type}
                    </td>
                    <td className="px-4 py-3 text-[0.8rem] text-(--muted)">
                      {resource.size}
                    </td>
                    <td className="px-4 py-3 pr-4 text-right">
                      <button
                        type="button"
                        disabled={
                          disabled || isUploading || Boolean(deletingResourceId)
                        }
                        onClick={() => void handleRemove(resource)}
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0 text-(--muted) transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Remove ${resource.name}`}
                        title={
                          isDeleting ? "Removing resource" : "Remove resource"
                        }
                      >
                        {isDeleting ? (
                          <CircleNotch size={14} className="animate-spin" />
                        ) : (
                          <X size={14} weight="bold" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] px-4 py-4 text-[0.78rem] text-(--muted)">
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
