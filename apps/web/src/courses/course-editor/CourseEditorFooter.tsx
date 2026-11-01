import type { Dispatch, SetStateAction } from "react";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { LightningIcon as Lightning } from "@phosphor-icons/react/Lightning";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type { CourseWizardStepId } from "./wizardSteps";

export interface CourseEditorFooterProps {
  activeStep: CourseWizardStepId;
  isPublished: boolean;
  isAnyApiInProgress: boolean;
  isPreviewLoading: boolean;
  handlePreviewAction: () => Promise<void>;
  basicsOverallStatus: "failed" | "saving" | "saved" | null;
  curriculumOverallStatus: "failed" | "saving" | "saved" | null;
  accessRulesOverallStatus: "failed" | "saving" | "saved" | null;
  pricingOverallStatus: "failed" | "saving" | "saved" | null;
  extrasOverallStatus: "failed" | "saving" | "saved" | null;
  publishOverallStatus: "failed" | "saving" | "saved" | null;
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

export function CourseEditorFooter({
  activeStep,
  isPublished,
  isAnyApiInProgress,
  isPreviewLoading,
  handlePreviewAction,
  basicsOverallStatus,
  curriculumOverallStatus,
  accessRulesOverallStatus,
  pricingOverallStatus,
  extrasOverallStatus,
  publishOverallStatus,
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
}: CourseEditorFooterProps) {
  // prettier-ignore
  return (
    <div
      className="course-wizard-sticky-bottom-bar"
      data-testid="course-wizard-sticky-bottom-bar"
    >
      <div className="relative flex items-center justify-between gap-2.5 sm:gap-3 w-full max-w-[1400px] mx-auto">
        {/* Left: Preview Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          {!(activeStep === "publish" && isPublished) && (
            <button
              type="button"
              style={{
                fontSize: "0.80rem",
                fontWeight: 700,
                height: "34px",
                borderRadius: "8px",
                gap: "6px",
                paddingLeft: "14px",
                paddingRight: "14px",
              }}
              className={`inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all duration-150 ${
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
                  <Eye size={15} />
                  <span>Preview</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Center: True horizontal center save status */}
        {activeStep === "basics" && basicsOverallStatus && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
            data-testid="basics-overall-save-status"
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
              {basicsOverallStatus === "saving" && (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                  <span className="text-(--text-secondary)">
                    Saving changes...
                  </span>
                </>
              )}
              {basicsOverallStatus === "failed" && (
                <>
                  <WarningCircle
                    size={14}
                    weight="fill"
                    className="text-rose-500 shrink-0"
                  />
                  <span className="text-rose-500">Save failed</span>
                </>
              )}
              {basicsOverallStatus === "saved" && (
                <>
                  <CheckCircle
                    size={14}
                    weight="fill"
                    className="text-emerald-500 shrink-0"
                  />
                  <span className="text-emerald-500">All changes saved</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Center: True horizontal center save status for Curriculum */}
        {activeStep === "curriculum" && curriculumOverallStatus && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
            data-testid="curriculum-overall-save-status"
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
              {curriculumOverallStatus === "saving" && (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                  <span className="text-(--text-secondary)">
                    Saving changes...
                  </span>
                </>
              )}
              {curriculumOverallStatus === "failed" && (
                <>
                  <WarningCircle
                    size={14}
                    weight="fill"
                    className="text-rose-500 shrink-0"
                  />
                  <span className="text-rose-500">Save failed</span>
                </>
              )}
              {curriculumOverallStatus === "saved" && (
                <>
                  <CheckCircle
                    size={14}
                    weight="fill"
                    className="text-emerald-500 shrink-0"
                  />
                  <span className="text-emerald-500">All changes saved</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Center: True horizontal center save status for Access Rules */}
        {activeStep === "access-rules" && accessRulesOverallStatus && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
            data-testid="access-rules-overall-save-status"
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
              {accessRulesOverallStatus === "saving" && (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                  <span className="text-(--text-secondary)">
                    Saving changes...
                  </span>
                </>
              )}
              {accessRulesOverallStatus === "failed" && (
                <>
                  <WarningCircle
                    size={14}
                    weight="fill"
                    className="text-rose-500 shrink-0"
                  />
                  <span className="text-rose-500">Save failed</span>
                </>
              )}
              {accessRulesOverallStatus === "saved" && (
                <>
                  <CheckCircle
                    size={14}
                    weight="fill"
                    className="text-emerald-500 shrink-0"
                  />
                  <span className="text-emerald-500">All changes saved</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Center: True horizontal center save status for Pricing */}
        {activeStep === "pricing" && pricingOverallStatus && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
            data-testid="pricing-overall-save-status"
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
              {pricingOverallStatus === "saving" && (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                  <span className="text-(--text-secondary)">
                    Saving changes...
                  </span>
                </>
              )}
              {pricingOverallStatus === "failed" && (
                <>
                  <WarningCircle
                    size={14}
                    weight="fill"
                    className="text-rose-500 shrink-0"
                  />
                  <span className="text-rose-500">Save failed</span>
                </>
              )}
              {pricingOverallStatus === "saved" && (
                <>
                  <CheckCircle
                    size={14}
                    weight="fill"
                    className="text-emerald-500 shrink-0"
                  />
                  <span className="text-emerald-500">All changes saved</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Center: True horizontal center save status for Extras */}
        {activeStep === "extras" && extrasOverallStatus && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
            data-testid="extras-overall-save-status"
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
              {extrasOverallStatus === "saving" && (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                  <span className="text-(--text-secondary)">
                    Saving changes...
                  </span>
                </>
              )}
              {extrasOverallStatus === "failed" && (
                <>
                  <WarningCircle
                    size={14}
                    weight="fill"
                    className="text-rose-500 shrink-0"
                  />
                  <span className="text-rose-500">Save failed</span>
                </>
              )}
              {extrasOverallStatus === "saved" && (
                <>
                  <CheckCircle
                    size={14}
                    weight="fill"
                    className="text-emerald-500 shrink-0"
                  />
                  <span className="text-emerald-500">All changes saved</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Center: True horizontal center save status for Publish */}
        {activeStep === "publish" && publishOverallStatus && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-10 select-none transition-all duration-200"
            data-testid="publish-overall-save-status"
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.78rem] font-medium bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] border border-[color-mix(in_srgb,var(--border)_70%,transparent)] shadow-xs backdrop-blur-xs select-none">
              {publishOverallStatus === "saving" && (
                <>
                  <CircleNotch
                    size={14}
                    className="animate-spin text-(--accent)"
                  />
                  <span className="text-(--text-secondary)">
                    Saving changes...
                  </span>
                </>
              )}
              {publishOverallStatus === "failed" && (
                <>
                  <WarningCircle
                    size={14}
                    weight="fill"
                    className="text-rose-500 shrink-0"
                  />
                  <span className="text-rose-500">Save failed</span>
                </>
              )}
              {publishOverallStatus === "saved" && (
                <>
                  <CheckCircle
                    size={14}
                    weight="fill"
                    className="text-emerald-500 shrink-0"
                  />
                  <span className="text-emerald-500">All changes saved</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Right: Previous & Next / Validate / Publish Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap justify-end">
          {/* Previous Button */}
          {!(activeStep === "publish" && isPublished) && (
            <button
              type="button"
              style={{
                fontSize: "0.80rem",
                fontWeight: 700,
                height: "34px",
                borderRadius: "8px",
                gap: "6px",
                paddingLeft: "14px",
                paddingRight: "14px",
              }}
              className={`inline-flex items-center border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--text-secondary) bg-transparent transition-all duration-150 ${
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
              <CaretLeft size={15} />
              <span>Previous</span>
            </button>
          )}

          {/* Next Button / Validate on Publish */}
          {activeStep === "publish" ? (
            <button
              type="button"
              style={{
                fontSize: "0.80rem",
                fontWeight: 700,
                height: "34px",
                borderRadius: "8px",
                gap: "6px",
                paddingLeft: "16px",
                paddingRight: "16px",
              }}
              className="inline-flex items-center border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-(--accent) bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] cursor-pointer transition-all duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] disabled:opacity-60 disabled:cursor-not-allowed"
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
                  <CheckCircle size={15} weight="bold" />
                  <span>Validate</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              style={{
                fontSize: "0.80rem",
                fontWeight: 700,
                height: "34px",
                borderRadius: "8px",
                gap: "6px",
                paddingLeft: "16px",
                paddingRight: "16px",
              }}
              className={`inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                actionLoading !== null ||
                (!isDownstreamUnlocked && activeStep === "basics")
                  ? "!opacity-40 !cursor-not-allowed !shadow-none"
                  : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
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
                  <CircleNotch
                    size={14}
                    className="animate-spin text-white"
                  />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Next</span>
                  <CaretRight size={15} weight="bold" />
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
                    fontSize: "0.80rem",
                    fontWeight: 700,
                    height: "34px",
                    borderRadius: "8px",
                    gap: "6px",
                    paddingLeft: "14px",
                    paddingRight: "14px",
                  }}
                  className="inline-flex items-center justify-center border border-red-500/30 text-red-400 bg-red-500/10 cursor-pointer transition-all duration-150 hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={actionLoading !== null}
                  onClick={() => setIsUnpublishModalOpen(true)}
                  title="Unpublish this course and return it to draft state"
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
                    fontSize: "0.80rem",
                    fontWeight: 700,
                    height: "34px",
                    borderRadius: "8px",
                    gap: "6px",
                    paddingLeft: "18px",
                    paddingRight: "18px",
                  }}
                  className={`inline-flex items-center justify-center border-none text-(--on-accent,#ffffff) bg-(--accent) shadow-[0_3px_10px_var(--accent-shadow)] transition-all duration-150 ease-out ${
                    !isCourseReadyToPublish
                      ? "!opacity-40 !cursor-not-allowed filter blur-[0.4px] pointer-events-none select-none !shadow-none"
                      : "cursor-pointer hover:bg-(--accent-hover,var(--accent)) hover:shadow-[0_4px_14px_var(--accent-shadow)] active:scale-[0.98]"
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
      </div>
    </div>
  );
}
