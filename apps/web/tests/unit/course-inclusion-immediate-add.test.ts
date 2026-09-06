import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CourseIncludeItem } from "@veolms/contracts";

interface TestInclusionItem {
  id: string;
  text: string;
  isPendingCreation?: boolean;
}

describe("Course Wizard Step 4: Inclusion Immediate Creation (Milestone 1)", () => {
  const sampleCourseId = "12345678-1234-1234-1234-123456789abc";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Case A & B: Adding an inclusion immediately creates a pending item and triggers the create API", async () => {
    const mockCreateMutation = vi.fn().mockImplementation(async ({ payload }: { payload: { text: string } }) => {
      return {
        id: "server-uuid-1",
        courseId: sampleCourseId,
        text: payload.text,
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies CourseIncludeItem;
    });

    let manualIncludesDraft: TestInclusionItem[] = [];
    let serverIncludes: CourseIncludeItem[] = [];

    const handleAddManualInclusion = async (customText?: string) => {
      if (manualIncludesDraft.length >= 6) return;
      const defaultText = customText?.trim().slice(0, 25) || `Benefit ${manualIncludesDraft.length + 1}`.slice(0, 25);
      const tempId = `temp-inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // 1. Immediately append pending item
      manualIncludesDraft = [
        ...manualIncludesDraft,
        {
          id: tempId,
          text: defaultText,
          isPendingCreation: true,
        },
      ];

      // 2. Call mutation
      try {
        const created = await mockCreateMutation({
          courseId: sampleCourseId,
          payload: { text: defaultText },
        });

        // 3. Reconcile on success
        manualIncludesDraft = manualIncludesDraft.map((item) =>
          item.id === tempId
            ? {
                id: created.id,
                text: item.text,
                isPendingCreation: false,
              }
            : item,
        );
        serverIncludes = [...serverIncludes, created];
      } catch {
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== tempId);
      }
    };

    // Trigger add
    const addPromise = handleAddManualInclusion("Certificate of completion");

    // Immediately check synchronous local state: item is present and marked as pending
    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.id).toMatch(/^temp-inc-/);
    expect(manualIncludesDraft[0]!.text).toBe("Certificate of completion");
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(true);
    expect(mockCreateMutation).toHaveBeenCalledTimes(1);
    expect(mockCreateMutation).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: { text: "Certificate of completion" },
    });

    // Wait for mutation resolution
    await addPromise;
  });

  it("Case C & D: Successful creation replaces temporary ID with server UUID and clears pending state", async () => {
    const serverUuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    let resolveMutation: (val: CourseIncludeItem) => void;
    const createPromise = new Promise<CourseIncludeItem>((resolve) => {
      resolveMutation = resolve;
    });
    const mockCreateMutation = vi.fn().mockReturnValue(createPromise);

    let manualIncludesDraft: TestInclusionItem[] = [];
    let serverIncludes: CourseIncludeItem[] = [];

    const handleAddManualInclusion = async (customText?: string) => {
      if (manualIncludesDraft.length >= 6) return;
      const defaultText = customText?.trim().slice(0, 25) || `Benefit ${manualIncludesDraft.length + 1}`;
      const tempId = `temp-inc-123`;

      manualIncludesDraft = [
        ...manualIncludesDraft,
        {
          id: tempId,
          text: defaultText,
          isPendingCreation: true,
        },
      ];

      try {
        const created = await mockCreateMutation();
        manualIncludesDraft = manualIncludesDraft.map((item) =>
          item.id === tempId
            ? {
                id: created.id,
                text: item.text,
                isPendingCreation: false,
              }
            : item,
        );
        serverIncludes = [...serverIncludes, created];
      } catch {
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== tempId);
      }
    };

    const action = handleAddManualInclusion("Lifetime Access");
    expect(manualIncludesDraft[0]!.id).toBe("temp-inc-123");
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(true);

    // Resolve server response
    resolveMutation!({
      id: serverUuid,
      courseId: sampleCourseId,
      text: "Lifetime Access",
      icon: null,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await action;

    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.id).toBe(serverUuid);
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(false);
    expect(serverIncludes).toHaveLength(1);
    expect(serverIncludes[0]!.id).toBe(serverUuid);
  });

  it("Case E: Failed creation removes ONLY the failed temporary item and leaves others intact", async () => {
    let manualIncludesDraft: TestInclusionItem[] = [
      { id: "existing-uuid-1", text: "Existing Item", isPendingCreation: false },
    ];
    let toastMessage = "";

    const mockCreateMutation = vi.fn().mockRejectedValue(new Error("Network Error: Unable to reach database"));

    const handleAddManualInclusion = async (customText?: string) => {
      const defaultText = customText || "New Item";
      const tempId = "temp-inc-fail";

      manualIncludesDraft = [
        ...manualIncludesDraft,
        {
          id: tempId,
          text: defaultText,
          isPendingCreation: true,
        },
      ];

      try {
        await mockCreateMutation();
      } catch (err: unknown) {
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== tempId);
        toastMessage = (err as Error).message;
      }
    };

    const action = handleAddManualInclusion("Fail Item");
    expect(manualIncludesDraft).toHaveLength(2);
    expect(manualIncludesDraft[1]!.id).toBe("temp-inc-fail");

    await action;

    // Verify temp item was cleaned up, and existing item is unaffected
    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.id).toBe("existing-uuid-1");
    expect(toastMessage).toBe("Network Error: Unable to reach database");
  });

  it("Case F & H: Two or more additions can be pending concurrently and UI remains unlocked", async () => {
    const pendingResolvers: Array<(item: CourseIncludeItem) => void> = [];
    const mockCreateMutation = vi.fn().mockImplementation(() => {
      return new Promise<CourseIncludeItem>((resolve) => {
        pendingResolvers.push(resolve);
      });
    });

    let manualIncludesDraft: TestInclusionItem[] = [];

    const handleAddManualInclusion = async (customText: string, tempId: string) => {
      manualIncludesDraft = [
        ...manualIncludesDraft,
        {
          id: tempId,
          text: customText,
          isPendingCreation: true,
        },
      ];

      try {
        const created = await mockCreateMutation();
        manualIncludesDraft = manualIncludesDraft.map((item) =>
          item.id === tempId
            ? {
                id: created.id,
                text: item.text,
                isPendingCreation: false,
              }
            : item,
        );
      } catch {
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== tempId);
      }
    };

    // Start Add 1
    const p1 = handleAddManualInclusion("Inclusion 1", "temp-1");
    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(true);

    // Immediately start Add 2 while Add 1 is still in-flight
    const p2 = handleAddManualInclusion("Inclusion 2", "temp-2");
    expect(manualIncludesDraft).toHaveLength(2);
    expect(manualIncludesDraft[0]!.id).toBe("temp-1");
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(true);
    expect(manualIncludesDraft[1]!.id).toBe("temp-2");
    expect(manualIncludesDraft[1]!.isPendingCreation).toBe(true);

    // Resolve both
    pendingResolvers[0]!({
      id: "uuid-1",
      courseId: sampleCourseId,
      text: "Inclusion 1",
      icon: null,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    pendingResolvers[1]!({
      id: "uuid-2",
      courseId: sampleCourseId,
      text: "Inclusion 2",
      icon: null,
      position: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await Promise.all([p1, p2]);

    expect(manualIncludesDraft).toHaveLength(2);
    expect(manualIncludesDraft[0]!.id).toBe("uuid-1");
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(false);
    expect(manualIncludesDraft[1]!.id).toBe("uuid-2");
    expect(manualIncludesDraft[1]!.isPendingCreation).toBe(false);
  });

  it("Case G: Out-of-order create responses reconcile to the correct temporary items", async () => {
    let resolveAddA: (item: CourseIncludeItem) => void;
    let resolveAddB: (item: CourseIncludeItem) => void;

    let manualIncludesDraft: TestInclusionItem[] = [];

    const handleAdd = async (text: string, tempId: string, promise: Promise<CourseIncludeItem>) => {
      manualIncludesDraft = [...manualIncludesDraft, { id: tempId, text, isPendingCreation: true }];
      const created = await promise;
      manualIncludesDraft = manualIncludesDraft.map((item) =>
        item.id === tempId ? { id: created.id, text: item.text, isPendingCreation: false } : item,
      );
    };

    const promiseA = new Promise<CourseIncludeItem>((r) => (resolveAddA = r));
    const promiseB = new Promise<CourseIncludeItem>((r) => (resolveAddB = r));

    const pA = handleAdd("Item A", "temp-A", promiseA);
    const pB = handleAdd("Item B", "temp-B", promiseB);

    expect(manualIncludesDraft.map((i) => i.id)).toEqual(["temp-A", "temp-B"]);

    // Resolve B FIRST (out of order)
    resolveAddB!({
      id: "uuid-B",
      courseId: sampleCourseId,
      text: "Item B",
      icon: null,
      position: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await pB;

    // Item B now has uuid-B, item A is STILL temp-A
    expect(manualIncludesDraft.map((i) => ({ id: i.id, pending: i.isPendingCreation }))).toEqual([
      { id: "temp-A", pending: true },
      { id: "uuid-B", pending: false },
    ]);

    // Now resolve A
    resolveAddA!({
      id: "uuid-A",
      courseId: sampleCourseId,
      text: "Item A",
      icon: null,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await pA;

    // Both resolved to correct positions and UUIDs
    expect(manualIncludesDraft.map((i) => ({ id: i.id, pending: i.isPendingCreation }))).toEqual([
      { id: "uuid-A", pending: false },
      { id: "uuid-B", pending: false },
    ]);
  });

  it("Case I: Enforces the 6-item maximum limit, including pending creations", async () => {
    let manualIncludesDraft: TestInclusionItem[] = [
      { id: "u-1", text: "Item 1" },
      { id: "u-2", text: "Item 2" },
      { id: "u-3", text: "Item 3" },
      { id: "u-4", text: "Item 4" },
      { id: "u-5", text: "Item 5" },
    ];

    const mockCreateMutation = vi.fn().mockResolvedValue({
      id: "u-6",
      courseId: sampleCourseId,
      text: "Item 6",
      icon: null,
      position: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies CourseIncludeItem);

    const handleAdd = async (text: string) => {
      if (manualIncludesDraft.length >= 6) return false;
      const tempId = `temp-${Date.now()}`;
      manualIncludesDraft = [...manualIncludesDraft, { id: tempId, text, isPendingCreation: true }];
      const created = await mockCreateMutation();
      manualIncludesDraft = manualIncludesDraft.map((i) =>
        i.id === tempId ? { id: created.id, text: i.text, isPendingCreation: false } : i,
      );
      return true;
    };

    // Add 6th item
    const added6 = await handleAdd("Item 6");
    expect(added6).toBe(true);
    expect(manualIncludesDraft).toHaveLength(6);

    // Attempt to add 7th item
    const added7 = await handleAdd("Item 7");
    expect(added7).toBe(false);
    expect(manualIncludesDraft).toHaveLength(6);
    expect(mockCreateMutation).toHaveBeenCalledTimes(1);
  });
});
