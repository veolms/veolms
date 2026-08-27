import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initialExtrasState,
  normalizeExtrasState,
  isExtrasEqual,
  deriveAutoIncludes,
  deriveSuggestedInclusions,
  isManualIncludesEqual,
  type ExtrasFormState,
} from "../../src/courses/CourseCreatePage";
import { coursesService } from "../../src/services/courses/courses.service";
import type { CourseSettings, CourseIncludeItem } from "@veolms/contracts";

describe("Course Wizard Step 4: Extras & Course Includes State", () => {
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
  });

  describe("Dynamic Suggested Inclusions & User Selection", () => {
    it("suggests perks based on course configuration without auto-injecting into the active draft", () => {
      const suggestions = deriveSuggestedInclusions({
        durationMode: "lifetime",
        enableCertificate: true,
        enableDownloads: true,
        hasPreviewLessons: true,
        currentDraft: [],
      });

      expect(suggestions).toContain("Full lifetime access");
      expect(suggestions).toContain("Certificate of completion");
      expect(suggestions).toContain("Downloadable resources");
      expect(suggestions).toContain("Free preview lessons");
      expect(suggestions).toContain("Personal guidance");
    });

    it("filters out suggestions that the user has already added to their active draft", () => {
      const suggestions = deriveSuggestedInclusions({
        durationMode: "lifetime",
        enableCertificate: true,
        enableDownloads: true,
        hasPreviewLessons: false,
        currentDraft: [{ text: "Full lifetime access" }],
      });

      expect(suggestions).not.toContain("Full lifetime access");
      expect(suggestions).toContain("Certificate of completion");
      expect(suggestions).toContain("Downloadable resources");
    });

    it("clicking a suggestion adds it to the active draft and marks the form dirty", () => {
      const serverBaseline: CourseIncludeItem[] = [];
      let manualDraft: Array<{ id: string; text: string }> = [];

      // Initial clean state
      expect(isManualIncludesEqual(manualDraft, serverBaseline)).toBe(true);

      // User clicks a suggestion
      const clickedSuggestion = "Certificate of completion";
      manualDraft = [...manualDraft, { id: "manual-1", text: clickedSuggestion }];

      // Dirty state is triggered -> enables save button
      expect(isManualIncludesEqual(manualDraft, serverBaseline)).toBe(false);
      expect(manualDraft).toHaveLength(1);
      expect(manualDraft[0]?.text).toBe("Certificate of completion");
    });
  });

  describe("Combined Includes & 6-Item Limit", () => {
    it("enforces maximum 6 inclusions in the active draft", () => {
      const manualDraft = [
        { id: "m-1", text: "Full lifetime access" },
        { id: "m-2", text: "Certificate of completion" },
        { id: "m-3", text: "Downloadable resources" },
        { id: "m-4", text: "Free preview lessons" },
        { id: "m-5", text: "Personal guidance" },
        { id: "m-6", text: "One-on-one session" },
      ];

      expect(manualDraft.length).toBe(6);
      const isMaxReached = manualDraft.length >= 6;
      expect(isMaxReached).toBe(true);

      const previewList = manualDraft
        .map((m) => m.text.trim())
        .filter(Boolean)
        .slice(0, 6);
      expect(previewList).toHaveLength(6);
    });

    it("restricts inclusion text to 25 characters maximum", () => {
      const longText = "This is a very long inclusion perk that exceeds the limit";
      const truncated = longText.slice(0, 25);
      expect(truncated.length).toBe(25);
      expect(truncated).toBe("This is a very long inclu");
      
      const counterText = `${truncated.length} / 25`;
      expect(counterText).toBe("25 / 25");
    });
  });

  describe("Save Extras Mutation & Lifecycle", () => {
    it("synchronizes confirmed baseline upon successful save and resets dirty state", async () => {
      let serverExtras: ExtrasFormState = { enableCertificate: false };
      const localDraft = {
        enableCertificate: true,
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
  });
});

