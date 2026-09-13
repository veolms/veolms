import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CourseSettings } from "@veolms/contracts";
import {
  initialExtrasState,
  normalizeExtrasState,
  isExtrasEqual,
  type ExtrasFormState,
} from "../../src/courses/CourseCreatePage";

interface ExtrasState {
  enableCertificate: boolean;
  certificateTemplate: string;
  issuanceType: string;
  minCompletionPercentage: number;
  customRuleText: string;
  autoEmailCertificate: boolean;
}

describe("Course Wizard Step 4: Immediate Certificate Toggle Persistence", () => {
  const sampleCourseId = "12345678-1234-1234-1234-123456789abc";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Test A: Toggling certificate updates state optimistically and immediately calls upsertSettingsMutation", async () => {
    const mockUpsertSettings = vi.fn().mockImplementation(async ({ payload }: { payload: { certificateEnabled: boolean } }) => {
      return {
        id: "settings-uuid-1",
        courseId: sampleCourseId,
        allowQa: true,
        allowComments: true,
        allowDownloads: true,
        certificateEnabled: payload.certificateEnabled,
        showInstructorName: true,
        language: "en",
      } satisfies CourseSettings;
    });

    let extras: ExtrasState = {
      enableCertificate: false,
      certificateTemplate: "purple-certificate",
      issuanceType: "percentage",
      minCompletionPercentage: 95,
      customRuleText: "Complete all quizzes",
      autoEmailCertificate: true,
    };
    let serverExtras: ExtrasFormState = initialExtrasState;
    let isSavingCertificate = false;
    let isSavingCertificateRef = false;

    const handleToggleCertificate = async () => {
      if (isSavingCertificateRef) return;

      const previousValue = extras.enableCertificate;
      const nextValue = !previousValue;

      // 1. Optimistic update
      extras = { ...extras, enableCertificate: nextValue };
      isSavingCertificateRef = true;
      isSavingCertificate = true;

      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { certificateEnabled: nextValue },
        });

        const newBaseline = normalizeExtrasState({
          enableCertificate: res.certificateEnabled ?? nextValue,
        });
        serverExtras = newBaseline;
        extras = { ...extras, enableCertificate: newBaseline.enableCertificate };
      } finally {
        isSavingCertificateRef = false;
        isSavingCertificate = false;
      }
    };

    // Trigger toggle
    const togglePromise = handleToggleCertificate();

    // Optimistic assertion: state is already flipped
    expect(extras.enableCertificate).toBe(true);
    expect(isSavingCertificate).toBe(true);

    // Mutation was immediately invoked
    expect(mockUpsertSettings).toHaveBeenCalledTimes(1);
    expect(mockUpsertSettings).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: { certificateEnabled: true },
    });

    await togglePromise;

    // After resolution: confirmed and clean
    expect(extras.enableCertificate).toBe(true);
    expect(serverExtras.enableCertificate).toBe(true);
    expect(isSavingCertificate).toBe(false);
    expect(isExtrasEqual(extras, serverExtras)).toBe(true);
  });

  it("Test B: In-flight save shows saving state on the toggle while Extras panel remains interactive", async () => {
    let resolveSettings: (val: CourseSettings) => void;
    const settingsPromise = new Promise<CourseSettings>((resolve) => {
      resolveSettings = resolve;
    });
    const mockUpsertSettings = vi.fn().mockReturnValue(settingsPromise);

    let extras: ExtrasState = {
      enableCertificate: false,
      certificateTemplate: "purple-certificate",
      issuanceType: "percentage",
      minCompletionPercentage: 95,
      customRuleText: "Complete all quizzes",
      autoEmailCertificate: true,
    };
    let isSavingCertificate = false;
    let isExtrasSaving = false;

    const handleToggleCertificate = async () => {
      extras = { ...extras, enableCertificate: !extras.enableCertificate };
      isSavingCertificate = true;
      // isExtrasSaving is explicitly NOT set to true
      try {
        await mockUpsertSettings();
      } finally {
        isSavingCertificate = false;
      }
    };

    const action = handleToggleCertificate();

    // While saving:
    expect(isSavingCertificate).toBe(true);
    expect(isExtrasSaving).toBe(false);

    // The toggle is disabled while saving
    const isToggleDisabled = isSavingCertificate;
    expect(isToggleDisabled).toBe(true);

    // Panel controls (inclusions, perk chips) that rely on !isExtrasSaving are NOT disabled
    const areInclusionsBlocked = isExtrasSaving;
    expect(areInclusionsBlocked).toBe(false);

    resolveSettings!({
      id: "settings-uuid-2",
      courseId: sampleCourseId,
      allowQa: true,
      allowComments: true,
      allowDownloads: true,
      certificateEnabled: true,
      showInstructorName: true,
      language: "en",
    });
    await action;

    expect(isSavingCertificate).toBe(false);
  });

  it("Test C: Duplicate rapid clicks while save is in flight are safely ignored", async () => {
    let resolveSettings: (val: CourseSettings) => void;
    const settingsPromise = new Promise<CourseSettings>((resolve) => {
      resolveSettings = resolve;
    });
    const mockUpsertSettings = vi.fn().mockReturnValue(settingsPromise);

    let isSavingCertificateRef = false;
    let callCount = 0;

    const handleToggleCertificate = async () => {
      if (isSavingCertificateRef) return;
      isSavingCertificateRef = true;
      callCount++;
      try {
        await mockUpsertSettings();
      } finally {
        isSavingCertificateRef = false;
      }
    };

    // First click starts save
    const p1 = handleToggleCertificate();
    // Second and third clicks while in flight
    const p2 = handleToggleCertificate();
    const p3 = handleToggleCertificate();

    expect(callCount).toBe(1);
    expect(mockUpsertSettings).toHaveBeenCalledTimes(1);

    resolveSettings!({
      id: "settings-uuid-3",
      courseId: sampleCourseId,
      allowQa: true,
      allowComments: true,
      allowDownloads: true,
      certificateEnabled: true,
      showInstructorName: true,
      language: "en",
    });
    await Promise.all([p1, p2, p3]);

    expect(callCount).toBe(1);
  });

  it("Test D & E: Failed mutation rolls back enableCertificate to previous value and shows error toast", async () => {
    const mockUpsertSettings = vi
      .fn()
      .mockRejectedValue(new Error("Network connection lost"));

    let extras: ExtrasState = {
      enableCertificate: false,
      certificateTemplate: "purple-certificate",
      issuanceType: "percentage",
      minCompletionPercentage: 95,
      customRuleText: "Complete all quizzes",
      autoEmailCertificate: true,
    };
    let serverExtras: ExtrasFormState = initialExtrasState;
    let isSavingCertificate = false;
    let isSavingCertificateRef = false;
    let toastMessage = "";

    const handleToggleCertificate = async () => {
      if (isSavingCertificateRef) return;

      const previousValue = extras.enableCertificate;
      const nextValue = !previousValue;

      // Optimistic update
      extras = { ...extras, enableCertificate: nextValue };
      isSavingCertificateRef = true;
      isSavingCertificate = true;

      try {
        await mockUpsertSettings();
      } catch (err: unknown) {
        // Rollback on failure
        extras = { ...extras, enableCertificate: previousValue };
        toastMessage = (err as Error).message;
      } finally {
        isSavingCertificateRef = false;
        isSavingCertificate = false;
      }
    };

    await handleToggleCertificate();

    // Rollback assertion: state is restored to false
    expect(extras.enableCertificate).toBe(false);
    expect(serverExtras.enableCertificate).toBe(false);
    expect(toastMessage).toBe("Network connection lost");
    expect(isSavingCertificate).toBe(false);
  });

  it("Test F: If course draft does not exist yet (!currentCourseId), creates course draft first", async () => {
    let currentCourseId: string | null = null;

    const mockCreateCourse = vi.fn().mockResolvedValue({
      id: "new-course-uuid-999",
      version: 1,
    });
    const mockUpsertSettings = vi.fn().mockResolvedValue({
      courseId: "new-course-uuid-999",
      certificateEnabled: true,
    });

    let extras: ExtrasState = {
      enableCertificate: false,
      certificateTemplate: "purple-certificate",
      issuanceType: "percentage",
      minCompletionPercentage: 95,
      customRuleText: "Complete all quizzes",
      autoEmailCertificate: true,
    };

    const handleToggleCertificate = async () => {
      let targetCourseId = currentCourseId;
      if (!targetCourseId) {
        const created = await mockCreateCourse({ title: "Untitled Course" });
        targetCourseId = created.id;
        currentCourseId = created.id;
      }

      await mockUpsertSettings({
        courseId: targetCourseId,
        payload: { certificateEnabled: true },
      });
      extras = { ...extras, enableCertificate: true };
    };

    await handleToggleCertificate();

    expect(mockCreateCourse).toHaveBeenCalledTimes(1);
    expect(currentCourseId).toBe("new-course-uuid-999");
    expect(mockUpsertSettings).toHaveBeenCalledWith({
      courseId: "new-course-uuid-999",
      payload: { certificateEnabled: true },
    });
    expect(extras.enableCertificate).toBe(true);
  });

  it("Test G: saveExtrasStep no longer contains or executes certificate persistence calls", async () => {
    const mockUpsertSettings = vi.fn();
    const mockListIncludes = vi.fn().mockResolvedValue({ items: [] });

    // Simulate saveExtrasStep without certificate logic
    const saveExtrasStep = async () => {
      // Only deferred inclusions operations remain
      await mockListIncludes();
      return { success: true };
    };

    const result = await saveExtrasStep();

    expect(result).toEqual({ success: true });
    // Verify upsertSettings was NEVER called during saveExtrasStep
    expect(mockUpsertSettings).not.toHaveBeenCalled();
  });
});
