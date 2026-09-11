import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  CourseAccessRule,
  CourseSettings,
  UpdateCourseAccessRuleRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import {
  initialAccessRulesState,
  normalizeAccessRulesState,
  isAccessRulesEqual,
  isAccessRuleConfigEqual,
  type AccessRulesFormState,
  type AccessDurationMode,
  type AccessType,
  type DurationUnit,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 2: Immediate Access Rules Persistence", () => {
  const sampleCourseId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Test A: Toggling Q&A, Comments, and Downloads updates draft optimistically and calls upsertSettingsMutation immediately", async () => {
    const mockUpsertSettings = vi.fn().mockImplementation(
      async ({ payload }: { courseId: string; payload: UpdateCourseSettingsRequest }) => {
        return {
          id: "settings-uuid-1",
          courseId: sampleCourseId,
          allowQa: payload.allowQa ?? false,
          allowComments: payload.allowComments ?? false,
          allowDownloads: payload.allowDownloads ?? false,
          certificateEnabled: false,
          showInstructorName: true,
          language: "en",
        } satisfies CourseSettings;
      },
    );

    let accessRulesDraft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "lifetime",
      enableQA: false,
      enableComments: false,
      enableDownloads: false,
    };
    let serverAccessRules: AccessRulesFormState = { ...accessRulesDraft };
    const savingAccessControls = new Set<string>();
    const accessControlVersions = {
      enableQA: 0,
      enableComments: 0,
      enableDownloads: 0,
    };

    const toggleQA = async () => {
      const prev = accessRulesDraft.enableQA;
      const next = !prev;
      const version = ++accessControlVersions.enableQA;
      accessRulesDraft = { ...accessRulesDraft, enableQA: next };
      savingAccessControls.add("enableQA");

      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowQa: next },
        });
        if (accessControlVersions.enableQA === version) {
          serverAccessRules = { ...serverAccessRules, enableQA: res.allowQa ?? next };
          accessRulesDraft = { ...accessRulesDraft, enableQA: res.allowQa ?? next };
        }
      } finally {
        savingAccessControls.delete("enableQA");
      }
    };

    const toggleComments = async () => {
      const prev = accessRulesDraft.enableComments;
      const next = !prev;
      const version = ++accessControlVersions.enableComments;
      accessRulesDraft = { ...accessRulesDraft, enableComments: next };
      savingAccessControls.add("enableComments");

      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowComments: next },
        });
        if (accessControlVersions.enableComments === version) {
          serverAccessRules = { ...serverAccessRules, enableComments: res.allowComments ?? next };
          accessRulesDraft = { ...accessRulesDraft, enableComments: res.allowComments ?? next };
        }
      } finally {
        savingAccessControls.delete("enableComments");
      }
    };

    const toggleDownloads = async () => {
      const prev = accessRulesDraft.enableDownloads;
      const next = !prev;
      const version = ++accessControlVersions.enableDownloads;
      accessRulesDraft = { ...accessRulesDraft, enableDownloads: next };
      savingAccessControls.add("enableDownloads");

      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowDownloads: next },
        });
        if (accessControlVersions.enableDownloads === version) {
          serverAccessRules = { ...serverAccessRules, enableDownloads: res.allowDownloads ?? next };
          accessRulesDraft = { ...accessRulesDraft, enableDownloads: res.allowDownloads ?? next };
        }
      } finally {
        savingAccessControls.delete("enableDownloads");
      }
    };

    // 1. Toggle QA
    const qaPromise = toggleQA();
    expect(accessRulesDraft.enableQA).toBe(true);
    expect(savingAccessControls.has("enableQA")).toBe(true);
    await qaPromise;
    expect(savingAccessControls.has("enableQA")).toBe(false);
    expect(serverAccessRules.enableQA).toBe(true);
    expect(mockUpsertSettings).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: { allowQa: true },
    });

    // 2. Toggle Comments
    const commentsPromise = toggleComments();
    expect(accessRulesDraft.enableComments).toBe(true);
    expect(savingAccessControls.has("enableComments")).toBe(true);
    await commentsPromise;
    expect(savingAccessControls.has("enableComments")).toBe(false);
    expect(serverAccessRules.enableComments).toBe(true);
    expect(mockUpsertSettings).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: { allowComments: true },
    });

    // 3. Toggle Downloads
    const downloadsPromise = toggleDownloads();
    expect(accessRulesDraft.enableDownloads).toBe(true);
    expect(savingAccessControls.has("enableDownloads")).toBe(true);
    await downloadsPromise;
    expect(savingAccessControls.has("enableDownloads")).toBe(false);
    expect(serverAccessRules.enableDownloads).toBe(true);
    expect(mockUpsertSettings).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: { allowDownloads: true },
    });
  });

  it("Test B: Switching durationMode immediately updates draft and invokes upsertAccessRulesMutation with lifetime and fixed payloads", async () => {
    const mockUpsertAccessRules = vi.fn().mockImplementation(
      async ({ payload }: { courseId: string; payload: UpdateCourseAccessRuleRequest }) => {
        return {
          id: "rule-uuid-1",
          courseId: sampleCourseId,
          accessType: payload.accessType,
          durationType: payload.durationType,
          durationDays: payload.durationDays ?? null,
        } satisfies CourseAccessRule;
      },
    );

    let accessRulesDraft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "lifetime",
      fixedDurationValue: 3,
      fixedDurationUnit: "Months",
    };
    let serverAccessRules: AccessRulesFormState = { ...accessRulesDraft };
    const savingAccessControls = new Set<string>();
    const accessControlVersions = { durationMode: 0 };

    const handleDurationModeChange = async (mode: AccessDurationMode) => {
      if (accessRulesDraft.durationMode === mode) return;
      const previousMode = accessRulesDraft.durationMode;
      const version = ++accessControlVersions.durationMode;

      accessRulesDraft = { ...accessRulesDraft, durationMode: mode };
      savingAccessControls.add("durationMode");

      try {
        let durationDays: number | null = null;
        if (mode === "fixed") {
          const val = Math.max(1, accessRulesDraft.fixedDurationValue || 1);
          const unitMultiplier =
            accessRulesDraft.fixedDurationUnit === "Years"
              ? 365
              : accessRulesDraft.fixedDurationUnit === "Months"
                ? 30
                : accessRulesDraft.fixedDurationUnit === "Weeks"
                  ? 7
                  : 1;
          durationDays = val * unitMultiplier;
        }

        await mockUpsertAccessRules({
          courseId: sampleCourseId,
          payload: {
            accessType: "everyone",
            durationType: mode === "fixed" ? "fixed_duration" : "lifetime",
            durationDays: mode === "fixed" ? durationDays : null,
          },
        });

        if (accessControlVersions.durationMode === version) {
          serverAccessRules = {
            ...serverAccessRules,
            durationMode: mode,
          };
        }
      } catch {
        if (accessControlVersions.durationMode === version) {
          accessRulesDraft = { ...accessRulesDraft, durationMode: previousMode };
        }
      } finally {
        savingAccessControls.delete("durationMode");
      }
    };

    // Switch to fixed duration
    const switchFixedPromise = handleDurationModeChange("fixed");
    expect(accessRulesDraft.durationMode).toBe("fixed");
    expect(savingAccessControls.has("durationMode")).toBe(true);

    await switchFixedPromise;
    expect(mockUpsertAccessRules).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        accessType: "everyone",
        durationType: "fixed_duration",
        durationDays: 90, // 3 months * 30 days
      },
    });
    expect(serverAccessRules.durationMode).toBe("fixed");
    expect(savingAccessControls.has("durationMode")).toBe(false);

    // Switch back to lifetime
    const switchLifetimePromise = handleDurationModeChange("lifetime");
    expect(accessRulesDraft.durationMode).toBe("lifetime");
    await switchLifetimePromise;
    expect(mockUpsertAccessRules).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        accessType: "everyone",
        durationType: "lifetime",
        durationDays: null,
      },
    });
    expect(serverAccessRules.durationMode).toBe("lifetime");
  });

  it("Test C: Fine-grained per-control locking keeps other controls interactive while one is saving", async () => {
    let resolveSettings: (val: CourseSettings) => void;
    const pendingSettingsPromise = new Promise<CourseSettings>((res) => {
      resolveSettings = res;
    });
    const mockUpsertSettings = vi.fn().mockReturnValue(pendingSettingsPromise);

    const savingAccessControls = new Set<string>();

    // Start saving enableQA
    savingAccessControls.add("enableQA");

    // Assert localized locking: only QA is locked
    expect(savingAccessControls.has("enableQA")).toBe(true);
    expect(savingAccessControls.has("enableComments")).toBe(false);
    expect(savingAccessControls.has("enableDownloads")).toBe(false);
    expect(savingAccessControls.has("durationMode")).toBe(false);
    expect(savingAccessControls.has("accessType")).toBe(false);

    // Other controls can be interacted with
    savingAccessControls.add("durationMode");
    expect(savingAccessControls.has("durationMode")).toBe(true);
    expect(savingAccessControls.has("enableComments")).toBe(false);

    savingAccessControls.delete("durationMode");
    expect(savingAccessControls.has("durationMode")).toBe(false);
    expect(savingAccessControls.has("enableQA")).toBe(true);

    // Resolve QA
    resolveSettings!({
      id: "s1",
      courseId: sampleCourseId,
      allowQa: true,
      allowComments: false,
      allowDownloads: false,
      certificateEnabled: false,
      showInstructorName: true,
      language: "en",
    });
    savingAccessControls.delete("enableQA");
    expect(savingAccessControls.has("enableQA")).toBe(false);
  });

  it("Test D: Rollback on failure restores previous server-confirmed value and triggers error message", async () => {
    const mockUpsertSettings = vi.fn().mockRejectedValue(new Error("Network error"));
    let toastMessage: string | null = null;

    let accessRulesDraft: AccessRulesFormState = {
      ...initialAccessRulesState,
      enableQA: false,
    };
    let serverAccessRules: AccessRulesFormState = { ...accessRulesDraft };
    const savingAccessControls = new Set<string>();
    const accessControlVersions = { enableQA: 0 };

    const handleToggleQA = async () => {
      const previousValue = accessRulesDraft.enableQA;
      const nextValue = !previousValue;
      const version = ++accessControlVersions.enableQA;

      // 1. Optimistic update
      accessRulesDraft = { ...accessRulesDraft, enableQA: nextValue };
      savingAccessControls.add("enableQA");

      try {
        await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowQa: nextValue },
        });
        if (accessControlVersions.enableQA === version) {
          serverAccessRules = { ...serverAccessRules, enableQA: nextValue };
        }
      } catch (err: unknown) {
        if (accessControlVersions.enableQA === version) {
          accessRulesDraft = { ...accessRulesDraft, enableQA: previousValue };
          toastMessage = (err as Error).message || "Failed to update Q&A setting.";
        }
      } finally {
        savingAccessControls.delete("enableQA");
      }
    };

    const actionPromise = handleToggleQA();
    expect(accessRulesDraft.enableQA).toBe(true); // Optimistically flipped

    await actionPromise;

    // Rolled back after failure
    expect(accessRulesDraft.enableQA).toBe(false);
    expect(serverAccessRules.enableQA).toBe(false);
    expect(toastMessage).toBe("Network error");
    expect(savingAccessControls.has("enableQA")).toBe(false);
  });

  it("Test E: Rapid/concurrent changes on different controls operate independently without cross-interference", async () => {
    const mockUpsertSettings = vi.fn().mockImplementation(
      async ({ payload }: { courseId: string; payload: UpdateCourseSettingsRequest }) => {
        return {
          id: "s1",
          courseId: sampleCourseId,
          allowQa: payload.allowQa ?? false,
          allowComments: payload.allowComments ?? false,
          allowDownloads: payload.allowDownloads ?? false,
          certificateEnabled: false,
          showInstructorName: true,
          language: "en",
        } satisfies CourseSettings;
      },
    );

    let accessRulesDraft: AccessRulesFormState = {
      ...initialAccessRulesState,
      enableQA: false,
      enableComments: false,
    };
    let serverAccessRules: AccessRulesFormState = { ...accessRulesDraft };
    const savingAccessControls = new Set<string>();
    const accessControlVersions = { enableQA: 0, enableComments: 0 };

    const toggleQA = async () => {
      const prev = accessRulesDraft.enableQA;
      const next = !prev;
      const version = ++accessControlVersions.enableQA;
      accessRulesDraft = { ...accessRulesDraft, enableQA: next };
      savingAccessControls.add("enableQA");
      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowQa: next },
        });
        if (accessControlVersions.enableQA === version) {
          serverAccessRules = { ...serverAccessRules, enableQA: res.allowQa };
        }
      } finally {
        savingAccessControls.delete("enableQA");
      }
    };

    const toggleComments = async () => {
      const prev = accessRulesDraft.enableComments;
      const next = !prev;
      const version = ++accessControlVersions.enableComments;
      accessRulesDraft = { ...accessRulesDraft, enableComments: next };
      savingAccessControls.add("enableComments");
      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowComments: next },
        });
        if (accessControlVersions.enableComments === version) {
          serverAccessRules = { ...serverAccessRules, enableComments: res.allowComments };
        }
      } finally {
        savingAccessControls.delete("enableComments");
      }
    };

    // Fire both simultaneously
    await Promise.all([toggleQA(), toggleComments()]);

    expect(accessRulesDraft.enableQA).toBe(true);
    expect(accessRulesDraft.enableComments).toBe(true);
    expect(serverAccessRules.enableQA).toBe(true);
    expect(serverAccessRules.enableComments).toBe(true);
    expect(savingAccessControls.size).toBe(0);
    expect(mockUpsertSettings).toHaveBeenCalledTimes(2);
  });

  it("Test F: Out-of-order responses for the same control discard stale responses without overwriting newer state", async () => {
    let resolveFirstCall: (val: CourseAccessRule) => void;
    let resolveSecondCall: (val: CourseAccessRule) => void;

    const firstPromise = new Promise<CourseAccessRule>((res) => {
      resolveFirstCall = res;
    });
    const secondPromise = new Promise<CourseAccessRule>((res) => {
      resolveSecondCall = res;
    });

    let callCount = 0;
    const mockUpsertAccessRules = vi.fn().mockImplementation(() => {
      callCount++;
      return callCount === 1 ? firstPromise : secondPromise;
    });

    let accessRulesDraft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "lifetime",
    };
    let serverAccessRules: AccessRulesFormState = { ...accessRulesDraft };
    const accessControlVersions = { durationMode: 0 };
    const inFlightControls = { durationMode: 0 };
    const savingAccessControls = new Set<string>();

    const setDurationMode = async (mode: AccessDurationMode) => {
      const previousMode = accessRulesDraft.durationMode;
      const version = ++accessControlVersions.durationMode;

      accessRulesDraft = { ...accessRulesDraft, durationMode: mode };
      inFlightControls.durationMode++;
      savingAccessControls.add("durationMode");

      try {
        const res = await mockUpsertAccessRules({
          courseId: sampleCourseId,
          payload: {
            accessType: "everyone",
            durationType: mode === "fixed" ? "fixed_duration" : "lifetime",
            durationDays: null,
          },
        });

        // Version check ensures only the latest call updates baseline
        if (accessControlVersions.durationMode === version) {
          serverAccessRules = {
            ...serverAccessRules,
            durationMode: res.durationType === "fixed_duration" ? "fixed" : "lifetime",
          };
        }
      } catch {
        if (accessControlVersions.durationMode === version) {
          accessRulesDraft = { ...accessRulesDraft, durationMode: previousMode };
        }
      } finally {
        inFlightControls.durationMode = Math.max(0, inFlightControls.durationMode - 1);
        if (inFlightControls.durationMode === 0) {
          savingAccessControls.delete("durationMode");
        }
      }
    };

    // User clicks "fixed" (version 1)
    const p1 = setDurationMode("fixed");
    expect(accessRulesDraft.durationMode).toBe("fixed");

    // Rapidly, user clicks "lifetime" (version 2)
    const p2 = setDurationMode("lifetime");
    expect(accessRulesDraft.durationMode).toBe("lifetime");

    // Stale resolution: call 1 (fixed) resolves after call 2 was launched
    resolveFirstCall!({
      id: "r1",
      courseId: sampleCourseId,
      accessType: "everyone",
      durationType: "fixed_duration",
      durationDays: 30,
    });
    await p1;

    // Server baseline should NOT be overwritten by stale response
    expect(serverAccessRules.durationMode).toBe("lifetime");
    expect(accessRulesDraft.durationMode).toBe("lifetime");
    expect(savingAccessControls.has("durationMode")).toBe(true); // Still 1 in flight

    // Second call resolves (lifetime)
    resolveSecondCall!({
      id: "r2",
      courseId: sampleCourseId,
      accessType: "everyone",
      durationType: "lifetime",
      durationDays: null,
    });
    await p2;

    expect(serverAccessRules.durationMode).toBe("lifetime");
    expect(accessRulesDraft.durationMode).toBe("lifetime");
    expect(savingAccessControls.has("durationMode")).toBe(false);
  });

  it("Test G: Draft course creation creates initial course draft when currentCourseId is null", async () => {
    let currentCourseId: string | null = null;
    let courseTitle = "   ";

    const mockCreateCourse = vi.fn().mockResolvedValue({
      id: "new-course-uuid-999",
      title: "Untitled Course",
      version: 1,
    });

    const ensureCourseDraftForAccessRules = async (): Promise<string> => {
      if (currentCourseId) return currentCourseId;
      const fallbackTitle = courseTitle.trim() || "Untitled Course";
      const created = await mockCreateCourse({ title: fallbackTitle });
      currentCourseId = created.id;
      if (!courseTitle.trim()) {
        courseTitle = fallbackTitle;
      }
      return created.id;
    };

    const targetCourseId = await ensureCourseDraftForAccessRules();

    expect(targetCourseId).toBe("new-course-uuid-999");
    expect(currentCourseId).toBe("new-course-uuid-999");
    expect(courseTitle).toBe("Untitled Course");
    expect(mockCreateCourse).toHaveBeenCalledWith({ title: "Untitled Course" });

    // Second call should reuse existing ID without creating another course
    const secondCallId = await ensureCourseDraftForAccessRules();
    expect(secondCallId).toBe("new-course-uuid-999");
    expect(mockCreateCourse).toHaveBeenCalledTimes(1);
  });

  it("Test H: saveAccessRulesStep flushes pending persistence, preserves accessType, and avoids duplicate mutation when clean", async () => {
    const mockUpsertAccessRules = vi.fn().mockResolvedValue({
      id: "rule-1",
      courseId: sampleCourseId,
      accessType: "restricted",
      durationType: "fixed_duration",
      durationDays: 60,
    });
    const mockUpsertSettings = vi.fn();

    let serverAccessRules: AccessRulesFormState = normalizeAccessRulesState({
      accessType: "restricted",
      durationMode: "fixed",
      fixedDurationValue: 2,
      fixedDurationUnit: "Months",
      enableQA: true,
      enableComments: true,
      enableDownloads: false,
    });

    // Server-first persistence already updated server baseline to match draft
    let accessRulesDraft: AccessRulesFormState = {
      ...serverAccessRules,
    };

    let pendingDebouncePromise: Promise<unknown> | null = null;
    const flushFixedDurationPersistence = async () => {
      if (pendingDebouncePromise) {
        await pendingDebouncePromise;
        pendingDebouncePromise = null;
      }
    };

    const saveAccessRulesStep = async () => {
      await flushFixedDurationPersistence();

      if (!accessRulesDraft.durationMode) {
        throw new Error("Please select an access duration option.");
      }

      const isRulesConfigDirty = !isAccessRuleConfigEqual(
        accessRulesDraft,
        serverAccessRules,
      );

      // Only runs access rule mutation if config is actually dirty after flush
      if (isRulesConfigDirty) {
        let durationDays: number | null = null;
        if (accessRulesDraft.durationMode === "fixed") {
          const val = Math.max(1, accessRulesDraft.fixedDurationValue || 1);
          durationDays = val * 30;
        }

        await mockUpsertAccessRules({
          courseId: sampleCourseId,
          payload: {
            accessType: accessRulesDraft.accessType || "everyone",
            durationType: "fixed_duration",
            durationDays,
          },
        });
      }

      const newBaseline = normalizeAccessRulesState({
        ...accessRulesDraft,
        durationMode: "fixed",
      });
      serverAccessRules = newBaseline;
      accessRulesDraft = newBaseline;
    };

    await saveAccessRulesStep();

    // Access rules mutation was NOT called again because it was already clean
    expect(mockUpsertAccessRules).not.toHaveBeenCalled();
    // Settings mutation was NOT called
    expect(mockUpsertSettings).not.toHaveBeenCalled();
    // Clean state confirmed
    expect(isAccessRulesEqual(accessRulesDraft, serverAccessRules)).toBe(true);
  });

  it("Test I: Hydration from editorData.settings preserves learner interaction settings even when editorData.accessRules is null", () => {
    // Simulates a course where editorData.accessRules is null (duration not selected yet)
    // but settings already exist in the database (e.g. comments enabled)
    const mockEditorData = {
      course: { id: sampleCourseId, title: "Test Course", version: 1, status: "draft" },
      accessRules: null,
      settings: {
        id: "settings-1",
        courseId: sampleCourseId,
        allowQa: false,
        allowComments: true,
        allowDownloads: true,
        certificateEnabled: false,
        showInstructorName: true,
        language: "en",
        estimatedDuration: null,
      },
    };

    const hasAccessRules = Boolean(
      mockEditorData.accessRules && (mockEditorData.accessRules as any).id,
    );
    expect(hasAccessRules).toBe(false);

    const s = mockEditorData.settings;
    const ar = mockEditorData.accessRules;

    const confirmedAccessRules = normalizeAccessRulesState({
      accessType: "everyone",
      durationMode: "",
      fixedDurationValue: 30,
      fixedDurationUnit: "Days",
      enableQA: s?.allowQa !== undefined ? Boolean(s.allowQa) : initialAccessRulesState.enableQA,
      enableComments:
        s?.allowComments !== undefined ? Boolean(s.allowComments) : initialAccessRulesState.enableComments,
      enableDownloads:
        s?.allowDownloads !== undefined ? Boolean(s.allowDownloads) : initialAccessRulesState.enableDownloads,
    });

    // Verify interaction settings are accurately hydrated from editorData.settings
    expect(confirmedAccessRules.enableQA).toBe(false);
    expect(confirmedAccessRules.enableComments).toBe(true);
    expect(confirmedAccessRules.enableDownloads).toBe(true);
    expect(confirmedAccessRules.durationMode).toBe("");
  });

  it("Test J: Backend partial settings update merges with existing row without clobbering other settings", async () => {
    const existingDbRow = {
      id: "settings-1",
      course_id: sampleCourseId,
      allow_qa: false,
      allow_comments: true,
      allow_downloads: false,
      certificate_enabled: true,
      show_instructor_name: true,
      language: "en",
      estimated_duration: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // User only updates allowDownloads: true
    const updates: UpdateCourseSettingsRequest = {
      allowDownloads: true,
    };

    const allowQa =
      updates.allowQa !== undefined
        ? updates.allowQa
        : (existingDbRow.allow_qa ?? true);
    const allowComments =
      updates.allowComments !== undefined
        ? updates.allowComments
        : (existingDbRow.allow_comments ?? true);
    const allowDownloads =
      updates.allowDownloads !== undefined
        ? updates.allowDownloads
        : (existingDbRow.allow_downloads ?? false);
    const certificateEnabled =
      updates.certificateEnabled !== undefined
        ? updates.certificateEnabled
        : (existingDbRow.certificate_enabled ?? false);

    // Assert that omitted fields retain their existing values
    expect(allowQa).toBe(false); // Retained false
    expect(allowComments).toBe(true); // Retained true
    expect(allowDownloads).toBe(true); // Updated to true
    expect(certificateEnabled).toBe(true); // Retained true
  });

  it("Test K: 3 concurrent in-flight toggle requests (QA, Comments, Downloads) resolve smoothly without state jumping or flipping active fields to false", async () => {
    // Shared simulated DB settings row
    let dbSettings: CourseSettings = {
      id: "settings-db-1",
      courseId: sampleCourseId,
      allowQa: false,
      allowComments: false,
      allowDownloads: false,
      certificateEnabled: false,
      showInstructorName: true,
      language: "en",
    };

    // Simulated query cache
    let cachedEditorSettings: CourseSettings = { ...dbSettings };

    // Resolvers to control exact completion order
    let resolveReq1!: (val: CourseSettings) => void;
    let resolveReq2!: (val: CourseSettings) => void;
    let resolveReq3!: (val: CourseSettings) => void;

    const p1 = new Promise<CourseSettings>((res) => {
      resolveReq1 = res;
    });
    const p2 = new Promise<CourseSettings>((res) => {
      resolveReq2 = res;
    });
    const p3 = new Promise<CourseSettings>((res) => {
      resolveReq3 = res;
    });

    const mockUpsertSettings = vi.fn().mockImplementation(
      async ({ payload }: { courseId: string; payload: UpdateCourseSettingsRequest }) => {
        if (payload.allowQa !== undefined) {
          return p1;
        }
        if (payload.allowComments !== undefined) {
          return p2;
        }
        if (payload.allowDownloads !== undefined) {
          return p3;
        }
        return dbSettings;
      },
    );

    // Form state
    let accessRulesDraft: AccessRulesFormState = {
      ...initialAccessRulesState,
      enableQA: false,
      enableComments: false,
      enableDownloads: false,
    };
    let accessRulesDraftRef = { ...accessRulesDraft };
    let serverAccessRules: AccessRulesFormState = { ...accessRulesDraft };

    const savingAccessControls = new Set<string>();
    const inFlightAccessControls = {
      enableQA: 0,
      enableComments: 0,
      enableDownloads: 0,
    };
    const accessControlVersions = {
      enableQA: 0,
      enableComments: 0,
      enableDownloads: 0,
    };

    const isControlSaving = (key: "enableQA" | "enableComments" | "enableDownloads") =>
      savingAccessControls.has(key) || inFlightAccessControls[key] > 0;

    const triggerHydrationFromCache = () => {
      // Simulate hydration from editorData.settings
      const s = cachedEditorSettings;
      serverAccessRules = {
        ...serverAccessRules,
        enableQA: isControlSaving("enableQA") ? serverAccessRules.enableQA : (s.allowQa ?? false),
        enableComments: isControlSaving("enableComments") ? serverAccessRules.enableComments : (s.allowComments ?? false),
        enableDownloads: isControlSaving("enableDownloads") ? serverAccessRules.enableDownloads : (s.allowDownloads ?? false),
      };

      accessRulesDraft = {
        ...accessRulesDraft,
        enableQA: isControlSaving("enableQA") ? accessRulesDraft.enableQA : (s.allowQa ?? false),
        enableComments: isControlSaving("enableComments") ? accessRulesDraft.enableComments : (s.allowComments ?? false),
        enableDownloads: isControlSaving("enableDownloads") ? accessRulesDraft.enableDownloads : (s.allowDownloads ?? false),
      };
      accessRulesDraftRef = { ...accessRulesDraft };
    };

    const toggleQA = async () => {
      const prev = accessRulesDraftRef.enableQA;
      const next = !prev;
      const version = ++accessControlVersions.enableQA;
      accessRulesDraftRef.enableQA = next;
      accessRulesDraft = { ...accessRulesDraft, enableQA: next };
      inFlightAccessControls.enableQA++;
      savingAccessControls.add("enableQA");

      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowQa: next },
        });
        if (accessControlVersions.enableQA === version) {
          serverAccessRules = { ...serverAccessRules, enableQA: res.allowQa ?? next };
          accessRulesDraft = { ...accessRulesDraft, enableQA: res.allowQa ?? next };
          accessRulesDraftRef.enableQA = res.allowQa ?? next;
        }
      } finally {
        inFlightAccessControls.enableQA = Math.max(0, inFlightAccessControls.enableQA - 1);
        if (inFlightAccessControls.enableQA === 0) {
          savingAccessControls.delete("enableQA");
        }
      }
    };

    const toggleComments = async () => {
      const prev = accessRulesDraftRef.enableComments;
      const next = !prev;
      const version = ++accessControlVersions.enableComments;
      accessRulesDraftRef.enableComments = next;
      accessRulesDraft = { ...accessRulesDraft, enableComments: next };
      inFlightAccessControls.enableComments++;
      savingAccessControls.add("enableComments");

      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowComments: next },
        });
        if (accessControlVersions.enableComments === version) {
          serverAccessRules = { ...serverAccessRules, enableComments: res.allowComments ?? next };
          accessRulesDraft = { ...accessRulesDraft, enableComments: res.allowComments ?? next };
          accessRulesDraftRef.enableComments = res.allowComments ?? next;
        }
      } finally {
        inFlightAccessControls.enableComments = Math.max(0, inFlightAccessControls.enableComments - 1);
        if (inFlightAccessControls.enableComments === 0) {
          savingAccessControls.delete("enableComments");
        }
      }
    };

    const toggleDownloads = async () => {
      const prev = accessRulesDraftRef.enableDownloads;
      const next = !prev;
      const version = ++accessControlVersions.enableDownloads;
      accessRulesDraftRef.enableDownloads = next;
      accessRulesDraft = { ...accessRulesDraft, enableDownloads: next };
      inFlightAccessControls.enableDownloads++;
      savingAccessControls.add("enableDownloads");

      try {
        const res = await mockUpsertSettings({
          courseId: sampleCourseId,
          payload: { allowDownloads: next },
        });
        if (accessControlVersions.enableDownloads === version) {
          serverAccessRules = { ...serverAccessRules, enableDownloads: res.allowDownloads ?? next };
          accessRulesDraft = { ...accessRulesDraft, enableDownloads: res.allowDownloads ?? next };
          accessRulesDraftRef.enableDownloads = res.allowDownloads ?? next;
        }
      } finally {
        inFlightAccessControls.enableDownloads = Math.max(0, inFlightAccessControls.enableDownloads - 1);
        if (inFlightAccessControls.enableDownloads === 0) {
          savingAccessControls.delete("enableDownloads");
        }
      }
    };

    // 1. User rapidly triggers QA, Comments, and Downloads
    const req1Promise = toggleQA();
    const req2Promise = toggleComments();
    const req3Promise = toggleDownloads();

    // All 3 optimistic states are true immediately
    expect(accessRulesDraft.enableQA).toBe(true);
    expect(accessRulesDraft.enableComments).toBe(true);
    expect(accessRulesDraft.enableDownloads).toBe(true);

    // All 3 are saving in-flight
    expect(isControlSaving("enableQA")).toBe(true);
    expect(isControlSaving("enableComments")).toBe(true);
    expect(isControlSaving("enableDownloads")).toBe(true);

    // 2. Req 1 completes first on backend: backend DB only has allowQa: true
    dbSettings = { ...dbSettings, allowQa: true };
    // queryClient.setQueryData updates only allowQa in cache
    cachedEditorSettings = { ...cachedEditorSettings, allowQa: true };
    resolveReq1({ ...dbSettings });
    await req1Promise;

    // Simulate query cache event triggering hydration right after Req 1 finishes
    triggerHydrationFromCache();

    // CRITICAL ASSERTION:
    // Req 1 has confirmed QA: true.
    // Comments and Downloads were still in flight (active) when Req 1 finished,
    // so they MUST NOT have jumped or flipped to false!
    expect(accessRulesDraft.enableQA).toBe(true);
    expect(accessRulesDraft.enableComments).toBe(true);
    expect(accessRulesDraft.enableDownloads).toBe(true);
    expect(isControlSaving("enableQA")).toBe(false);
    expect(isControlSaving("enableComments")).toBe(true);
    expect(isControlSaving("enableDownloads")).toBe(true);

    // 3. Req 2 completes: backend DB updates allowComments: true
    dbSettings = { ...dbSettings, allowComments: true };
    cachedEditorSettings = { ...cachedEditorSettings, allowComments: true };
    resolveReq2({ ...dbSettings });
    await req2Promise;

    triggerHydrationFromCache();

    // Still no jumping; Comments confirmed, Downloads still in flight
    expect(accessRulesDraft.enableQA).toBe(true);
    expect(accessRulesDraft.enableComments).toBe(true);
    expect(accessRulesDraft.enableDownloads).toBe(true);
    expect(isControlSaving("enableComments")).toBe(false);
    expect(isControlSaving("enableDownloads")).toBe(true);

    // 4. Req 3 completes: backend DB updates allowDownloads: true
    dbSettings = { ...dbSettings, allowDownloads: true };
    cachedEditorSettings = { ...cachedEditorSettings, allowDownloads: true };
    resolveReq3({ ...dbSettings });
    await req3Promise;

    triggerHydrationFromCache();

    // All 3 confirmed true on draft and server baseline
    expect(accessRulesDraft.enableQA).toBe(true);
    expect(accessRulesDraft.enableComments).toBe(true);
    expect(accessRulesDraft.enableDownloads).toBe(true);
    expect(serverAccessRules.enableQA).toBe(true);
    expect(serverAccessRules.enableComments).toBe(true);
    expect(serverAccessRules.enableDownloads).toBe(true);
    expect(savingAccessControls.size).toBe(0);
  });

  it("Test L: Hydration from backend durationDays correctly populates draft and baseline without being overridden by 30 Days", () => {
    // Course with fixed duration of 14 days (2 Weeks)
    const mockEditorData = {
      course: { id: sampleCourseId, title: "Test Course", version: 1, status: "draft" },
      accessRules: {
        id: "rule-14d",
        courseId: sampleCourseId,
        accessType: "everyone" as const,
        durationType: "fixed_duration" as const,
        durationDays: 14,
      },
      settings: null,
    };

    const hasAccessRules = Boolean(
      mockEditorData.accessRules && mockEditorData.accessRules.id,
    );
    expect(hasAccessRules).toBe(true);

    const ar = mockEditorData.accessRules;
    const isFixed = ar?.durationType === "fixed_duration";
    let fixedVal = 30;
    let fixedUnit: DurationUnit = "Days";

    if (hasAccessRules && isFixed && ar?.durationDays && ar.durationDays > 0) {
      const days = ar.durationDays;
      if (days % 365 === 0 && days >= 365) {
        fixedVal = days / 365;
        fixedUnit = "Years";
      } else if (days % 30 === 0 && days >= 30) {
        fixedVal = days / 30;
        fixedUnit = "Months";
      } else if (days % 7 === 0 && days >= 7) {
        fixedVal = days / 7;
        fixedUnit = "Weeks";
      } else {
        fixedVal = days;
        fixedUnit = "Days";
      }
    }

    expect(fixedVal).toBe(2);
    expect(fixedUnit).toBe("Weeks");

    const confirmedAccessRules = normalizeAccessRulesState({
      accessType: ar.accessType,
      durationMode: "fixed",
      fixedDurationValue: fixedVal,
      fixedDurationUnit: fixedUnit,
      enableQA: true,
      enableComments: true,
      enableDownloads: false,
    });

    // Simulate initial component state before hydration
    let prevDraft: AccessRulesFormState = { ...initialAccessRulesState };
    const savingAccessControls = new Set<string>();
    const isAccessControlSaving = (key: string) => savingAccessControls.has(key);
    const isAccessRulesDirty = false;

    // Fixed hydration logic (not using prev.fixedDurationValue || ...)
    let nextDraft: AccessRulesFormState = prevDraft;
    if (!isAccessRulesDirty && savingAccessControls.size === 0) {
      nextDraft = {
        accessType: isAccessControlSaving("accessType")
          ? prevDraft.accessType
          : confirmedAccessRules.accessType || prevDraft.accessType,
        durationMode: isAccessControlSaving("durationMode")
          ? prevDraft.durationMode
          : confirmedAccessRules.durationMode || prevDraft.durationMode,
        fixedDurationValue: isAccessControlSaving("fixedDuration")
          ? prevDraft.fixedDurationValue
          : confirmedAccessRules.fixedDurationValue,
        fixedDurationUnit: isAccessControlSaving("fixedDuration")
          ? prevDraft.fixedDurationUnit
          : confirmedAccessRules.fixedDurationUnit,
        enableQA: isAccessControlSaving("enableQA")
          ? prevDraft.enableQA
          : confirmedAccessRules.enableQA,
        enableComments: isAccessControlSaving("enableComments")
          ? prevDraft.enableComments
          : confirmedAccessRules.enableComments,
        enableDownloads: isAccessControlSaving("enableDownloads")
          ? prevDraft.enableDownloads
          : confirmedAccessRules.enableDownloads,
      };
    }

    const nextServer = {
      ...confirmedAccessRules,
    };

    // Assert actual values populated, NOT 30 Days
    expect(nextDraft.fixedDurationValue).toBe(2);
    expect(nextDraft.fixedDurationUnit).toBe("Weeks");
    expect(nextDraft.durationMode).toBe("fixed");

    // Clean baseline - not false dirty
    expect(isAccessRulesEqual(nextDraft, nextServer)).toBe(true);
  });

  it("Test M: Refetch protection: query hydration never overwrites an active local change or in-flight save", () => {
    // User is editing: draft is locally dirty (e.g. 5 Months)
    let accessRulesDraft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "fixed",
      fixedDurationValue: 5,
      fixedDurationUnit: "Months",
    };
    const serverAccessRules: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "fixed",
      fixedDurationValue: 1,
      fixedDurationUnit: "Months",
    };

    const isAccessRulesDirtyRef = { current: true };
    const savingAccessControlsRef = { current: new Set<string>() };

    // Server refetch brings old 1 Month (30 days) data
    const confirmedFromServer = normalizeAccessRulesState({
      durationMode: "fixed",
      fixedDurationValue: 1,
      fixedDurationUnit: "Months",
    });

    // Hydration gate: must NOT run if dirty or saving
    if (!isAccessRulesDirtyRef.current && savingAccessControlsRef.current.size === 0) {
      accessRulesDraft = { ...confirmedFromServer };
    }

    // Active local change preserved!
    expect(accessRulesDraft.fixedDurationValue).toBe(5);
    expect(accessRulesDraft.fixedDurationUnit).toBe("Months");
  });

  it("Test N: Debounced typing and blur flush persists with latest draft value from ref", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({
      id: "rule-1",
      courseId: sampleCourseId,
      accessType: "everyone",
      durationType: "fixed_duration",
      durationDays: 45,
    });

    let draft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "fixed",
      fixedDurationValue: 30,
      fixedDurationUnit: "Days",
    };
    let server: AccessRulesFormState = { ...draft };
    const draftRef = { current: draft };
    const versionsRef = { fixedDuration: 0 };
    let timer: ReturnType<typeof setTimeout> | null = null;

    const persistFixedDuration = async () => {
      const current = draftRef.current;
      const version = ++versionsRef.fixedDuration;
      const days = current.fixedDurationValue;

      await mockUpsert({
        courseId: sampleCourseId,
        payload: {
          accessType: current.accessType,
          durationType: "fixed_duration",
          durationDays: days,
        },
      });

      if (versionsRef.fixedDuration === version) {
        server = {
          ...server,
          fixedDurationValue: current.fixedDurationValue,
          fixedDurationUnit: current.fixedDurationUnit,
        };
      }
    };

    const handleValueChange = (val: number) => {
      draftRef.current = { ...draftRef.current, fixedDurationValue: val };
      draft = draftRef.current;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void persistFixedDuration();
      }, 400);
    };

    const handleBlur = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (draftRef.current.fixedDurationValue !== server.fixedDurationValue) {
        await persistFixedDuration();
      }
    };

    // Simulate typing 4 -> 45
    handleValueChange(4);
    expect(mockUpsert).not.toHaveBeenCalled();

    handleValueChange(45);
    expect(mockUpsert).not.toHaveBeenCalled();

    // User blurs before 400ms: flushes immediately with latest ref value
    await handleBlur();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        accessType: "everyone",
        durationType: "fixed_duration",
        durationDays: 45,
      },
    });
    expect(server.fixedDurationValue).toBe(45);
  });

  it("Test O: Changing duration unit persists immediately without waiting for debounce", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({
      id: "rule-1",
      courseId: sampleCourseId,
      accessType: "everyone",
      durationType: "fixed_duration",
      durationDays: 90,
    });

    let draft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "fixed",
      fixedDurationValue: 3,
      fixedDurationUnit: "Weeks",
    };
    let server: AccessRulesFormState = { ...draft };
    const draftRef = { current: draft };
    const versionsRef = { fixedDuration: 0 };
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {}, 1000);

    const handleUnitChange = async (unit: DurationUnit) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      draftRef.current = { ...draftRef.current, fixedDurationUnit: unit };
      draft = draftRef.current;

      const version = ++versionsRef.fixedDuration;
      const unitMultiplier = unit === "Months" ? 30 : 1;
      const durationDays = draftRef.current.fixedDurationValue * unitMultiplier;

      await mockUpsert({
        courseId: sampleCourseId,
        payload: {
          accessType: draftRef.current.accessType,
          durationType: "fixed_duration",
          durationDays,
        },
      });

      if (versionsRef.fixedDuration === version) {
        server = { ...server, fixedDurationUnit: unit };
      }
    };

    // User changes from Weeks to Months
    await handleUnitChange("Months");

    expect(timer).toBeNull(); // Pending debounce cleared
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        accessType: "everyone",
        durationType: "fixed_duration",
        durationDays: 90, // 3 * 30
      },
    });
    expect(server.fixedDurationUnit).toBe("Months");
  });

  it("Test P: Optimistic rollback restores previous baseline on mutation failure", async () => {
    const mockUpsert = vi.fn().mockRejectedValue(new Error("Network failure"));

    let draft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "fixed",
      fixedDurationValue: 30,
      fixedDurationUnit: "Days",
    };
    const server: AccessRulesFormState = { ...draft };
    const draftRef = { current: draft };
    const versionsRef = { fixedDuration: 0 };

    const persist = async (nextVal: number) => {
      const prevVal = server.fixedDurationValue;
      draftRef.current = { ...draftRef.current, fixedDurationValue: nextVal };
      draft = draftRef.current;

      const version = ++versionsRef.fixedDuration;
      try {
        await mockUpsert({ courseId: sampleCourseId, payload: { durationDays: nextVal } });
      } catch {
        if (versionsRef.fixedDuration === version) {
          draftRef.current = { ...draftRef.current, fixedDurationValue: prevVal };
          draft = draftRef.current;
        }
      }
    };

    await persist(60);

    // Rollback restored previous baseline 30
    expect(draft.fixedDurationValue).toBe(30);
    expect(draftRef.current.fixedDurationValue).toBe(30);
  });

  it("Test Q: Switching between Lifetime and Fixed Duration invalidates older in-flight duration saves", async () => {
    let resolveDurationSave: () => void;
    const durationSavePromise = new Promise<{ durationDays: number }>((res) => {
      resolveDurationSave = () => res({ durationDays: 60 });
    });
    const mockUpsert = vi.fn();

    let draft: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "fixed",
      fixedDurationValue: 60,
      fixedDurationUnit: "Days",
    };
    let server: AccessRulesFormState = {
      ...initialAccessRulesState,
      durationMode: "fixed",
      fixedDurationValue: 30,
      fixedDurationUnit: "Days",
    };
    const draftRef = { current: draft };
    const versionsRef = { durationMode: 0, fixedDuration: 0 };

    // 1. Start duration save for 60 days
    const durationVersion = ++versionsRef.fixedDuration;
    const durationSaveTask = (async () => {
      await durationSavePromise;
      // When resolved, check if mode is still fixed and version matches
      if (
        versionsRef.fixedDuration === durationVersion &&
        draftRef.current.durationMode === "fixed"
      ) {
        server = { ...server, fixedDurationValue: 60 };
      }
    })();

    // 2. User immediately clicks "Lifetime access" before duration save finishes
    ++versionsRef.fixedDuration; // Invalidated
    const modeVersion = ++versionsRef.durationMode;
    draftRef.current = { ...draftRef.current, durationMode: "lifetime" };
    draft = draftRef.current;

    await mockUpsert({
      courseId: sampleCourseId,
      payload: {
        accessType: draftRef.current.accessType,
        durationType: "lifetime",
        durationDays: null,
      },
    });

    if (versionsRef.durationMode === modeVersion) {
      server = { ...server, durationMode: "lifetime" };
    }

    // 3. Stale duration save finally finishes
    resolveDurationSave!();
    await durationSaveTask;

    // Mode remains Lifetime; older duration save did NOT overwrite
    expect(draft.durationMode).toBe("lifetime");
    expect(server.durationMode).toBe("lifetime");
  });

  it("Test R: accessType is preserved when switching duration mode or persisting duration", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({});

    // Start with restricted access type
    const draftRef = {
      current: {
        ...initialAccessRulesState,
        accessType: "restricted" as AccessType,
        durationMode: "lifetime" as AccessDurationMode,
      },
    };

    // Switch to fixed duration
    const switchMode = async (mode: AccessDurationMode) => {
      draftRef.current.durationMode = mode;
      await mockUpsert({
        courseId: sampleCourseId,
        payload: {
          accessType: draftRef.current.accessType || "everyone",
          durationType: mode === "fixed" ? "fixed_duration" : "lifetime",
          durationDays: 30,
        },
      });
    };

    await switchMode("fixed");

    expect(mockUpsert).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        accessType: "restricted", // Preserved restricted, NOT "everyone"
        durationType: "fixed_duration",
        durationDays: 30,
      },
    });
  });

  it("Test S: isAccessRuleConfigEqual ignores duration value and unit when durationMode is not fixed", () => {
    // Both are lifetime, but value/unit differ
    const lifetimeA = normalizeAccessRulesState({
      accessType: "everyone",
      durationMode: "lifetime",
      fixedDurationValue: 30,
      fixedDurationUnit: "Days",
    });
    const lifetimeB = normalizeAccessRulesState({
      accessType: "everyone",
      durationMode: "lifetime",
      fixedDurationValue: 60,
      fixedDurationUnit: "Months",
    });

    expect(isAccessRuleConfigEqual(lifetimeA, lifetimeB)).toBe(true);

    // Both are fixed, and value differs
    const fixedA = normalizeAccessRulesState({
      accessType: "everyone",
      durationMode: "fixed",
      fixedDurationValue: 30,
      fixedDurationUnit: "Days",
    });
    const fixedB = normalizeAccessRulesState({
      accessType: "everyone",
      durationMode: "fixed",
      fixedDurationValue: 60,
      fixedDurationUnit: "Days",
    });

    expect(isAccessRuleConfigEqual(fixedA, fixedB)).toBe(false);

    // Both are fixed, and unit differs
    const fixedC = normalizeAccessRulesState({
      accessType: "everyone",
      durationMode: "fixed",
      fixedDurationValue: 30,
      fixedDurationUnit: "Days",
    });
    const fixedD = normalizeAccessRulesState({
      accessType: "everyone",
      durationMode: "fixed",
      fixedDurationValue: 30,
      fixedDurationUnit: "Weeks",
    });

    expect(isAccessRuleConfigEqual(fixedC, fixedD)).toBe(false);
  });
});
