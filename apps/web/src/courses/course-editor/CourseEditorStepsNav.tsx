import type { RefObject } from "react";
import { handleRovingTabKeyDown } from "../../accessibility/rovingTabFocus";
import { type CourseWizardStepId, WIZARD_STEPS } from "./wizardSteps";

export interface CourseEditorStepsNavProps {
  stepsNavRef: RefObject<HTMLElement | null>;
  isEditing: boolean;
  handleNavMouseDown: (e: React.MouseEvent) => void;
  handleNavMouseLeave: () => void;
  handleNavMouseUp: () => void;
  handleNavMouseMove: (e: React.MouseEvent) => void;
  activeStep: CourseWizardStepId;
  isStepDirty: (stepId: CourseWizardStepId) => boolean;
  tabRefs: RefObject<{ [key: string]: HTMLButtonElement | null }>;
  isDownstreamUnlocked: boolean;
  actionLoading: "publish" | "draft" | "save" | "unpublish" | "validate" | null;
  isInitialLoadingCourse: boolean;
  navigateToStep: (destination: CourseWizardStepId) => Promise<void>;
  /** Whether this person's roles let them change the step. */
  isStepAllowed: (stepId: CourseWizardStepId) => boolean;
}

export function CourseEditorStepsNav({
  stepsNavRef,
  isEditing,
  handleNavMouseDown,
  handleNavMouseLeave,
  handleNavMouseUp,
  handleNavMouseMove,
  activeStep,
  isStepDirty,
  tabRefs,
  isDownstreamUnlocked,
  actionLoading,
  isInitialLoadingCourse,
  navigateToStep,
  isStepAllowed,
}: CourseEditorStepsNavProps) {
  // prettier-ignore
  return (
    <nav
      ref={stepsNavRef}
      className="course-wizard-steps-nav settings-tabs page-tabs border-b border-[color-mix(in_srgb,var(--text)_12%,transparent)] [&::after]:hidden!"
      aria-label={
        isEditing ? "Course editing steps" : "Course creation steps"
      }
      role="tablist"
      onMouseDown={handleNavMouseDown}
      onMouseLeave={handleNavMouseLeave}
      onMouseUp={handleNavMouseUp}
      onMouseMove={handleNavMouseMove}
    >
      {/* Standard page-tabs indicator - driven by --page-tab-indicator-* CSS vars */}
      <span className="page-tabs__indicator" aria-hidden="true" />
      {WIZARD_STEPS.map((step, idx) => {
        const Icon = step.Icon;
        const isActive = activeStep === step.id;
        const isDirty = isStepDirty(step.id);
        const isAllowed = isStepAllowed(step.id);
        return (
          <button
            key={step.id}
            id={`course-wizard-tab-${step.id}`}
            ref={(el) => {
              tabRefs.current[step.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls="course-wizard-tab-panel"
            aria-keyshortcuts={`Alt+${idx + 1}`}
            tabIndex={isActive ? 0 : -1}
            data-page-tab-tone={step.tone}
            data-swipe-tab-id={step.id}
            title={
              !isAllowed
                ? "Your role cannot change this step."
                : !isDownstreamUnlocked && step.id !== "basics"
                  ? "Add a course title to continue."
                  : undefined
            }
            disabled={
              actionLoading !== null ||
              (!isAllowed && !isActive) ||
              (!isDownstreamUnlocked && step.id !== "basics")
            }
            className={`inline-flex flex-row items-center gap-2 !border-b-transparent shrink-0 whitespace-nowrap disabled:!opacity-50 disabled:!cursor-not-allowed ${isActive ? "is-active" : ""}`}
            onClick={() => {
              if (isInitialLoadingCourse) return;
              void navigateToStep(step.id);
            }}
            onKeyDown={handleRovingTabKeyDown}
          >
            <Icon
              size={17}
              weight={isActive ? "fill" : "regular"}
              className="shrink-0"
            />
            <span className="inline-flex items-center gap-1.5">
              <span>{step.label}</span>
              {isDirty && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-(--accent) shrink-0"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
