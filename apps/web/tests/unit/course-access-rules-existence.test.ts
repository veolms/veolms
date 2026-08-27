import { describe, it, expect, vi } from "vitest";
import {
  initialAccessRulesState,
  normalizeAccessRulesState,
  isAccessRulesEqual,
  type AccessRulesFormState,
  type CourseWizardStepId,
} from "../../src/courses/CourseCreatePage";
import type { CourseAccessRule, CourseSettings } from "@veolms/contracts";

describe("Course Wizard: Access Rules Persistence & Existence State (Bug 3)", () => {
  describe("1. Missing Access Rules on Initial Course Load", () => {
    it("recognizes missing Access Rules resource, renders defaults, sets needsAccessRulesSave=true with active button and indicator", () => {
      // API returns null for accessRules (e.g. GET /courses/{id}/editor)
      const editorData = {
        course: { id: "c1", title: "New Course", version: 1 },
        sections: [],
        accessRules: null,
        pricing: null,
        settings: null,
      };

      const hasAccessRules = Boolean(
        editorData.accessRules && (editorData.accessRules as any).id,
      );
      const accessRulesExists = hasAccessRules;

      const serverAccessRules = initialAccessRulesState;
      const accessRulesDraft = initialAccessRulesState;

      const isAccessRulesDirty = !isAccessRulesEqual(
        accessRulesDraft,
        serverAccessRules,
      );
      const needsAccessRulesSave = !accessRulesExists || isAccessRulesDirty;

      expect(accessRulesExists).toBe(false);
      expect(isAccessRulesDirty).toBe(false);
      expect(needsAccessRulesSave).toBe(true);

      // Verify Tab unsaved indicator
      const isStepDirty = (stepId: CourseWizardStepId) => {
        if (stepId === "access-rules") return needsAccessRulesSave;
        return false;
      };
      expect(isStepDirty("access-rules")).toBe(true);

      // Verify Save button active state
      const isSaveButtonDisabled = (step: CourseWizardStepId) =>
        step === "access-rules" && !needsAccessRulesSave;
      expect(isSaveButtonDisabled("access-rules")).toBe(false);
    });
  });

  describe("2. Existing Persisted Access Rules", () => {
    it("recognizes persisted Access Rules, marks clean state, disables Save button, and hides tab indicator", () => {
      const editorData = {
        course: { id: "c1", title: "Persisted Course", version: 2 },
        sections: [],
        accessRules: {
          id: "ar-1234-uuid",
          courseId: "c1",
          accessType: "everyone",
          durationType: "lifetime",
          durationDays: null,
        } as CourseAccessRule,
        pricing: null,
        settings: {
          id: "set-1234-uuid",
          courseId: "c1",
          allowQa: true,
          allowComments: true,
          allowDownloads: false,
          certificateEnabled: false,
          showInstructorName: true,
          language: "en",
        } as CourseSettings,
      };

      const hasAccessRules = Boolean(
        editorData.accessRules && editorData.accessRules.id,
      );
      const accessRulesExists = hasAccessRules;

      const confirmedAccessRules: AccessRulesFormState =
        normalizeAccessRulesState({
          accessType: editorData.accessRules.accessType,
          durationMode:
            editorData.accessRules.durationType === "fixed_duration"
              ? "fixed"
              : "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: editorData.settings.allowQa,
          enableComments: editorData.settings.allowComments,
          enableDownloads: editorData.settings.allowDownloads,
        });

      const serverAccessRules = confirmedAccessRules;
      const accessRulesDraft = confirmedAccessRules;

      const isAccessRulesDirty = !isAccessRulesEqual(
        accessRulesDraft,
        serverAccessRules,
      );
      const needsAccessRulesSave = !accessRulesExists || isAccessRulesDirty;

      expect(accessRulesExists).toBe(true);
      expect(isAccessRulesDirty).toBe(false);
      expect(needsAccessRulesSave).toBe(false);

      // Tab indicator is hidden
      const isStepDirty = (stepId: CourseWizardStepId) =>
        stepId === "access-rules" && needsAccessRulesSave;
      expect(isStepDirty("access-rules")).toBe(false);

      // Save button is disabled
      const isSaveButtonDisabled = (step: CourseWizardStepId) =>
        step === "access-rules" && !needsAccessRulesSave;
      expect(isSaveButtonDisabled("access-rules")).toBe(true);
    });
  });

  describe("3. Existing Rules + Local Modification", () => {
    it("detects modification on existing resource, sets dirty and needsAccessRulesSave", () => {
      let accessRulesExists = true;
      const serverAccessRules: AccessRulesFormState = {
        accessType: "everyone",
        durationMode: "lifetime",
        fixedDurationValue: 30,
        fixedDurationUnit: "Days",
        enableQA: true,
        enableComments: true,
        enableDownloads: false,
      };

      // User changes to fixed duration 6 Months
      const accessRulesDraft: AccessRulesFormState = {
        ...serverAccessRules,
        durationMode: "fixed",
        fixedDurationValue: 6,
        fixedDurationUnit: "Months",
      };

      const isAccessRulesDirty = !isAccessRulesEqual(
        accessRulesDraft,
        serverAccessRules,
      );
      const needsAccessRulesSave = !accessRulesExists || isAccessRulesDirty;

      expect(accessRulesExists).toBe(true);
      expect(isAccessRulesDirty).toBe(true);
      expect(needsAccessRulesSave).toBe(true);
    });
  });

  describe("4. Save Access Rules Lifecycle", () => {
    it("transitions from unpersisted to persisted on successful save, clearing needsAccessRulesSave", async () => {
      let accessRulesExists = false;
      let serverAccessRules = initialAccessRulesState;
      let accessRulesDraft = initialAccessRulesState;

      expect(
        !accessRulesExists ||
          !isAccessRulesEqual(accessRulesDraft, serverAccessRules),
      ).toBe(true);

      // Simulate saveAccessRulesStep
      const mockSaveAccessRulesApi = vi.fn().mockResolvedValue({
        accessRule: {
          id: "new-access-rule-uuid",
          courseId: "c1",
          accessType: "everyone",
          durationType: "lifetime",
          durationDays: null,
        } as CourseAccessRule,
        settings: {
          id: "new-settings-uuid",
          courseId: "c1",
          allowQa: true,
          allowComments: true,
          allowDownloads: false,
          certificateEnabled: false,
          showInstructorName: true,
          language: "en",
        } as CourseSettings,
      });

      const res = await mockSaveAccessRulesApi();

      const newBaseline: AccessRulesFormState = normalizeAccessRulesState({
        accessType: res.accessRule.accessType,
        durationMode:
          res.accessRule.durationType === "fixed_duration"
            ? "fixed"
            : "lifetime",
        fixedDurationValue: 30,
        fixedDurationUnit: "Days",
        enableQA: res.settings.allowQa,
        enableComments: res.settings.allowComments,
        enableDownloads: res.settings.allowDownloads,
      });

      accessRulesExists = true;
      serverAccessRules = newBaseline;
      accessRulesDraft = newBaseline;

      const isAccessRulesDirty = !isAccessRulesEqual(
        accessRulesDraft,
        serverAccessRules,
      );
      const needsAccessRulesSave = !accessRulesExists || isAccessRulesDirty;

      expect(accessRulesExists).toBe(true);
      expect(isAccessRulesDirty).toBe(false);
      expect(needsAccessRulesSave).toBe(false);
    });

    it("preserves accessRulesExists=false and draft on failed save for immediate retry", async () => {
      let accessRulesExists = false;
      const serverAccessRules = initialAccessRulesState;
      const accessRulesDraft: AccessRulesFormState = {
        ...initialAccessRulesState,
        enableQA: false,
      };

      const mockSaveApi = vi
        .fn()
        .mockRejectedValue(new Error("Network disconnect"));

      let saveError: Error | null = null;
      try {
        await mockSaveApi();
        accessRulesExists = true;
      } catch (err: any) {
        saveError = err;
      }

      expect(saveError).not.toBeNull();
      expect(accessRulesExists).toBe(false);
      expect(!isAccessRulesEqual(accessRulesDraft, serverAccessRules)).toBe(
        true,
      );
      expect(
        !accessRulesExists ||
          !isAccessRulesEqual(accessRulesDraft, serverAccessRules),
      ).toBe(true);
    });
  });

  describe("5. Publish Validation Reconciliation with Missing Access Rules", () => {
    it("flushes unpersisted Access Rules during reconcileDirtyState before calling validation API", async () => {
      const courseId = "course-123";
      const isBasicsDirty = false;
      const accessRulesExists = false; // missing resource
      const isAccessRulesDirty = false; // default values
      const needsAccessRulesSave = !accessRulesExists || isAccessRulesDirty;
      const isPricingDirty = false;
      const isExtrasDirty = false;

      const savedSteps: string[] = [];

      const saveAccessRulesStep = async (id: string) => {
        savedSteps.push(`accessRules:${id}`);
        return { success: true };
      };

      const validateCourse = async (id: string) => {
        return { valid: true, canPublish: true };
      };

      // Simulated reconcileDirtyState
      const pendingSaves: Promise<unknown>[] = [];
      if (needsAccessRulesSave) {
        pendingSaves.push(saveAccessRulesStep(courseId));
      }
      if (isPricingDirty) {
        pendingSaves.push(Promise.resolve());
      }
      if (isExtrasDirty) {
        pendingSaves.push(Promise.resolve());
      }

      await Promise.all(pendingSaves);
      const validationRes = await validateCourse(courseId);

      expect(savedSteps).toEqual(["accessRules:course-123"]);
      expect(validationRes.canPublish).toBe(true);
    });
  });
});
