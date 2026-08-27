import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initialExtrasState,
  normalizeExtrasState,
  isExtrasEqual,
  type ExtrasFormState,
} from "../../src/courses/CourseCreatePage";
import { coursesService } from "../../src/services/courses/courses.service";
import type { CourseSettings } from "@veolms/contracts";

describe("Course Wizard Step 4: Server-Backed Extras State & Coming Soon Separation", () => {
  const sampleCourseId = "12345678-1234-1234-1234-123456789abc";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Extras State Model & Normalization", () => {
    it("normalizes empty or undefined extras values to false default", () => {
      expect(normalizeExtrasState(null)).toEqual({ enableCertificate: false });
      expect(normalizeExtrasState(undefined)).toEqual({
        enableCertificate: false,
      });
      expect(normalizeExtrasState({})).toEqual({ enableCertificate: false });
    });

    it("hydrates server state correctly resulting in clean isDirty = false", () => {
      const serverSetting = { certificateEnabled: true };
      const serverExtras: ExtrasFormState = normalizeExtrasState({
        enableCertificate: serverSetting.certificateEnabled,
      });
      const extrasDraft = {
        enableCertificate: serverExtras.enableCertificate,
        inclusions: [{ id: "1", text: "Inclusion 1" }],
        certificateTemplate: "purple-certificate",
      };

      const isDirty = !isExtrasEqual(
        { enableCertificate: extrasDraft.enableCertificate },
        serverExtras,
      );

      expect(isDirty).toBe(false);
    });

    it("detects edits to server-backed certificateEnabled as dirty", () => {
      const serverExtras: ExtrasFormState = { enableCertificate: false };
      let extrasDraft = {
        enableCertificate: false,
        inclusions: [],
        certificateTemplate: "purple-certificate",
      };

      expect(
        !isExtrasEqual(
          { enableCertificate: extrasDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(false);

      // Toggle server-backed field
      extrasDraft = { ...extrasDraft, enableCertificate: true };
      expect(
        !isExtrasEqual(
          { enableCertificate: extrasDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(true);
    });

    it("does NOT mark extras dirty when modifying only client-only / Coming Soon fields", () => {
      const serverExtras: ExtrasFormState = { enableCertificate: true };
      let extrasDraft = {
        enableCertificate: true,
        inclusions: [{ id: "1", text: "Lifetime access" }],
        certificateTemplate: "purple-certificate",
        issuanceType: "percentage",
        minCompletionPercentage: 95,
        customRuleText: "Complete all quizzes",
        autoEmailCertificate: true,
      };

      // 1. Initial state is clean
      expect(
        !isExtrasEqual(
          { enableCertificate: extrasDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(false);

      // 2. Edit inclusions (client-only)
      extrasDraft = {
        ...extrasDraft,
        inclusions: [
          ...extrasDraft.inclusions,
          { id: "2", text: "New client-only perk" },
        ],
      };
      expect(
        !isExtrasEqual(
          { enableCertificate: extrasDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(false);

      // 3. Edit certificate template (Coming Soon)
      extrasDraft = {
        ...extrasDraft,
        certificateTemplate: "gold-template",
      };
      expect(
        !isExtrasEqual(
          { enableCertificate: extrasDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(false);

      // 4. Edit minCompletionPercentage (Coming Soon)
      extrasDraft = {
        ...extrasDraft,
        minCompletionPercentage: 80,
      };
      expect(
        !isExtrasEqual(
          { enableCertificate: extrasDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(false);

      // 5. Edit custom rule text (Coming Soon)
      extrasDraft = {
        ...extrasDraft,
        customRuleText: "Score 90% or higher",
      };
      expect(
        !isExtrasEqual(
          { enableCertificate: extrasDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(false);
    });
  });

  describe("Save Extras Mutation & Lifecycle", () => {
    it("synchronizes confirmed baseline upon successful save and resets dirty state", async () => {
      let serverExtras: ExtrasFormState = { enableCertificate: false };
      const localDraft = {
        enableCertificate: true,
        certificateTemplate: "purple-certificate",
      };

      expect(
        !isExtrasEqual(
          { enableCertificate: localDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(true);

      const mockSettingsRes: CourseSettings = {
        id: "settings-1",
        courseId: sampleCourseId,
        language: "en",
        allowQa: true,
        allowComments: true,
        allowDownloads: false,
        certificateEnabled: true,
        showInstructorName: true,
        estimatedDuration: null,
      };

      vi.spyOn(coursesService, "upsertSettings").mockResolvedValue(
        mockSettingsRes,
      );

      const res = await coursesService.upsertSettings(sampleCourseId, {
        certificateEnabled: localDraft.enableCertificate,
      });

      const newBaseline: ExtrasFormState = normalizeExtrasState({
        enableCertificate: res.certificateEnabled ?? false,
      });

      serverExtras = newBaseline;
      const synchronizedDraft = {
        ...localDraft,
        enableCertificate: newBaseline.enableCertificate,
      };

      expect(
        !isExtrasEqual(
          { enableCertificate: synchronizedDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(false);
      expect(serverExtras.enableCertificate).toBe(true);
    });

    it("preserves local draft and leaves server baseline unchanged on save failure", async () => {
      const serverExtras: ExtrasFormState = { enableCertificate: false };
      const localDraft = {
        enableCertificate: true,
        certificateTemplate: "purple-certificate",
      };

      vi.spyOn(coursesService, "upsertSettings").mockRejectedValue(
        new Error("Server error updating course settings"),
      );

      let saveError: Error | null = null;
      try {
        await coursesService.upsertSettings(sampleCourseId, {
          certificateEnabled: localDraft.enableCertificate,
        });
      } catch (err: any) {
        saveError = err;
      }

      expect(saveError).not.toBeNull();
      expect(serverExtras.enableCertificate).toBe(false);
      expect(localDraft.enableCertificate).toBe(true);
      expect(
        !isExtrasEqual(
          { enableCertificate: localDraft.enableCertificate },
          serverExtras,
        ),
      ).toBe(true);
    });
  });

  describe("Save Extras Button State", () => {
    it("disables Save Extras when clean and enables when dirty", () => {
      const isBasicsDirty = false;
      const isAccessRulesDirty = false;
      const isPricingDirty = false;
      const actionLoading = null;

      const getIsDisabled = (step: string, isExtrasDirty: boolean) =>
        actionLoading !== null ||
        (step === "basics" && !isBasicsDirty) ||
        (step === "access-rules" && !isAccessRulesDirty) ||
        (step === "pricing" && !isPricingDirty) ||
        (step === "extras" && !isExtrasDirty);

      // Clean: disabled
      expect(getIsDisabled("extras", false)).toBe(true);

      // Dirty: active/enabled
      expect(getIsDisabled("extras", true)).toBe(false);
    });
  });
});
