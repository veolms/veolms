import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import type { CourseWizardStepId } from "./wizardSteps";

export interface CourseEditorHeaderProps {
  handleBack: () => void;
  isEditing: boolean;
  isPublished: boolean;
  activeStep: CourseWizardStepId;
  publishValidationError: string | null;
}

export function CourseEditorHeader({
  handleBack,
  isEditing,
  isPublished,
  activeStep,
  publishValidationError,
}: CourseEditorHeaderProps) {
  // prettier-ignore
  return (
    <header className="relative shrink-0 mb-2 max-[768px]:mb-1.5 max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0 max-[768px]:box-border">
      <div className="flex items-start justify-between gap-4 mb-1 max-[768px]:flex-col max-[768px]:gap-2 max-[768px]:mb-1.5">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            className="flex w-9 h-9 shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg text-(--text-secondary) bg-[color-mix(in_srgb,var(--text)_4%,transparent)] cursor-pointer transition-[border-color,background-color,color] duration-150 ease-out hover:border-[color-mix(in_srgb,var(--text)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text)"
            onClick={handleBack}
            aria-label="Go back"
          >
            <ArrowLeft size={17} weight="bold" />
          </button>
          <div className="pt-0.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="m-0 text-(--text) text-[clamp(1.2rem,1.8vw,1.55rem)] font-bold tracking-[-0.015em] leading-[1.2]">
                {isEditing ? "Edit Course" : "Create New Course"}
              </h1>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium tracking-[0.02em] ${
                  isPublished
                    ? "is-published border border-green-500/35 text-green-400 bg-green-500/12"
                    : "border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-(--muted) bg-[color-mix(in_srgb,var(--text)_5%,transparent)]"
                }`}
              >
                {isPublished ? "Published" : "Draft"}
              </span>
            </div>
            <p className="m-0 mt-0.5 text-(--muted) text-[0.82rem] max-w-155 leading-[1.35]">
              {activeStep === "curriculum"
                ? isEditing
                  ? "Manage and organize your course sections, lessons, and resources."
                  : "Build your course structure by adding sections and lessons."
                : activeStep === "access-rules"
                  ? isEditing
                    ? "Update who can access this course and how long their access lasts."
                    : "Control who can access this course and how long their access lasts."
                  : activeStep === "pricing"
                    ? isEditing
                      ? "Update pricing, currency, and sale discounts for this course."
                      : "Set how learners will purchase this course."
                    : activeStep === "extras"
                      ? isEditing
                        ? "Update extra course settings, inclusions, and completion certificate."
                        : "Add extra information and settings to enhance your course."
                      : activeStep === "publish"
                        ? isPublished
                          ? "Review your changes and update the published course."
                          : isEditing
                            ? "Review your course checklist and publish when ready."
                            : "Review your course and publish it when you're ready."
                        : isEditing
                          ? "Update the essential details of your course."
                          : "Add the essential details of your course. You can always edit these later."}
            </p>
          </div>
        </div>
      </div>

      {/* Publish validation error toast if any */}
      {publishValidationError && activeStep === "publish" && (
        <div className="flex items-center gap-2.5 mb-3 border border-red-400/35 rounded-[10px] px-4 py-2 text-red-400 bg-red-500/12 backdrop-blur-md shadow-[0_4px_16px_rgba(239,68,68,0.15)] text-[0.84rem] font-semibold animate-[bannerSlideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          <Info size={16} weight="bold" />
          <span>{publishValidationError}</span>
        </div>
      )}
    </header>
  );
}
