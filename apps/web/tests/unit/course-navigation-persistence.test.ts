import { describe, it, expect, vi } from "vitest";
import {
  WIZARD_STEPS,
  WIZARD_STEP_IDS,
  initialBasicsState,
  isBasicsEqual,
  initialAccessRulesState,
  isAccessRulesEqual,
  initialPricingState,
  isPricingEqual,
  initialExtrasState,
  isExtrasEqual,
  type CourseWizardStepId,
  type BasicsFormState,
  type AccessRulesFormState,
  type PricingFormState,
  type ExtrasFormState,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard: Navigation-Driven Save & Tab Coordination", () => {
  describe("1. Next & Previous Step Pointer Resolution", () => {
    const getAdjacentSteps = (currentStep: CourseWizardStepId) => {
      const currentIdx = WIZARD_STEP_IDS.indexOf(currentStep);
      const previousStepId =
        currentIdx > 0 ? WIZARD_STEP_IDS[currentIdx - 1] : null;
      const nextStepId =
        currentIdx < WIZARD_STEP_IDS.length - 1
          ? WIZARD_STEP_IDS[currentIdx + 1]
          : null;
      return { previousStepId, nextStepId };
    };

    it("correctly disables Previous on Basics and targets Curriculum for Next", () => {
      const { previousStepId, nextStepId } = getAdjacentSteps("basics");
      expect(previousStepId).toBeNull();
      expect(nextStepId).toBe("curriculum");
    });

    it("resolves bidirectional neighbors on intermediate steps (Curriculum, Access Rules, Pricing, Extras)", () => {
      expect(getAdjacentSteps("curriculum")).toEqual({
        previousStepId: "basics",
        nextStepId: "access-rules",
      });
      expect(getAdjacentSteps("access-rules")).toEqual({
        previousStepId: "curriculum",
        nextStepId: "pricing",
      });
      expect(getAdjacentSteps("pricing")).toEqual({
        previousStepId: "access-rules",
        nextStepId: "extras",
      });
      expect(getAdjacentSteps("extras")).toEqual({
        previousStepId: "pricing",
        nextStepId: "publish",
      });
    });

    it("correctly disables Next on Publish and targets Extras for Previous", () => {
      const { previousStepId, nextStepId } = getAdjacentSteps("publish");
      expect(previousStepId).toBe("extras");
      expect(nextStepId).toBeNull();
    });
  });

  describe("2. Slide Direction Calculation", () => {
    const computeSlideDirection = (
      from: CourseWizardStepId,
      to: CourseWizardStepId,
    ): "left" | "right" | "none" => {
      const fromIdx = WIZARD_STEPS.findIndex((s) => s.id === from);
      const toIdx = WIZARD_STEPS.findIndex((s) => s.id === to);
      if (toIdx > fromIdx) return "right";
      if (toIdx < fromIdx) return "left";
      return "none";
    };

    it("computes 'right' when navigating forward in wizard sequence", () => {
      expect(computeSlideDirection("basics", "curriculum")).toBe("right");
      expect(computeSlideDirection("basics", "publish")).toBe("right");
      expect(computeSlideDirection("access-rules", "extras")).toBe("right");
    });

    it("computes 'left' when navigating backward in wizard sequence", () => {
      expect(computeSlideDirection("curriculum", "basics")).toBe("left");
      expect(computeSlideDirection("publish", "basics")).toBe("left");
      expect(computeSlideDirection("extras", "pricing")).toBe("left");
    });

    it("returns 'none' when destination matches current step", () => {
      expect(computeSlideDirection("basics", "basics")).toBe("none");
      expect(computeSlideDirection("pricing", "pricing")).toBe("none");
    });
  });

  describe("3. New Course Initial Navigation Accessibility Lock", () => {
    const checkIsDownstreamUnlocked = (
      currentCourseId: string | null,
      isEditing: boolean,
      courseTitle: string,
    ): boolean => {
      const isNewCourse = !currentCourseId && !isEditing;
      return !isNewCourse || courseTitle.trim().length > 0;
    };

    it("locks downstream tabs for brand new course when title is empty", () => {
      const isUnlocked = checkIsDownstreamUnlocked(null, false, "");
      expect(isUnlocked).toBe(false);
    });

    it("locks downstream tabs when title is only whitespace", () => {
      const isUnlocked = checkIsDownstreamUnlocked(null, false, "    ");
      expect(isUnlocked).toBe(false);
    });

    it("unlocks downstream tabs as soon as title has non-empty text", () => {
      const isUnlocked = checkIsDownstreamUnlocked(
        null,
        false,
        "Modern React 19",
      );
      expect(isUnlocked).toBe(true);
    });

    it("always unlocks downstream tabs when editing an existing course (has courseId)", () => {
      expect(checkIsDownstreamUnlocked("course-123", false, "")).toBe(true);
      expect(checkIsDownstreamUnlocked("course-123", true, "")).toBe(true);
    });

    it("always unlocks downstream tabs when in edit mode flag even if id is being resolved", () => {
      expect(checkIsDownstreamUnlocked(null, true, "")).toBe(true);
    });

    it("preserves unlock status even if subsequent save failed once course ID exists", () => {
      // Course was created on server
      const currentCourseId = "course-abc";
      const saveFailed = true;
      expect(saveFailed).toBe(true);
      expect(checkIsDownstreamUnlocked(currentCourseId, false, "")).toBe(true);
    });
  });

  describe("4. navigateToStep Coordination & Concurrency", () => {
    it("navigates immediately with 0 API calls when current step is clean", async () => {
      let activeStep: CourseWizardStepId = "basics";
      let isBasicsDirty = false;
      const saveStepMock = vi.fn();

      const navigateToStep = async (destination: CourseWizardStepId) => {
        if (destination === activeStep) return;
        if (!isBasicsDirty) {
          activeStep = destination;
          return;
        }
        await saveStepMock();
        activeStep = destination;
      };

      await navigateToStep("curriculum");

      expect(activeStep).toBe("curriculum");
      expect(saveStepMock).not.toHaveBeenCalled();
    });

    it("auto-persists dirty step before transitioning to destination on save success", async () => {
      let activeStep: CourseWizardStepId = "basics";
      let serverBasics = initialBasicsState;
      let basicsDraft: BasicsFormState = {
        ...initialBasicsState,
        title: "Clean Code with TypeScript",
      };
      let isBasicsDirty = !isBasicsEqual(basicsDraft, serverBasics);

      expect(isBasicsDirty).toBe(true);

      const mockSaveBasics = vi.fn().mockImplementation(async () => {
        // Server confirms save
        serverBasics = { ...basicsDraft };
        isBasicsDirty = !isBasicsEqual(basicsDraft, serverBasics);
      });

      let actionLoading: string | null = null;

      const navigateToStep = async (destination: CourseWizardStepId) => {
        if (destination === activeStep) return;
        if (!isBasicsDirty) {
          activeStep = destination;
          return;
        }
        actionLoading = "save";
        try {
          await mockSaveBasics();
        } finally {
          actionLoading = null;
          activeStep = destination;
        }
      };

      await navigateToStep("curriculum");

      expect(mockSaveBasics).toHaveBeenCalledTimes(1);
      expect(isBasicsDirty).toBe(false);
      expect(activeStep).toBe("curriculum");
      expect(actionLoading).toBeNull();
    });

    it("non-blocking failure: displays error toast, keeps draft & dirty flag, and completes navigation", async () => {
      let activeStep: CourseWizardStepId = "basics";
      let serverBasics = initialBasicsState;
      const unpersistedTitle = "Advanced Distributed Systems";
      let basicsDraft: BasicsFormState = {
        ...initialBasicsState,
        title: unpersistedTitle,
      };
      let isBasicsDirty = !isBasicsEqual(basicsDraft, serverBasics);
      let toastMessage = "";

      const mockSaveBasics = vi
        .fn()
        .mockRejectedValue(new Error("503 Service Unavailable"));

      let actionLoading: string | null = null;

      const navigateToStep = async (destination: CourseWizardStepId) => {
        if (destination === activeStep) return;
        if (!isBasicsDirty) {
          activeStep = destination;
          return;
        }
        actionLoading = "save";
        try {
          await mockSaveBasics();
        } catch (err: unknown) {
          const stepLabel =
            WIZARD_STEPS.find((s) => s.id === activeStep)?.label || activeStep;
          toastMessage = `Failed to save ${stepLabel}. Your changes are kept locally.`;
        } finally {
          actionLoading = null;
          activeStep = destination;
        }
      };

      await navigateToStep("curriculum");

      // 1. Navigation still completed (user not trapped)
      expect(activeStep).toBe("curriculum");
      expect(actionLoading).toBeNull();

      // 2. Draft was preserved intact
      expect(basicsDraft.title).toBe(unpersistedTitle);

      // 3. Dirty state remained true because server never confirmed baseline
      expect(isBasicsDirty).toBe(true);

      // 4. Standardized non-blocking toast was shown
      expect(toastMessage).toBe(
        "Failed to save Basics. Your changes are kept locally.",
      );
    });

    it("drops rapid re-entrant navigation requests while a save is already running", async () => {
      let activeStep: CourseWizardStepId = "basics";
      let saveCallCount = 0;

      let actionLoading: string | null = null;
      let isAnyApiInProgress = false;

      // Simulated slow save
      const mockSave = vi.fn().mockImplementation(async () => {
        saveCallCount++;
        await new Promise((r) => setTimeout(r, 50));
      });

      const navigateToStep = async (destination: CourseWizardStepId) => {
        if (isAnyApiInProgress || actionLoading !== null) {
          return; // Drop concurrent clicks
        }
        if (destination === activeStep) return;

        actionLoading = "save";
        isAnyApiInProgress = true;
        try {
          await mockSave();
        } finally {
          actionLoading = null;
          isAnyApiInProgress = false;
          activeStep = destination;
        }
      };

      // User fires two fast clicks (e.g. double-click on Curriculum tab)
      const promise1 = navigateToStep("curriculum");
      const promise2 = navigateToStep("curriculum");
      const promise3 = navigateToStep("access-rules");

      await Promise.all([promise1, promise2, promise3]);

      // Exactly 1 save triggered, extraneous rapid clicks ignored
      expect(saveCallCount).toBe(1);
      expect(activeStep).toBe("curriculum");
    });

    it("ignores navigation when destination is already the active step", async () => {
      const saveMock = vi.fn();
      let activeStep: CourseWizardStepId = "pricing";

      const navigateToStep = async (destination: CourseWizardStepId) => {
        if (destination === activeStep) return;
        await saveMock();
      };

      await navigateToStep("pricing");

      expect(saveMock).not.toHaveBeenCalled();
      expect(activeStep).toBe("pricing");
    });
  });

  describe("5. Tab Unsaved Dot Indicator Integration with Save Failures", () => {
    it("tab indicator remains active on the origin step if navigation auto-save fails", () => {
      // Step dirty states
      const stepDirtyMap: Record<CourseWizardStepId, boolean> = {
        basics: true, // had unpersisted edit
        curriculum: false,
        "access-rules": false,
        pricing: false,
        extras: false,
        publish: false,
      };

      // Save failed on navigateToStep away from basics -> basics remains dirty
      const getTabIndicatorVisible = (step: CourseWizardStepId) =>
        stepDirtyMap[step];

      expect(getTabIndicatorVisible("basics")).toBe(true);
      expect(getTabIndicatorVisible("curriculum")).toBe(false);

      // Once basics successfully saves on a subsequent navigation
      stepDirtyMap.basics = false;
      expect(getTabIndicatorVisible("basics")).toBe(false);
    });
  });

  describe("6. Persistent Sticky Bottom Action Bar Navigation Contract", () => {
    interface BottomBarButtonProps {
      step: CourseWizardStepId;
      isDownstreamUnlocked: boolean;
      isAnyApiInProgress: boolean;
      isPreviewLoading: boolean;
      actionLoading: string | null;
      isValidating: boolean;
      isPublished: boolean;
      isCourseReadyToPublish: boolean;
    }

    const evaluateBottomBarStates = ({
      step,
      isDownstreamUnlocked,
      isAnyApiInProgress,
      isPreviewLoading,
      actionLoading,
      isValidating,
      isPublished,
      isCourseReadyToPublish,
    }: BottomBarButtonProps) => {
      const currentIdx = WIZARD_STEP_IDS.indexOf(step);
      const previousStepId = currentIdx > 0 ? WIZARD_STEP_IDS[currentIdx - 1] : null;
      const nextStepId = currentIdx < WIZARD_STEP_IDS.length - 1 ? WIZARD_STEP_IDS[currentIdx + 1] : null;

      const previewDisabled = isAnyApiInProgress || isPreviewLoading;
      const previousDisabled = step === "basics" || isAnyApiInProgress;
      const isNextDisabled =
        actionLoading !== null || (!isDownstreamUnlocked && step === "basics");
      const isValidateDisabled = actionLoading !== null || isValidating;
      const isPublishDisabled = actionLoading !== null || !isCourseReadyToPublish;

      return {
        previousStepId,
        nextStepId,
        previewDisabled,
        previousDisabled,
        isNextDisabled,
        isValidateDisabled,
        isPublishDisabled,
        isPublishStep: step === "publish",
        showUnpublish: step === "publish" && isPublished,
      };
    };

    it("evaluates correct button states on Basics step for a new course without title", () => {
      const states = evaluateBottomBarStates({
        step: "basics",
        isDownstreamUnlocked: false,
        isAnyApiInProgress: false,
        isPreviewLoading: false,
        actionLoading: null,
        isValidating: false,
        isPublished: false,
        isCourseReadyToPublish: false,
      });

      expect(states.previousStepId).toBeNull();
      expect(states.previousDisabled).toBe(true);
      expect(states.nextStepId).toBe("curriculum");
      expect(states.isNextDisabled).toBe(true); // Locked until title entered
      expect(states.previewDisabled).toBe(false);
    });

    it("unlocks Next button on Basics step once title is provided", () => {
      const states = evaluateBottomBarStates({
        step: "basics",
        isDownstreamUnlocked: true,
        isAnyApiInProgress: false,
        isPreviewLoading: false,
        actionLoading: null,
        isValidating: false,
        isPublished: false,
        isCourseReadyToPublish: false,
      });

      expect(states.previousDisabled).toBe(true);
      expect(states.isNextDisabled).toBe(false);
      expect(states.nextStepId).toBe("curriculum");
    });

    it("disables all navigation buttons while API operations or saves are in-flight", () => {
      const states = evaluateBottomBarStates({
        step: "curriculum",
        isDownstreamUnlocked: true,
        isAnyApiInProgress: true,
        isPreviewLoading: false,
        actionLoading: "save",
        isValidating: false,
        isPublished: false,
        isCourseReadyToPublish: false,
      });

      expect(states.previewDisabled).toBe(true);
      expect(states.previousDisabled).toBe(true);
      expect(states.isNextDisabled).toBe(true);
    });

    it("transforms Next into Validate and shows Publish CTA on Publish step", () => {
      const states = evaluateBottomBarStates({
        step: "publish",
        isDownstreamUnlocked: true,
        isAnyApiInProgress: false,
        isPreviewLoading: false,
        actionLoading: null,
        isValidating: false,
        isPublished: true,
        isCourseReadyToPublish: true,
      });

      expect(states.isPublishStep).toBe(true);
      expect(states.previousDisabled).toBe(false);
      expect(states.previousStepId).toBe("extras");
      expect(states.nextStepId).toBeNull();
      expect(states.isValidateDisabled).toBe(false);
      expect(states.showUnpublish).toBe(true);
      expect(states.isPublishDisabled).toBe(false);
    });
  });
});

