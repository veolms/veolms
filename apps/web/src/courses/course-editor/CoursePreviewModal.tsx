import type { Dispatch, SetStateAction } from "react";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { XIcon as X } from "@phosphor-icons/react/X";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import type {
  RefetchOptions,
  QueryObserverResult,
} from "@tanstack/react-query";
import {
  CourseOverviewPage,
  CourseOverviewSkeleton,
} from "../CourseOverviewPage";
import type { ApiError } from "../../lib/api-error";
import type { CourseEditorDataResponse } from "@veolms/contracts";

export interface CoursePreviewModalProps {
  setIsPreviewModalOpen: Dispatch<SetStateAction<boolean>>;
  hasUnsavedChanges: boolean;
  currentCourseId: string | null;
  activePreviewData: CourseEditorDataResponse | undefined;
  serverCategories: { id: string; name: string; slug: string }[];
  isPreviewLoading: boolean;
  isPreviewError: boolean;
  refetchPreview: (
    options?: RefetchOptions,
  ) => Promise<QueryObserverResult<CourseEditorDataResponse, ApiError>>;
}

export function CoursePreviewModal({
  setIsPreviewModalOpen,
  hasUnsavedChanges,
  currentCourseId,
  activePreviewData,
  serverCategories,
  isPreviewLoading,
  isPreviewError,
  refetchPreview,
}: CoursePreviewModalProps) {
  // prettier-ignore
  return (
    <div
      className="fixed inset-0 z-1200 flex flex-col bg-black/80 backdrop-blur-xs animate-[deleteModalFadeIn_0.2s_ease-out] p-4 box-border max-[640px]:p-0"
      onClick={() => setIsPreviewModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Course Overview Preview"
    >
      <div
        className="relative flex flex-col w-full max-w-345 h-full max-h-[94vh] m-auto border border-[color-mix(in_srgb,var(--text)_14%,transparent)] rounded-[20px] bg-[color-mix(in_srgb,var(--surface)_24%,var(--canvas))] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden animate-[deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[640px]:max-h-screen max-[640px]:h-screen max-[640px]:rounded-none max-[640px]:border-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--surface) shrink-0 max-[640px]:px-3.5 max-[640px]:py-2.5">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2 min-w-0 flex-1 max-[640px]:gap-1.5">
            <div className="inline-flex items-center gap-2 text-[0.92rem] font-bold text-(--text) tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis max-[640px]:text-[0.85rem]">
              <Eye size={18} weight="bold" />
              <span>Student Course Overview Preview</span>
            </div>
            {hasUnsavedChanges ? (
              <span className="inline-flex items-center gap-1.25 px-2.25 py-0.75 rounded-full border border-[color-mix(in_srgb,#f59e0b_35%,transparent)] bg-[color-mix(in_srgb,#f59e0b_15%,transparent)] text-[#d97706] dark:text-[#fbbf24] text-[0.7rem] font-[650] whitespace-nowrap shrink-0 max-[640px]:text-[0.66rem] max-[640px]:px-1.75 max-[640px]:py-0.5">
                <Info size={12} weight="bold" />
                Last saved version
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.25 px-2.25 py-0.75 rounded-full border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_40%,transparent)] text-(--muted) text-[0.7rem] font-medium whitespace-nowrap shrink-0 max-[640px]:text-[0.66rem] max-[640px]:px-1.75 max-[640px]:py-0.5">
                <CheckCircle
                  size={12}
                  weight="fill"
                  className="text-(--accent)"
                />
                Previewing saved version
              </span>
            )}
          </div>
          <button
            type="button"
            className="inline-flex w-7 h-7 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--surface-strong)72%,transparent)] text-(--muted) hover:text-(--text) hover:bg-[color-mix(in_srgb,var(--surface)48%,transparent)] transition-all duration-150 bg-transparent cursor-pointer p-0"
            onClick={() => setIsPreviewModalOpen(false)}
            aria-label="Close Preview"
          >
            <X size={15} />
          </button>
        </div>

        {/* Informational banner when unsaved changes exist in editor */}
        {hasUnsavedChanges && currentCourseId && (
          <div className="flex items-center gap-2 px-5 py-2 bg-[color-mix(in_srgb,#f59e0b_10%,var(--surface))] border-b border-[color-mix(in_srgb,#f59e0b_22%,transparent)] text-[#d97706] dark:text-[#fbbf24] text-[0.79rem] font-medium shrink-0 max-[640px]:px-3.5 max-[640px]:py-1.75">
            <Info
              size={15}
              className="shrink-0 text-[#f59e0b]"
              weight="bold"
            />
            <span className="leading-snug">
              This preview reflects the last saved version on the server.
              Save your current changes in the editor to update the
              preview.
            </span>
          </div>
        )}

        {/* Modal Body: Render authentic CourseOverviewPage */}
        <div className="flex-1 min-h-0 overflow-y-auto p-0 flex flex-col">
          {!currentCourseId ? (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[420px] p-8 text-center text-(--muted) my-auto">
              <BookOpen
                size={44}
                className="mb-3.5 opacity-60 text-(--accent)"
              />
              <h3 className="text-[1.15rem] font-bold text-(--text) mb-1.5">
                No Saved Course Data
              </h3>
              <p className="text-[0.88rem] max-w-[420px] mb-5 text-(--muted) leading-[1.45]">
                Please save the course before opening Preview.
              </p>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                style={{
                  fontSize: "0.80rem",
                  fontWeight: 700,
                  height: "34px",
                  borderRadius: "8px",
                  gap: "6px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                }}
                className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
              >
                <ArrowLeft size={15} weight="bold" />
                <span>Back to Editor</span>
              </button>
            </div>
          ) : activePreviewData ? (
            <CourseOverviewPage
              previewData={activePreviewData}
              categories={serverCategories}
              isReadOnlyPreview={true}
              onNavigateCourses={() => setIsPreviewModalOpen(false)}
            />
          ) : isPreviewLoading ? (
            <div className="p-6 max-[640px]:p-3 w-full">
              <CourseOverviewSkeleton
                onNavigateCourses={() => setIsPreviewModalOpen(false)}
              />
            </div>
          ) : isPreviewError ? (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[420px] p-12 text-center text-(--muted) my-auto">
              <div className="w-10 h-10 rounded-full bg-[rgba(239,68,68,0.12)] text-[#ef4444] flex items-center justify-center mb-3">
                <X size={20} />
              </div>
              <h3 className="text-[1.05rem] font-bold text-(--text) mb-1">
                Failed to Load Preview
              </h3>
              <p className="text-[0.86rem] max-w-[400px] mb-4 text-(--muted)">
                An error occurred while fetching the course preview from
                the server.
              </p>
              <button
                type="button"
                onClick={() => refetchPreview()}
                style={{
                  fontSize: "0.80rem",
                  fontWeight: 700,
                  height: "34px",
                  borderRadius: "8px",
                  gap: "6px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                }}
                className="inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
              >
                <span>Retry</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
