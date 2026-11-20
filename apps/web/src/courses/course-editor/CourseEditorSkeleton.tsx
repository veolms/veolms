import { useLayoutEffect, useRef } from "react";
import "../../styles/features/course-wizard.css";
import { useLocation, useParams } from "react-router";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import {
  WIZARD_STEPS,
  parseWizardTab,
  type CourseWizardStepId,
} from "./wizardSteps";
import { CourseWizardSkeleton } from "./CourseWizardSkeleton";

export function CourseEditorSkeleton() {
  const { courseId, editTab } = useParams<{
    courseId?: string;
    editTab?: string;
  }>();
  const location = useLocation();

  const isEditing = Boolean(courseId || location?.pathname?.includes("/edit/"));
  const activeStep: CourseWizardStepId = parseWizardTab(editTab) || "basics";

  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const tab = nav?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    if (!nav || !tab) return;
    const update = () => {
      const style = getComputedStyle(tab);
      const token = style
        .getPropertyValue("--page-tab-active-indicator")
        .trim();
      const color = token.includes("--page-tab-tone")
        ? style.getPropertyValue("--page-tab-tone").trim()
        : token || "var(--accent)";
      nav.style.setProperty("--page-tab-indicator-left", `${tab.offsetLeft}px`);
      nav.style.setProperty(
        "--page-tab-indicator-width",
        `${tab.offsetWidth}px`,
      );
      nav.style.setProperty("--page-tab-indicator-color", color);
      if (
        tab.offsetLeft < nav.scrollLeft ||
        tab.offsetLeft + tab.offsetWidth > nav.scrollLeft + nav.offsetWidth
      ) {
        nav.scrollLeft =
          tab.offsetLeft - nav.offsetWidth / 2 + tab.offsetWidth / 2;
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [activeStep]);

  let subtitle = isEditing
    ? "Update the essential details of your course."
    : "Add the essential details of your course. You can always edit these later.";

  if (activeStep === "curriculum") {
    subtitle = isEditing
      ? "Manage and organize your course sections, lessons, and resources."
      : "Build your course structure by adding sections and lessons.";
  } else if (activeStep === "access-rules") {
    subtitle = isEditing
      ? "Update who can access this course and how long their access lasts."
      : "Control who can access this course and how long their access lasts.";
  } else if (activeStep === "pricing") {
    subtitle = isEditing
      ? "Update pricing, currency, and sale discounts for this course."
      : "Set how learners will purchase this course.";
  } else if (activeStep === "extras") {
    subtitle = isEditing
      ? "Update extra course settings, inclusions, and completion certificate."
      : "Add extra information and settings to enhance your course.";
  } else if (activeStep === "publish") {
    subtitle = isEditing
      ? "Review your course checklist and publish when ready."
      : "Review your course and publish it when you're ready.";
  }

  return (
    <div
      className="relative flex w-full flex-1 flex-col min-h-full p-0 text-[--text] box-border"
      data-course-wizard
      data-testid="course-editor-skeleton"
    >
      <header className="relative shrink-0 mb-2 max-[768px]:mb-1.5 max-[768px]:w-full max-[768px]:max-w-full max-[768px]:min-w-0 max-[768px]:box-border">
        <div className="flex items-start justify-between gap-4 mb-1 max-[768px]:flex-col max-[768px]:gap-2 max-[768px]:mb-1.5">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              className="flex w-9 h-9 shrink-0 items-center justify-center border border-[color-mix(in_srgb,var(--text)_12%,transparent)] rounded-lg text-(--text-secondary) bg-[color-mix(in_srgb,var(--text)_4%,transparent)] cursor-pointer"
              aria-label="Go back"
              onClick={() => window.history.back()}
            >
              <ArrowLeft size={17} weight="bold" />
            </button>
            <div className="pt-0.5 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="m-0 text-(--text) text-[clamp(1.2rem,1.8vw,1.55rem)] font-bold tracking-[-0.015em] leading-[1.2]">
                  {isEditing ? "Edit Course" : "Create New Course"}
                </h1>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium tracking-[0.02em] border border-[color-mix(in_srgb,var(--text)_14%,transparent)] text-transparent bg-[color-mix(in_srgb,var(--text)_8%,transparent)] animate-pulse select-none"
                  aria-hidden="true"
                >
                  Loading
                </span>
              </div>
              <p className="m-0 mt-0.5 text-(--muted) text-[0.82rem] max-w-155 leading-[1.35]">
                {subtitle}
              </p>
            </div>
          </div>
        </div>
      </header>

      <nav
        ref={navRef}
        className="course-wizard-steps-nav settings-tabs page-tabs border-b border-[color-mix(in_srgb,var(--text)_12%,transparent)] [&::after]:hidden!"
        role="tablist"
        aria-label={
          isEditing ? "Course editing steps" : "Course creation steps"
        }
      >
        <span className="page-tabs__indicator" aria-hidden="true" />
        {WIZARD_STEPS.map((step) => {
          const Icon = step.Icon;
          const isActive = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              data-page-tab-tone={step.tone}
              className={`inline-flex flex-row items-center gap-2 !border-b-transparent shrink-0 whitespace-nowrap cursor-default ${isActive ? "is-active" : ""}`}
            >
              <Icon
                size={17}
                weight={isActive ? "fill" : "regular"}
                className="shrink-0"
              />
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      <CourseWizardSkeleton activeStep={activeStep} />
    </div>
  );
}
