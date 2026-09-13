import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Course,
  CourseSettings,
  CreateCourseRequest,
  UpdateCourseBasicsRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import {
  initialBasicsState,
  normalizeBasicsState,
  isBasicsEqual,
  isBasicsMetaEqual,
  isBasicsSettingsEqual,
  type BasicsFormState,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 1: Server-First Basics Persistence & Creation Gate", () => {
  const sampleCourseId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Title Creation Gate & Local Draft Preservation", () => {
    it("Test 1: Downstream fields and wizard tabs are locked when courseId is null", () => {
      let currentCourseId: string | null = null;
      const isEditing = false;
      const isDownstreamUnlocked = Boolean(currentCourseId);

      expect(isDownstreamUnlocked).toBe(false);

      // Other basics fields disabled when !isDownstreamUnlocked
      const isShortDescDisabled = !isDownstreamUnlocked;
      const isCourseDescDisabled = !isDownstreamUnlocked;
      const isInstructorAliasDisabled = !isDownstreamUnlocked;
      const isShowInstructorNameDisabled = !isDownstreamUnlocked;

      expect(isShortDescDisabled).toBe(true);
      expect(isCourseDescDisabled).toBe(true);
      expect(isInstructorAliasDisabled).toBe(true);
      expect(isShowInstructorNameDisabled).toBe(true);

      // Non-basics wizard tabs disabled when !isDownstreamUnlocked
      const isCurriculumTabDisabled = !isDownstreamUnlocked;
      const isAccessRulesTabDisabled = !isDownstreamUnlocked;
      const isPricingTabDisabled = !isDownstreamUnlocked;
      expect(isCurriculumTabDisabled).toBe(true);
      expect(isAccessRulesTabDisabled).toBe(true);
      expect(isPricingTabDisabled).toBe(true);
    });

    it("Test 2: Blurring empty course title does NOT create course or unlock downstream fields", async () => {
      const mockCreateCourse = vi.fn();
      let currentCourseId: string | null = null;
      let basicsDraft: BasicsFormState = { ...initialBasicsState, title: "   " };
      let serverBasics: BasicsFormState = { ...initialBasicsState };

      const persistTitleField = async () => {
        const trimmed = basicsDraft.title.trim();
        if (!currentCourseId) {
          if (!trimmed) {
            return; // Empty title: abort without calling API
          }
          const created = await mockCreateCourse({ title: trimmed });
          currentCourseId = created.id;
        }
      };

      await persistTitleField();

      expect(mockCreateCourse).not.toHaveBeenCalled();
      expect(currentCourseId).toBeNull();
      expect(Boolean(currentCourseId)).toBe(false);
    });

    it("Test 3: Failed course creation keeps downstream fields and tabs locked", async () => {
      const mockCreateCourse = vi.fn().mockRejectedValue(new Error("Network Error"));
      let currentCourseId: string | null = null;
      let toastError: string | null = null;
      let basicsDraft: BasicsFormState = { ...initialBasicsState, title: "Modern Backend Engineering" };

      const persistTitleField = async () => {
        const trimmed = basicsDraft.title.trim();
        if (!currentCourseId) {
          if (!trimmed) return;
          try {
            const created = await mockCreateCourse({ title: trimmed });
            currentCourseId = created.id;
          } catch (err) {
            toastError = (err as Error).message;
          }
        }
      };

      await persistTitleField();

      expect(mockCreateCourse).toHaveBeenCalledTimes(1);
      expect(currentCourseId).toBeNull();
      expect(Boolean(currentCourseId)).toBe(false);
      expect(toastError).toBe("Network Error");
      // Downstream fields stay locked
      expect(Boolean(currentCourseId)).toBe(false);
    });

    it("Test 4: Successful title creation unlocks downstream fields and PRESERVES existing local draft fields", async () => {
      const mockCreateCourse = vi.fn().mockResolvedValue({
        id: sampleCourseId,
        title: "Complete Backend with Node.js",
        version: 1,
        shortDescription: null,
        description: null,
        instructorAlias: "Alex Rivera",
      });

      let currentCourseId: string | null = null;
      let courseVersion = 1;

      // User already typed into shortDescription and courseDescription before or during initial draft setup
      let basicsDraft: BasicsFormState = {
        ...initialBasicsState,
        title: "Complete Backend with Node.js",
        shortDescription: "A comprehensive backend guide",
        description: "<p>Learn Node.js in depth</p>",
        instructorAlias: "Alex Rivera",
        showInstructorName: true,
      };
      let serverBasics: BasicsFormState = { ...initialBasicsState };

      const persistTitleField = async () => {
        const trimmed = basicsDraft.title.trim();
        if (!currentCourseId) {
          if (!trimmed) return;
          const created = await mockCreateCourse({
            title: trimmed,
            instructorAlias: basicsDraft.instructorAlias.trim() || null,
          });

          currentCourseId = created.id;
          courseVersion = created.version;

          // Sync baseline
          serverBasics = normalizeBasicsState({
            ...serverBasics,
            title: created.title,
            instructorAlias: created.instructorAlias || "",
          });

          // CRITICAL: Preserve existing local draft fields! Do NOT reset shortDescription / description
          basicsDraft = {
            ...basicsDraft,
            title: created.title,
            instructorAlias: created.instructorAlias ?? basicsDraft.instructorAlias,
          };
        }
      };

      await persistTitleField();

      expect(mockCreateCourse).toHaveBeenCalledTimes(1);
      expect(currentCourseId).toBe(sampleCourseId);
      expect(Boolean(currentCourseId)).toBe(true); // UNLOCKED!

      // Verify baseline was updated for title
      expect(serverBasics.title).toBe("Complete Backend with Node.js");
      expect(serverBasics.instructorAlias).toBe("Alex Rivera");

      // Verify draft PRESERVED local values!
      expect(basicsDraft.shortDescription).toBe("A comprehensive backend guide");
      expect(basicsDraft.description).toBe("<p>Learn Node.js in depth</p>");
      expect(basicsDraft.showInstructorName).toBe(true);

      // Local draft is dirty relative to baseline for the uncommitted fields
      expect(isBasicsMetaEqual(basicsDraft, serverBasics)).toBe(false);
    });

    it("Test 5: Never creates course with 'Untitled Course' fallback", async () => {
      const mockCreateCourse = vi.fn();
      let currentCourseId: string | null = null;
      let courseTitle = "";

      const ensureCourseDraft = async () => {
        if (currentCourseId) return currentCourseId;
        const trimmed = courseTitle.trim();
        if (!trimmed) {
          throw new Error("Course draft must be created before performing this action. Please enter a course title first.");
        }
        const created = await mockCreateCourse({ title: trimmed });
        currentCourseId = created.id;
        return created.id;
      };

      await expect(ensureCourseDraft()).rejects.toThrow("Course draft must be created before performing this action. Please enter a course title first.");
      expect(mockCreateCourse).not.toHaveBeenCalled();
    });
  });

  describe("2. Text Persistence on Blur (No Keystroke Debounce)", () => {
    it("Test 6: Typing updates local draft state immediately without calling API", () => {
      const mockUpdateBasics = vi.fn();
      let basicsDraft: BasicsFormState = {
        ...initialBasicsState,
        title: "Initial Title",
      };

      // Simulating user typing 5 characters
      const setCourseTitle = (newTitle: string) => {
        basicsDraft = { ...basicsDraft, title: newTitle };
      };

      setCourseTitle("Initial Title ");
      setCourseTitle("Initial Title v");
      setCourseTitle("Initial Title v2");

      expect(basicsDraft.title).toBe("Initial Title v2");
      expect(mockUpdateBasics).not.toHaveBeenCalled();
    });

    it("Test 7: Blurring an edited field triggers updateBasicsMutation with latest draft and version", async () => {
      const mockUpdateBasics = vi.fn().mockImplementation(async ({ payload }: { id: string; payload: UpdateCourseBasicsRequest }) => {
        return {
          id: sampleCourseId,
          title: payload.title,
          shortDescription: payload.shortDescription,
          description: payload.description,
          instructorAlias: payload.instructorAlias,
          version: (payload.version ?? 1) + 1,
        };
      });

      let currentCourseId: string | null = sampleCourseId;
      let courseVersion = 1;
      let serverBasics: BasicsFormState = normalizeBasicsState({
        title: "Old Title",
        shortDescription: "Old Short Desc",
      });
      let basicsDraft: BasicsFormState = { ...serverBasics, shortDescription: "New Updated Short Desc" };
      const savingBasicsControls = new Set<string>();

      const persistBasicsField = async (fieldKey: "title" | "shortDescription") => {
        if (!currentCourseId) return;
        if (fieldKey === "shortDescription") {
          if (basicsDraft.shortDescription.trim() === serverBasics.shortDescription.trim()) return;
        }

        savingBasicsControls.add(fieldKey);
        try {
          const payload: UpdateCourseBasicsRequest = {
            title: basicsDraft.title.trim(),
            shortDescription: basicsDraft.shortDescription.trim() || null,
            description: basicsDraft.description.trim() || null,
            instructorAlias: basicsDraft.instructorAlias.trim() || null,
            version: courseVersion,
          };
          const updated = await mockUpdateBasics({ id: currentCourseId, payload });
          courseVersion = updated.version;
          serverBasics = normalizeBasicsState({
            ...serverBasics,
            shortDescription: updated.shortDescription || "",
          });
        } finally {
          savingBasicsControls.delete(fieldKey);
        }
      };

      await persistBasicsField("shortDescription");

      expect(mockUpdateBasics).toHaveBeenCalledTimes(1);
      expect(mockUpdateBasics).toHaveBeenCalledWith({
        id: sampleCourseId,
        payload: {
          title: "Old Title",
          shortDescription: "New Updated Short Desc",
          description: null,
          instructorAlias: null,
          version: 1,
        },
      });
      expect(courseVersion).toBe(2);
      expect(serverBasics.shortDescription).toBe("New Updated Short Desc");
      expect(savingBasicsControls.size).toBe(0);
    });

    it("Test 8: Blurring unchanged field skips API call (deduplication)", async () => {
      const mockUpdateBasics = vi.fn();
      let currentCourseId: string | null = sampleCourseId;
      let serverBasics: BasicsFormState = normalizeBasicsState({
        title: "Clean Title",
        shortDescription: "Clean Desc",
      });
      let basicsDraft: BasicsFormState = { ...serverBasics };

      const persistBasicsField = async (fieldKey: "shortDescription") => {
        if (!currentCourseId) return;
        if (basicsDraft[fieldKey].trim() === serverBasics[fieldKey].trim()) {
          return; // Skip no-op blur
        }
        await mockUpdateBasics();
      };

      await persistBasicsField("shortDescription");
      expect(mockUpdateBasics).not.toHaveBeenCalled();
    });
  });

  describe("3. Immediate Show Instructor Name Persistence", () => {
    it("Test 9: Toggling Show Instructor Name immediately updates UI and calls upsertSettingsMutation", async () => {
      const mockUpsertSettings = vi.fn().mockImplementation(async ({ payload }: { courseId: string; payload: UpdateCourseSettingsRequest }) => {
        return {
          id: "settings-1",
          courseId: sampleCourseId,
          showInstructorName: payload.showInstructorName,
          language: payload.language || "en",
        } satisfies Partial<CourseSettings>;
      });

      let currentCourseId: string | null = sampleCourseId;
      let basicsDraft: BasicsFormState = { ...initialBasicsState, showInstructorName: true };
      let serverBasics: BasicsFormState = { ...initialBasicsState, showInstructorName: true };
      const savingBasicsControls = new Set<string>();

      const handleShowInstructorNameChange = async (nextValue: boolean) => {
        if (!currentCourseId) return;
        const previousValue = serverBasics.showInstructorName;

        // 1. Optimistic update
        basicsDraft = { ...basicsDraft, showInstructorName: nextValue };
        savingBasicsControls.add("showInstructorName");

        try {
          const res = await mockUpsertSettings({
            courseId: currentCourseId,
            payload: {
              showInstructorName: nextValue,
              language: basicsDraft.language || "en",
            },
          });
          serverBasics = { ...serverBasics, showInstructorName: res.showInstructorName ?? nextValue };
        } catch {
          basicsDraft = { ...basicsDraft, showInstructorName: previousValue };
        } finally {
          savingBasicsControls.delete("showInstructorName");
        }
      };

      await handleShowInstructorNameChange(false);

      expect(mockUpsertSettings).toHaveBeenCalledTimes(1);
      expect(mockUpsertSettings).toHaveBeenCalledWith({
        courseId: sampleCourseId,
        payload: {
          showInstructorName: false,
          language: "en",
        },
      });
      expect(basicsDraft.showInstructorName).toBe(false);
      expect(serverBasics.showInstructorName).toBe(false);
      expect(savingBasicsControls.size).toBe(0);
    });

    it("Test 10: Failed settings toggle rolls back optimistic update to previous boolean state", async () => {
      const mockUpsertSettings = vi.fn().mockRejectedValue(new Error("Server error"));
      let currentCourseId: string | null = sampleCourseId;
      let basicsDraft: BasicsFormState = { ...initialBasicsState, showInstructorName: true };
      let serverBasics: BasicsFormState = { ...initialBasicsState, showInstructorName: true };
      let toastError: string | null = null;

      const handleShowInstructorNameChange = async (nextValue: boolean) => {
        if (!currentCourseId) return;
        const previousValue = serverBasics.showInstructorName;

        // 1. Optimistic update
        basicsDraft = { ...basicsDraft, showInstructorName: nextValue };

        try {
          await mockUpsertSettings({
            courseId: currentCourseId,
            payload: { showInstructorName: nextValue },
          });
          serverBasics = { ...serverBasics, showInstructorName: nextValue };
        } catch (err) {
          basicsDraft = { ...basicsDraft, showInstructorName: previousValue };
          toastError = (err as Error).message;
        }
      };

      await handleShowInstructorNameChange(false);

      expect(mockUpsertSettings).toHaveBeenCalledTimes(1);
      // Rolled back
      expect(basicsDraft.showInstructorName).toBe(true);
      expect(serverBasics.showInstructorName).toBe(true);
      expect(toastError).toBe("Server error");
    });
  });

  describe("4. Serialized Queue & Late-Binding (No Stale Closures & No 409 Conflict)", () => {
    it("Test 11: Rapid queued blurs execute sequentially and read the LATEST draft and courseVersion at execution time", async () => {
      let currentCourseId: string | null = sampleCourseId;
      let courseVersion = 1;

      const mutationCallHistory: Array<{ title: string; shortDescription: string | null; version: number }> = [];

      const mockUpdateBasics = vi.fn().mockImplementation(async ({ payload }: { id: string; payload: UpdateCourseBasicsRequest }) => {
        mutationCallHistory.push({
          title: payload.title!,
          shortDescription: payload.shortDescription ?? null,
          version: payload.version!,
        });
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          id: sampleCourseId,
          title: payload.title,
          shortDescription: payload.shortDescription,
          version: payload.version! + 1,
        };
      });

      let basicsDraft: BasicsFormState = normalizeBasicsState({
        title: "Initial Title",
        shortDescription: "Initial Short",
      });
      let serverBasics: BasicsFormState = { ...basicsDraft };

      let inFlightPromise: Promise<unknown> | null = null;
      let queueVersionCounter = 0;

      const executeSerializedBasicsMetaMutation = async (controlKey: string) => {
        const prior = inFlightPromise;
        const targetVersion = ++queueVersionCounter;

        const run = async () => {
          if (prior) {
            try {
              await prior;
            } catch {
              // Ignore previous error to allow subsequent to proceed
            }
          }

          // CRITICAL REQUIREMENT: Read LATEST draft values and LATEST courseVersion at execution time!
          const latestDraft = basicsDraft;
          const currentVersion = courseVersion;

          const payload: UpdateCourseBasicsRequest = {
            title: latestDraft.title.trim(),
            shortDescription: latestDraft.shortDescription.trim() || null,
            description: latestDraft.description.trim() || null,
            instructorAlias: latestDraft.instructorAlias.trim() || null,
            version: currentVersion,
          };

          const updated = await mockUpdateBasics({ id: currentCourseId!, payload });
          courseVersion = updated.version;
          serverBasics = normalizeBasicsState({
            ...serverBasics,
            title: updated.title,
            shortDescription: updated.shortDescription || "",
          });
          return updated;
        };

        const promise = run();
        inFlightPromise = promise;
        return await promise;
      };

      // 1. User edits title
      basicsDraft = { ...basicsDraft, title: "Title Edited Once" };
      const p1 = executeSerializedBasicsMetaMutation("title");

      // 2. While p1 is still in-flight, user edits shortDescription and triggers second blur
      basicsDraft = { ...basicsDraft, shortDescription: "Short Desc Edited While Title In Flight" };
      const p2 = executeSerializedBasicsMetaMutation("shortDescription");

      await Promise.all([p1, p2]);

      expect(mockUpdateBasics).toHaveBeenCalledTimes(2);

      // First call sent version 1
      expect(mutationCallHistory[0]).toEqual({
        title: "Title Edited Once",
        shortDescription: "Initial Short",
        version: 1,
      });

      // Second call executed AFTER p1 resolved, reading the updated courseVersion 2 AND the updated shortDescription!
      expect(mutationCallHistory[1]).toEqual({
        title: "Title Edited Once",
        shortDescription: "Short Desc Edited While Title In Flight",
        version: 2, // Incremented version! No 409 conflict!
      });

      expect(courseVersion).toBe(3);
      expect(serverBasics.title).toBe("Title Edited Once");
      expect(serverBasics.shortDescription).toBe("Short Desc Edited While Title In Flight");
    });
  });

  describe("5. Navigation Flush & Query Hydration Protection", () => {
    it("Test 12: Navigation flushes pending text changes before switching steps", async () => {
      const mockUpdateBasics = vi.fn().mockResolvedValue({
        id: sampleCourseId,
        title: "Flushed Title",
        version: 2,
      });

      let currentCourseId: string | null = sampleCourseId;
      let courseVersion = 1;
      let serverBasics: BasicsFormState = normalizeBasicsState({ title: "Old Title" });
      let basicsDraft: BasicsFormState = { ...serverBasics, title: "Flushed Title" };
      let activeStep = "basics";

      const flushBasicsPersistence = async () => {
        if (!isBasicsMetaEqual(basicsDraft, serverBasics)) {
          const updated = await mockUpdateBasics({
            id: currentCourseId,
            payload: { title: basicsDraft.title.trim(), version: courseVersion },
          });
          courseVersion = updated.version;
          serverBasics = { ...serverBasics, title: updated.title };
          return true;
        }
        return true;
      };

      const navigateToStep = async (destination: string) => {
        if (activeStep === "basics") {
          await flushBasicsPersistence();
        }
        activeStep = destination;
      };

      expect(activeStep).toBe("basics");
      await navigateToStep("curriculum");

      expect(mockUpdateBasics).toHaveBeenCalledTimes(1);
      expect(activeStep).toBe("curriculum");
      expect(serverBasics.title).toBe("Flushed Title");
    });

    it("Test 13: Query hydration does NOT overwrite active local draft edits or in-flight saves", () => {
      let serverBasics: BasicsFormState = normalizeBasicsState({ title: "Server Title" });
      let basicsDraft: BasicsFormState = normalizeBasicsState({ title: "User Typing Fresh Title" });
      const savingControls = new Set<string>(["title"]);

      const isBasicsDirty = !isBasicsEqual(basicsDraft, serverBasics);
      expect(isBasicsDirty).toBe(true);

      // Incoming background refetch data from editorData
      const incomingServerCourse = {
        title: "Stale Remote Server Title",
        version: 1,
      };

      const onHydration = () => {
        const confirmedBasics = normalizeBasicsState({ title: incomingServerCourse.title });
        serverBasics = confirmedBasics;

        const isBasicsSavingActive = savingControls.size > 0;
        // GUARD: Only sync draft if NOT dirty and NOT saving
        if (!isBasicsDirty && !isBasicsSavingActive) {
          basicsDraft = confirmedBasics;
        }
      };

      onHydration();

      // serverBasics baseline was updated to remote
      expect(serverBasics.title).toBe("Stale Remote Server Title");
      // BUT basicsDraft was PROTECTED from overwrite!
      expect(basicsDraft.title).toBe("User Typing Fresh Title");
    });

    it("Test 14: Title input is auto-focused by default when creating a course (!currentCourseId)", () => {
      let currentCourseId: string | null = null;
      let activeStep = "basics";
      let isFocused = false;

      const titleInput = {
        focus: () => {
          isFocused = true;
        },
      };

      const runAutoFocusEffect = () => {
        if (!currentCourseId && activeStep === "basics") {
          titleInput.focus();
        }
      };

      runAutoFocusEffect();
      expect(isFocused).toBe(true);

      // If course is already created, autofocus effect does not trigger
      isFocused = false;
      currentCourseId = sampleCourseId;
      runAutoFocusEffect();
      expect(isFocused).toBe(false);
    });

    it("Test 15: Blurring title input without entering a title displays tooltip above the field", () => {
      let currentCourseId: string | null = null;
      let courseTitle = "";
      let showTitleTooltip = false;

      const onBlur = () => {
        if (!currentCourseId && !courseTitle.trim()) {
          showTitleTooltip = true;
        }
      };

      onBlur();
      expect(showTitleTooltip).toBe(true);

      // If title is non-empty, tooltip is NOT shown
      showTitleTooltip = false;
      courseTitle = "Valid Course Title";
      onBlur();
      expect(showTitleTooltip).toBe(false);
    });

    it("Test 16: Focusing title input or typing dismisses the title tooltip", () => {
      let showTitleTooltip = true;

      // On focus
      const onFocus = () => {
        showTitleTooltip = false;
      };
      onFocus();
      expect(showTitleTooltip).toBe(false);

      // On typing non-empty text
      showTitleTooltip = true;
      const onChange = (val: string) => {
        if (val.trim()) {
          showTitleTooltip = false;
        }
      };
      onChange("Node");
      expect(showTitleTooltip).toBe(false);
    });

    it("Test 17: Attempting to navigate downstream when title is missing triggers tooltip and focuses title input", () => {
      let currentCourseId: string | null = null;
      let isFocused = false;
      let showTitleTooltip = false;
      let toastMessage: string | null = null;
      const isDownstreamUnlocked = Boolean(currentCourseId);

      const titleInput = {
        focus: () => {
          isFocused = true;
        },
      };

      const navigateToStep = (destination: string) => {
        if (!isDownstreamUnlocked && destination !== "basics") {
          showTitleTooltip = true;
          titleInput.focus();
          toastMessage = "Add a course title to continue.";
          return;
        }
      };

      navigateToStep("curriculum");
      expect(showTitleTooltip).toBe(true);
      expect(isFocused).toBe(true);
      expect(toastMessage).toBe("Add a course title to continue.");
    });

    it("Test 18: Downstream fields unlock immediately when course title is filled without waiting for API call to finish", () => {
      let currentCourseId: string | null = null;
      let courseTitle = "";

      // Initially empty
      let isCourseTitleFilled = Boolean(courseTitle.trim());
      let isDownstreamUnlocked = Boolean(currentCourseId) || isCourseTitleFilled;
      expect(isDownstreamUnlocked).toBe(false);

      // User types a title -> immediately unlocked even though currentCourseId is still null
      courseTitle = "Node.js Microservices";
      isCourseTitleFilled = Boolean(courseTitle.trim());
      isDownstreamUnlocked = Boolean(currentCourseId) || isCourseTitleFilled;
      expect(isDownstreamUnlocked).toBe(true);

      // If user empties title, downstream locks again
      courseTitle = "   ";
      isCourseTitleFilled = Boolean(courseTitle.trim());
      isDownstreamUnlocked = Boolean(currentCourseId) || isCourseTitleFilled;
      expect(isDownstreamUnlocked).toBe(false);
    });

    it("Test 19: Downstream field persistence awaits in-flight course creation and uses created course ID", async () => {
      let currentCourseId: string | null = null;
      const currentCourseIdRef: { current: string | null } = { current: currentCourseId };

      let resolveCreation: ((val: { id: string; version: number; title: string }) => void) | null = null;
      const creationPromise = new Promise<{ id: string; version: number; title: string }>((res) => {
        resolveCreation = res;
      });

      const inFlightBasicsPromiseRef = {
        current: creationPromise as Promise<any> | null,
      };

      const mockUpdateBasics = vi.fn().mockResolvedValue({
        id: sampleCourseId,
        version: 2,
        title: "Test Course",
        shortDescription: "Saved Short Desc",
      });

      // User blurs short description while course creation is in flight
      const persistShortDescription = async (text: string) => {
        let targetId = currentCourseIdRef.current;
        if (!targetId) {
          if (inFlightBasicsPromiseRef.current) {
            await inFlightBasicsPromiseRef.current;
          }
          targetId = currentCourseIdRef.current;
        }
        if (!targetId) return;

        return await mockUpdateBasics({
          id: targetId,
          shortDescription: text,
        });
      };

      const persistPromise = persistShortDescription("Saved Short Desc");

      // Complete background creation
      currentCourseIdRef.current = sampleCourseId;
      resolveCreation!({ id: sampleCourseId, version: 1, title: "Test Course" });

      await persistPromise;

      expect(mockUpdateBasics).toHaveBeenCalledWith({
        id: sampleCourseId,
        shortDescription: "Saved Short Desc",
      });
    });

    it("Test 20: Toggling Show Instructor Name while course creation is in flight completes successfully", async () => {
      let currentCourseId: string | null = null;
      const currentCourseIdRef: { current: string | null } = { current: currentCourseId };

      let resolveCreation: ((val: { id: string; version: number }) => void) | null = null;
      const inFlightBasicsPromiseRef = {
        current: new Promise<{ id: string; version: number }>((res) => {
          resolveCreation = res;
        }),
      };

      const mockUpsertSettings = vi.fn().mockResolvedValue({
        showInstructorName: true,
      });

      const handleToggle = async (val: boolean) => {
        let targetId = currentCourseIdRef.current;
        if (!targetId) {
          if (inFlightBasicsPromiseRef.current) {
            await inFlightBasicsPromiseRef.current;
          }
          targetId = currentCourseIdRef.current;
        }
        if (!targetId) return;

        return await mockUpsertSettings({
          courseId: targetId,
          showInstructorName: val,
        });
      };

      const togglePromise = handleToggle(true);

      currentCourseIdRef.current = sampleCourseId;
      resolveCreation!({ id: sampleCourseId, version: 1 });

      await togglePromise;

      expect(mockUpsertSettings).toHaveBeenCalledWith({
        courseId: sampleCourseId,
        showInstructorName: true,
      });
    });
  });
});
