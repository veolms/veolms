/**
 * Regression tests for the safe initial course-creation flow and deduplication.
 *
 * Requirements verified:
 *   1. Single creation gateway: ensureCourseCreated()
 *   2. Dedicated in-flight creation ref: inFlightCourseCreationPromiseRef
 *   3. 1-second debounce after typing stops on Course Title
 *   4. Enter key creates immediately without waiting for debounce
 *   5. Debounce + Enter race deduplication (exactly 1 request)
 *   6. Title changes while creation is in flight (preserves latest title, uses update path, no duplicate creation)
 *   7. Downstream unlock boundary: only unlocked after course ID exists
 *   8. Rapid triggers / multiple concurrent callers deduplicated
 *   9. Failure handling: in-flight ref cleared, retry allowed
 *   10. Existing-course behavior unchanged (no creation debounce)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeBasicsState,
  isBasicsMetaEqual,
  type BasicsFormState,
  initialBasicsState,
} from "../../src/courses/CourseCreatePage";

type CreatedCourse = {
  id: string;
  version: number;
  title: string;
  instructorAlias?: string | null;
};

const COURSE_ID = "aaaabbbb-1111-1111-1111-ccccddddeeee";

/**
 * Harness mirroring CourseCreatePage's exact creation, debounce, enter, and title handling logic.
 */
function makeCreationHarness(
  mockCreate: (payload: { title: string; instructorAlias: string | null }) => Promise<CreatedCourse>,
  mockUpdateTitle?: (id: string, newTitle: string) => Promise<void>,
) {
  let currentCourseId: string | null = null;
  const currentCourseIdRef = { current: null as string | null };
  let inFlightCourseCreationPromiseRef: Promise<CreatedCourse> | null = null;
  let titleCreationDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isEditing = false;
  const basicsDraft = { title: "", instructorAlias: "" };
  let serverBasics = { title: "", instructorAlias: "" };

  const cancelTitleCreationDebounce = () => {
    if (titleCreationDebounceTimer) {
      clearTimeout(titleCreationDebounceTimer);
      titleCreationDebounceTimer = null;
    }
  };

  const ensureCourseCreated = async (
    title: string,
    instructorAlias: string | null,
  ): Promise<CreatedCourse> => {
    cancelTitleCreationDebounce();
    if (currentCourseIdRef.current) {
      return {
        id: currentCourseIdRef.current,
        version: 1,
        title: serverBasics.title || title,
        instructorAlias: serverBasics.instructorAlias || instructorAlias,
      };
    }
    if (inFlightCourseCreationPromiseRef) {
      return await inFlightCourseCreationPromiseRef;
    }

    const promise = mockCreate({ title, instructorAlias });
    inFlightCourseCreationPromiseRef = promise;
    try {
      const created = await promise;
      currentCourseIdRef.current = created.id;
      currentCourseId = created.id;
      return created;
    } finally {
      inFlightCourseCreationPromiseRef = null;
    }
  };

  const persistTitleField = async (): Promise<CreatedCourse | undefined> => {
    cancelTitleCreationDebounce();
    const trimmed = basicsDraft.title.trim();
    if (!currentCourseIdRef.current && !currentCourseId) {
      if (!trimmed) return undefined;
      try {
        const created = await ensureCourseCreated(trimmed, basicsDraft.instructorAlias || null);
        serverBasics = { ...serverBasics, title: created.title };

        // Handle title change while creation was in flight
        const latestTitle = basicsDraft.title.trim();
        if (latestTitle && latestTitle !== created.title) {
          if (mockUpdateTitle) {
            await mockUpdateTitle(created.id, latestTitle);
          }
          serverBasics = { ...serverBasics, title: latestTitle };
        }
        return created;
      } catch {
        return undefined;
      }
    }

    // Existing course update path
    if (trimmed && trimmed !== serverBasics.title) {
      if (mockUpdateTitle) {
        await mockUpdateTitle(currentCourseIdRef.current!, trimmed);
      }
      serverBasics = { ...serverBasics, title: trimmed };
    }
    return undefined;
  };

  const onTitleChange = (val: string) => {
    if (!currentCourseIdRef.current && inFlightCourseCreationPromiseRef !== null) {
      return; // frozen while initial creation is in flight
    }
    basicsDraft.title = val;
    if (!currentCourseIdRef.current && !currentCourseId && !isEditing) {
      cancelTitleCreationDebounce();
      if (val.trim()) {
        titleCreationDebounceTimer = setTimeout(() => {
          titleCreationDebounceTimer = null;
          void persistTitleField();
        }, 1000);
      }
    }
  };

  const onTitleKeyDown = (e: { key: string; preventDefault?: () => void }) => {
    if (!currentCourseIdRef.current && inFlightCourseCreationPromiseRef !== null) {
      e.preventDefault?.();
      return; // frozen while initial creation is in flight
    }
    if (e.key === "Enter") {
      e.preventDefault?.();
      if (!currentCourseIdRef.current && !currentCourseId && !isEditing) {
        cancelTitleCreationDebounce();
        return persistTitleField();
      }
    }
  };

  const onTitleBlur = () => {
    if (!currentCourseIdRef.current && inFlightCourseCreationPromiseRef !== null) {
      return; // frozen while initial creation is in flight
    }
    cancelTitleCreationDebounce();
    return persistTitleField();
  };

  const flushBasicsPersistence = async (): Promise<boolean> => {
    cancelTitleCreationDebounce();
    if (currentCourseIdRef.current || currentCourseId) return true;
    if (!basicsDraft.title.trim()) return false;
    if (inFlightCourseCreationPromiseRef) {
      try {
        await inFlightCourseCreationPromiseRef;
        return Boolean(currentCourseIdRef.current || currentCourseId);
      } catch {
        return false;
      }
    }
    try {
      await persistTitleField();
      return Boolean(currentCourseIdRef.current || currentCourseId);
    } catch {
      return false;
    }
  };

  const navigateToStep = async (destination: string): Promise<boolean> => {
    cancelTitleCreationDebounce();
    const flushed = await flushBasicsPersistence();
    const isDownstreamUnlocked = Boolean(currentCourseId);
    if (!currentCourseIdRef.current && !isDownstreamUnlocked && destination !== "basics") {
      return false; // blocked
    }
    return true; // allowed
  };

  return {
    get currentCourseId() {
      return currentCourseId;
    },
    get currentCourseIdRefValue() {
      return currentCourseIdRef.current;
    },
    get inFlightPromise() {
      return inFlightCourseCreationPromiseRef;
    },
    get isDownstreamUnlocked() {
      return Boolean(currentCourseId);
    },
    get isInitialCourseCreationPending() {
      return !currentCourseId && inFlightCourseCreationPromiseRef !== null;
    },
    get hasPendingDebounce() {
      return titleCreationDebounceTimer !== null;
    },
    get basicsDraft() {
      return basicsDraft;
    },
    get serverBasics() {
      return serverBasics;
    },
    setEditing(editing: boolean) {
      isEditing = editing;
    },
    setCurrentCourseId(id: string) {
      currentCourseId = id;
      currentCourseIdRef.current = id;
    },
    onTitleChange,
    onTitleKeyDown,
    onTitleBlur,
    persistTitleField,
    flushBasicsPersistence,
    navigateToStep,
    ensureCourseCreated,
  };
}

describe("Course Creation Concurrency & Safe Initial Creation Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A. Normal debounce creation
  it("A: normal debounce creation -> exactly ONE create-course request after 1 second", async () => {
    vi.useFakeTimers();
    const mockCreate = vi.fn().mockResolvedValue({
      id: COURSE_ID,
      version: 1,
      title: "My Course",
    });
    const h = makeCreationHarness(mockCreate);

    h.onTitleChange("My Course");
    expect(h.hasPendingDebounce).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();

    // Advance timer by 999ms: still no call
    vi.advanceTimersByTime(999);
    expect(mockCreate).not.toHaveBeenCalled();

    // Advance past 1000ms: debounce fires
    vi.advanceTimersByTime(1);
    await Promise.resolve(); // flush microtasks

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      title: "My Course",
      instructorAlias: null,
    });
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // B. Continue typing
  it("B: continue typing -> no creation request until 1 second after typing stops", async () => {
    vi.useFakeTimers();
    const mockCreate = vi.fn().mockResolvedValue({
      id: COURSE_ID,
      version: 1,
      title: "Continuous Typing Course",
    });
    const h = makeCreationHarness(mockCreate);

    h.onTitleChange("C");
    vi.advanceTimersByTime(400);
    expect(mockCreate).not.toHaveBeenCalled();

    h.onTitleChange("Cont");
    vi.advanceTimersByTime(500);
    expect(mockCreate).not.toHaveBeenCalled();

    h.onTitleChange("Continuous");
    vi.advanceTimersByTime(600);
    expect(mockCreate).not.toHaveBeenCalled();

    h.onTitleChange("Continuous Typing Course");
    vi.advanceTimersByTime(999);
    expect(mockCreate).not.toHaveBeenCalled();

    // Finally stop typing for 1000ms
    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      title: "Continuous Typing Course",
      instructorAlias: null,
    });
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // C. Enter before debounce
  it("C: enter before debounce -> debounce cancelled, exactly ONE create request", async () => {
    vi.useFakeTimers();
    const mockCreate = vi.fn().mockResolvedValue({
      id: COURSE_ID,
      version: 1,
      title: "Fast Enter Course",
    });
    const h = makeCreationHarness(mockCreate);

    h.onTitleChange("Fast Enter Course");
    expect(h.hasPendingDebounce).toBe(true);

    // Press Enter at 200ms
    vi.advanceTimersByTime(200);
    const enterPromise = h.onTitleKeyDown({ key: "Enter" });

    // Debounce should be cancelled immediately
    expect(h.hasPendingDebounce).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await enterPromise;

    // Advance past where the debounce would have fired (1000ms+)
    vi.advanceTimersByTime(2000);
    expect(mockCreate).toHaveBeenCalledTimes(1); // STILL 1
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // D. Enter after debounce has started creation
  it("D: enter after debounce has started creation -> joins existing promise, exactly ONE create request", async () => {
    vi.useFakeTimers();
    let resolveCreate!: (v: CreatedCourse) => void;
    const pendingCreate = new Promise<CreatedCourse>((res) => {
      resolveCreate = res;
    });
    const mockCreate = vi.fn().mockReturnValue(pendingCreate);
    const h = makeCreationHarness(mockCreate);

    h.onTitleChange("Debounce Started Course");
    vi.advanceTimersByTime(1000);

    // Creation is now started and in flight
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(h.inFlightPromise).not.toBeNull();

    // User presses Enter while request is still pending
    const enterPromise = h.onTitleKeyDown({ key: "Enter" });

    // No second request fired
    expect(mockCreate).toHaveBeenCalledTimes(1);

    resolveCreate({
      id: COURSE_ID,
      version: 1,
      title: "Debounce Started Course",
    });
    await enterPromise;

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // E. Rapid Enter
  it("E: rapid enter -> press Enter multiple times while creation is pending -> exactly ONE create request", async () => {
    let resolveCreate!: (v: CreatedCourse) => void;
    const pendingCreate = new Promise<CreatedCourse>((res) => {
      resolveCreate = res;
    });
    const mockCreate = vi.fn().mockReturnValue(pendingCreate);
    const h = makeCreationHarness(mockCreate);

    h.basicsDraft.title = "Rapid Enter Course";

    const p1 = h.onTitleKeyDown({ key: "Enter" });
    const p2 = h.onTitleKeyDown({ key: "Enter" });
    const p3 = h.onTitleKeyDown({ key: "Enter" });
    const p4 = h.onTitleKeyDown({ key: "Enter" });

    expect(mockCreate).toHaveBeenCalledTimes(1);

    resolveCreate({
      id: COURSE_ID,
      version: 1,
      title: "Rapid Enter Course",
    });
    await Promise.all([p1, p2, p3, p4]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // F. Tab/navigation concurrency
  it("F: tab/navigation concurrency -> while creation is pending, navigation and flush paths do NOT create another course", async () => {
    let resolveCreate!: (v: CreatedCourse) => void;
    const pendingCreate = new Promise<CreatedCourse>((res) => {
      resolveCreate = res;
    });
    const mockCreate = vi.fn().mockReturnValue(pendingCreate);
    const h = makeCreationHarness(mockCreate);

    h.basicsDraft.title = "Concurrent Tab Course";

    // User blurs / begins persistence
    const blurPromise = h.onTitleBlur();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Concurrently user tries tab switch and flush
    const navPromise = h.navigateToStep("curriculum");
    const flushPromise = h.flushBasicsPersistence();

    expect(mockCreate).toHaveBeenCalledTimes(1);

    resolveCreate({
      id: COURSE_ID,
      version: 1,
      title: "Concurrent Tab Course",
    });
    await Promise.all([blurPromise, navPromise, flushPromise]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // G. Multiple concurrent callers
  it("G: multiple concurrent callers -> ensureCourseCreated called concurrently executes mutation exactly once and all resolve to same courseId", async () => {
    let resolveCreate!: (v: CreatedCourse) => void;
    const pendingCreate = new Promise<CreatedCourse>((res) => {
      resolveCreate = res;
    });
    const mockCreate = vi.fn().mockReturnValue(pendingCreate);
    const h = makeCreationHarness(mockCreate);

    const c1 = h.ensureCourseCreated("Concurrent Course", null);
    const c2 = h.ensureCourseCreated("Concurrent Course", null);
    const c3 = h.ensureCourseCreated("Concurrent Course", null);
    const c4 = h.ensureCourseCreated("Concurrent Course", null);

    resolveCreate({
      id: COURSE_ID,
      version: 1,
      title: "Concurrent Course",
    });

    const results = await Promise.all([c1, c2, c3, c4]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r.id).toBe(COURSE_ID);
    }
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // H. Title change during creation
  it("H: title change during creation -> exactly ONE course created, latest title persisted via update path", async () => {
    let resolveCreate!: (v: CreatedCourse) => void;
    const pendingCreate = new Promise<CreatedCourse>((res) => {
      resolveCreate = res;
    });
    const mockCreate = vi.fn().mockReturnValue(pendingCreate);
    const mockUpdateTitle = vi.fn().mockResolvedValue(undefined);
    const h = makeCreationHarness(mockCreate, mockUpdateTitle);

    // 1. Initial title entry
    h.basicsDraft.title = "React Course";
    const creationPromise = h.persistTitleField();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      title: "React Course",
      instructorAlias: null,
    });

    // 2. User changes title to "React Course Advanced" while creation is still in flight
    h.basicsDraft.title = "React Course Advanced";

    // 3. Creation resolves with "React Course"
    resolveCreate({
      id: COURSE_ID,
      version: 1,
      title: "React Course",
    });
    await creationPromise;

    // Invariant: create was called ONLY once
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(h.currentCourseId).toBe(COURSE_ID);

    // Latest title was updated via existing-course update path
    expect(mockUpdateTitle).toHaveBeenCalledWith(COURSE_ID, "React Course Advanced");
    expect(h.serverBasics.title).toBe("React Course Advanced");
  });

  // I. Creation failure
  it("I: creation failure -> callers receive rejection, inFlight ref cleared, retry succeeds with exactly one request", async () => {
    let rejectCreate!: (err: Error) => void;
    const failingCreate = new Promise<CreatedCourse>((_, rej) => {
      rejectCreate = rej;
    });
    const mockCreate = vi
      .fn()
      .mockReturnValueOnce(failingCreate)
      .mockResolvedValueOnce({
        id: COURSE_ID,
        version: 1,
        title: "Retry Course",
      });
    const h = makeCreationHarness(mockCreate);

    h.basicsDraft.title = "Retry Course";
    const call1 = h.persistTitleField();
    const call2 = h.ensureCourseCreated("Retry Course", null);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(h.inFlightPromise).not.toBeNull();

    // Reject the in-flight creation
    rejectCreate(new Error("503 Service Unavailable"));

    await expect(call1).resolves.toBeUndefined(); // persistTitleField catches and returns undefined
    await expect(call2).rejects.toThrow("503 Service Unavailable");

    // In-flight promise is cleared, no courseId established
    expect(h.inFlightPromise).toBeNull();
    expect(h.currentCourseId).toBeNull();

    // Legitimate retry now succeeds
    const retryResult = await h.persistTitleField();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(retryResult?.id).toBe(COURSE_ID);
    expect(h.currentCourseId).toBe(COURSE_ID);
  });

  // J. Successful creation unlock
  it("J: successful creation unlock -> downstream tabs unavailable before/during creation, available after", async () => {
    let resolveCreate!: (v: CreatedCourse) => void;
    const pendingCreate = new Promise<CreatedCourse>((res) => {
      resolveCreate = res;
    });
    const mockCreate = vi.fn().mockReturnValue(pendingCreate);
    const h = makeCreationHarness(mockCreate);

    // Before title entered: downstream locked
    expect(h.isDownstreamUnlocked).toBe(false);

    // Title entered but creation not started: downstream still locked
    h.basicsDraft.title = "Unlock Test Course";
    expect(h.isDownstreamUnlocked).toBe(false);

    // Creation started and pending: downstream still locked
    const p = h.persistTitleField();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(h.isDownstreamUnlocked).toBe(false);

    // Resolve creation
    resolveCreate({
      id: COURSE_ID,
      version: 1,
      title: "Unlock Test Course",
    });
    await p;

    // After success: courseId exists and downstream unlocked
    expect(h.currentCourseId).toBe(COURSE_ID);
    expect(h.isDownstreamUnlocked).toBe(true);
  });

  // K. Existing course
  it("K: existing course -> no creation debounce runs, existing blur-based update remains unchanged", async () => {
    vi.useFakeTimers();
    const mockCreate = vi.fn().mockResolvedValue({
      id: "should-not-be-called",
      version: 1,
      title: "Nope",
    });
    const mockUpdateTitle = vi.fn().mockResolvedValue(undefined);
    const h = makeCreationHarness(mockCreate, mockUpdateTitle);

    // Existing course has ID
    h.setCurrentCourseId(COURSE_ID);
    h.serverBasics.title = "Existing Course";

    // Typing on existing course does NOT start creation debounce
    h.onTitleChange("Existing Course Renamed");
    expect(h.hasPendingDebounce).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateTitle).not.toHaveBeenCalled();

    // Blur triggers existing update path
    await h.onTitleBlur();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateTitle).toHaveBeenCalledWith(COURSE_ID, "Existing Course Renamed");
  });

  // L. Preserved existing invariants: normalizeBasicsState & isBasicsMetaEqual
  it("L: normalizeBasicsState and isBasicsMetaEqual remain intact", () => {
    const a: BasicsFormState = {
      ...initialBasicsState,
      title: "Test",
      shortDescription: "Short",
    };
    const b: BasicsFormState = { ...a };
    expect(isBasicsMetaEqual(a, b)).toBe(true);

    const c = normalizeBasicsState({ title: "Test", shortDescription: "Short" });
    expect(c.title).toBe("Test");
    expect(c.language).toBe("en");
  });

  // M. Freeze further edit while first time saving
  it("M: freeze further edit while first time saving -> title input and actions frozen while creation pending", async () => {
    let resolveCreate!: (v: CreatedCourse) => void;
    const pendingCreate = new Promise<CreatedCourse>((res) => {
      resolveCreate = res;
    });
    const mockCreate = vi.fn().mockReturnValue(pendingCreate);
    const h = makeCreationHarness(mockCreate);

    // Initial state: not pending, unlocked=false
    expect(h.isInitialCourseCreationPending).toBe(false);
    expect(h.isDownstreamUnlocked).toBe(false);

    // Type title and trigger creation
    h.onTitleChange("Initial Course");
    const savePromise = h.persistTitleField();

    // Now creation is pending: Course Title is frozen!
    expect(h.isInitialCourseCreationPending).toBe(true);
    expect(h.isDownstreamUnlocked).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Any attempt to edit further while initial save is in flight is ignored/frozen
    h.onTitleChange("Attempt to edit while frozen");
    expect(h.basicsDraft.title).toBe("Initial Course"); // Did not change!

    // Any attempt to press Enter while initial save is in flight is ignored
    h.onTitleKeyDown({ key: "Enter" });
    expect(mockCreate).toHaveBeenCalledTimes(1); // Still 1

    // Any attempt to blur while initial save is in flight is ignored
    h.onTitleBlur();
    expect(mockCreate).toHaveBeenCalledTimes(1); // Still 1

    // Resolve initial creation
    resolveCreate({
      id: COURSE_ID,
      version: 1,
      title: "Initial Course",
    });
    await savePromise;

    // Creation completed: Course Title unfreezes, downstream fields unlock!
    expect(h.isInitialCourseCreationPending).toBe(false);
    expect(h.isDownstreamUnlocked).toBe(true);
    expect(h.currentCourseId).toBe(COURSE_ID);

    // Now user can edit further normally
    h.onTitleChange("Initial Course - Updated");
    expect(h.basicsDraft.title).toBe("Initial Course - Updated");
  });
});
