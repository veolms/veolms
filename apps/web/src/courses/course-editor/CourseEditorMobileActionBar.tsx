import type { Dispatch, SetStateAction } from "react";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type { CourseWizardStepId } from "./wizardSteps";

export interface CourseEditorMobileActionBarProps {
  bottomNavHidden: boolean;
  isPreviewModalOpen: boolean;
  isAddCategoryModalOpen: boolean;
  categoryToDelete: { id: string; name: string } | null;
  activeStep: CourseWizardStepId;
  isPublished: boolean;
  isAnyApiInProgress: boolean;
  isPreviewLoading: boolean;
  handlePreviewAction: () => Promise<void>;
  actionLoading: "publish" | "draft" | "save" | "unpublish" | "validate" | null;
  previousStepId: CourseWizardStepId | null | undefined;
  navigateToStep: (destination: CourseWizardStepId) => Promise<void>;
  handleValidateCourseAction: () => Promise<void>;
  isValidating: boolean;
  isDownstreamUnlocked: boolean;
  nextStepId: CourseWizardStepId | null | undefined;
  setIsUnpublishModalOpen: Dispatch<SetStateAction<boolean>>;
  isCourseReadyToPublish: boolean;
  handleFinalPublishCourse: () => Promise<void>;
}

export function CourseEditorMobileActionBar({
  bottomNavHidden,
  isPreviewModalOpen,
  isAddCategoryModalOpen,
  categoryToDelete,
  activeStep,
  isPublished,
  isAnyApiInProgress,
  isPreviewLoading,
  handlePreviewAction,
  actionLoading,
  previousStepId,
  navigateToStep,
  handleValidateCourseAction,
  isValidating,
  isDownstreamUnlocked,
  nextStepId,
  setIsUnpublishModalOpen,
  isCourseReadyToPublish,
  handleFinalPublishCourse,
}: CourseEditorMobileActionBarProps) {
  // prettier-ignore
  return (
    <div
      className={`course-wizard-mobile-action-bar${
        bottomNavHidden ||
        isPreviewModalOpen ||
        isAddCategoryModalOpen ||
        Boolean(categoryToDelete)
          ? " is-scroll-hidden"
          : ""
      }`}
    >
      {/* Preview Button */}
      {!(activeStep === "publish" && isPublished) && (
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 500,
            height: "44px",
            borderRadius: "12px",
            gap: "6px",
          }}
          className={`flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all active:scale-[0.98] ${
            isAnyApiInProgress || isPreviewLoading
              ? "!opacity-40 !cursor-not-allowed !pointer-events-none hover:!bg-transparent hover:!text-(--text-secondary)"
              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
          }`}
          onClick={handlePreviewAction}
          disabled={isAnyApiInProgress || isPreviewLoading}
        >
          {isPreviewLoading ? (
            <>
              <CircleNotch
                size={14}
                className="animate-spin text-(--accent)"
              />
              <span>Opening...</span>
            </>
          ) : (
            <>
              <Eye size={14} />
              <span>Preview</span>
            </>
          )}
        </button>
      )}

      {/* Previous Button */}
      {!(activeStep === "publish" && isPublished) && (
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 500,
            height: "44px",
            borderRadius: "12px",
            gap: "6px",
          }}
          className={`flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all active:scale-[0.98] ${
            activeStep === "basics" || actionLoading !== null
              ? "!opacity-40 !cursor-not-allowed !pointer-events-none hover:!bg-transparent hover:!text-(--text-secondary)"
              : "cursor-pointer hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:text-(--text)"
          }`}
          onClick={() => {
            if (previousStepId) void navigateToStep(previousStepId);
          }}
          disabled={activeStep === "basics" || actionLoading !== null}
          aria-label="Previous Step"
        >
          <CaretLeft size={14} />
          <span>Previous</span>
        </button>
      )}

      {/* Next Button / Validate on Publish */}
      {activeStep === "publish" ? (
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 500,
            height: "44px",
            borderRadius: "12px",
            gap: "6px",
          }}
          className="flex-1 inline-flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] cursor-pointer transition-all hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handleValidateCourseAction}
          disabled={actionLoading !== null || isValidating}
        >
          {actionLoading === "validate" || isValidating ? (
            <>
              <CircleNotch
                size={14}
                className="animate-spin text-(--accent)"
              />
              <span>Validating...</span>
            </>
          ) : (
            <>
              <CheckCircle size={14} weight="bold" />
              <span>Validate</span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          style={{
            fontSize: "0.84rem",
            fontWeight: 600,
            height: "44px",
            borderRadius: "12px",
            gap: "6px",
          }}
          className={`flex-1 inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
            actionLoading !== null ||
            (!isDownstreamUnlocked && activeStep === "basics")
              ? "!opacity-40 !cursor-not-allowed !shadow-none"
              : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98]"
          }`}
          onClick={() => {
            if (nextStepId) void navigateToStep(nextStepId);
          }}
          title={
            !isDownstreamUnlocked && activeStep === "basics"
              ? "Add a course title to continue."
              : undefined
          }
          disabled={
            actionLoading !== null ||
            (!isDownstreamUnlocked && activeStep === "basics")
          }
          aria-label="Next Step"
        >
          {actionLoading === "save" ? (
            <>
              <CircleNotch size={14} className="animate-spin text-white" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <span>Next</span>
              <CaretRight size={14} weight="bold" />
            </>
          )}
        </button>
      )}

      {/* Publish CTA Button only when on publish step */}
      {activeStep === "publish" && (
        <>
          {isPublished && (
            <button
              type="button"
              style={{
                fontSize: "0.84rem",
                fontWeight: 600,
                height: "44px",
                borderRadius: "14px",
                gap: "6px",
              }}
              className="flex-1 inline-flex items-center justify-center border border-red-500/35 text-red-400 bg-red-500/10 cursor-pointer transition-all hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={actionLoading !== null}
              onClick={() => setIsUnpublishModalOpen(true)}
            >
              {actionLoading === "unpublish" ? (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-red-400"
                  />
                  <span>Unpublishing...</span>
                </>
              ) : (
                <>
                  <XCircle size={15} weight="bold" />
                  <span>Unpublish</span>
                </>
              )}
            </button>
          )}

          {!isPublished && (
            <button
              type="button"
              style={{
                fontSize: "0.84rem",
                fontWeight: 600,
                height: "44px",
                borderRadius: "14px",
                gap: "6px",
              }}
              className={`flex-1 inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all ${
                !isCourseReadyToPublish
                  ? "!opacity-40 !cursor-not-allowed filter blur-[0.4px] pointer-events-none select-none !shadow-none"
                  : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98]"
              }`}
              disabled={actionLoading !== null || !isCourseReadyToPublish}
              onClick={handleFinalPublishCourse}
              title={
                !isCourseReadyToPublish
                  ? "Please resolve incomplete sections before publishing."
                  : undefined
              }
            >
              {actionLoading === "publish" ? (
                <>
                  <CircleNotch
                    size={15}
                    className="animate-spin text-white"
                  />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Lightning size={15} weight="bold" />
                  <span>Publish</span>
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}
