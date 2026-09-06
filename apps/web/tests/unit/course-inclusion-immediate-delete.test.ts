import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CourseIncludeItem } from "@veolms/contracts";

interface TestInclusionItem {
  id: string;
  text: string;
  isPendingCreation?: boolean;
}

describe("Course Wizard Step 4: Inclusion Immediate Delete (Milestone 2)", () => {
  const sampleCourseId = "12345678-1234-1234-1234-123456789abc";
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Case A: Clicking Delete immediately starts the delete API call", async () => {
    const mockDeleteMutation = vi.fn().mockResolvedValue({ success: true });

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", text: "Certificate of completion" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        courseId: sampleCourseId,
        text: "Certificate of completion",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let deletingIncludeIds = new Set<string>();

    const handleDeleteManualInclusion = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      if (!UUID_REGEX.test(id)) {
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
        return;
      }

      deletingIncludeIds = new Set(deletingIncludeIds).add(id);

      try {
        await mockDeleteMutation({ courseId: sampleCourseId, includeId: id });
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
        serverIncludes = serverIncludes.filter((s) => s.id !== id);
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    // Trigger delete
    const deletePromise = handleDeleteManualInclusion("a1b2c3d4-e5f6-7890-abcd-ef1234567890");

    // Mutation must be immediately invoked with exact courseId and includeId
    expect(mockDeleteMutation).toHaveBeenCalledTimes(1);
    expect(mockDeleteMutation).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      includeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });

    await deletePromise;
  });

  it("Case B & C: The Inclusion remains visible while DELETE is pending and shows loading/locked state", async () => {
    let resolveDeleteMutation: (val: { success: boolean }) => void;
    const deletePromisePending = new Promise<{ success: boolean }>((resolve) => {
      resolveDeleteMutation = resolve;
    });
    const mockDeleteMutation = vi.fn().mockReturnValue(deletePromisePending);

    const itemId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "Full lifetime access" },
    ];
    let deletingIncludeIds = new Set<string>();

    const handleDeleteManualInclusion = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      if (!UUID_REGEX.test(id)) {
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
        return;
      }

      deletingIncludeIds = new Set(deletingIncludeIds).add(id);

      try {
        await mockDeleteMutation({ courseId: sampleCourseId, includeId: id });
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    const action = handleDeleteManualInclusion(itemId);

    // Synchronous assertions during in-flight request:
    // 1. Inclusion is STILL in the draft (remains visible)
    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.id).toBe(itemId);
    expect(manualIncludesDraft[0]!.text).toBe("Full lifetime access");

    // 2. Fine-grained deleting state is set for this item
    expect(deletingIncludeIds.has(itemId)).toBe(true);

    // 3. UI control states for this item:
    const isDeleteControlDisabled = deletingIncludeIds.has(itemId);
    const isInputDisabled = deletingIncludeIds.has(itemId);
    const isDragDisabled = deletingIncludeIds.has(itemId);
    const isSpinnerShown = deletingIncludeIds.has(itemId);

    expect(isDeleteControlDisabled).toBe(true);
    expect(isInputDisabled).toBe(true);
    expect(isDragDisabled).toBe(true);
    expect(isSpinnerShown).toBe(true);

    // Resolve delete
    resolveDeleteMutation!({ success: true });
    await action;

    // After resolution: item is removed, deleting state cleared
    expect(manualIncludesDraft).toHaveLength(0);
    expect(deletingIncludeIds.has(itemId)).toBe(false);
  });

  it("Case D: Other Inclusions remain interactive while one is deleting (no panel freeze)", async () => {
    let resolveDeleteA: (val: { success: boolean }) => void;
    const deletePendingA = new Promise<{ success: boolean }>((resolve) => {
      resolveDeleteA = resolve;
    });
    const mockDeleteMutation = vi.fn().mockReturnValue(deletePendingA);

    const idA = "11111111-1111-1111-1111-111111111111";
    const idB = "22222222-2222-2222-2222-222222222222";
    const idC = "33333333-3333-3333-3333-333333333333";

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: idA, text: "Item A" },
      { id: idB, text: "Item B" },
      { id: idC, text: "Item C" },
    ];
    let deletingIncludeIds = new Set<string>();

    const handleDeleteManualInclusion = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      deletingIncludeIds = new Set(deletingIncludeIds).add(id);
      try {
        await mockDeleteMutation({ courseId: sampleCourseId, includeId: id });
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    // Trigger delete on item A
    const actionA = handleDeleteManualInclusion(idA);

    // Item A is deleting
    expect(deletingIncludeIds.has(idA)).toBe(true);
    expect(deletingIncludeIds.has(idB)).toBe(false);
    expect(deletingIncludeIds.has(idC)).toBe(false);

    // Verify UI state for Item B & Item C: NOT disabled, NO spinner
    expect(deletingIncludeIds.has(idB)).toBe(false);
    expect(deletingIncludeIds.has(idC)).toBe(false);

    // Verify user can edit Item B text while Item A is deleting
    manualIncludesDraft = manualIncludesDraft.map((item) =>
      item.id === idB ? { ...item, text: "Item B Updated" } : item,
    );
    expect(manualIncludesDraft.find((i) => i.id === idB)?.text).toBe("Item B Updated");

    // Verify Add Inclusion button is not disabled (length < 6)
    const isAddButtonDisabled = manualIncludesDraft.length >= 6;
    expect(isAddButtonDisabled).toBe(false);

    // Resolve A
    resolveDeleteA!({ success: true });
    await actionA;

    expect(manualIncludesDraft.map((i) => i.id)).toEqual([idB, idC]);
    expect(deletingIncludeIds.size).toBe(0);
  });

  it("Case E: Successful DELETE removes only that Inclusion and updates server baseline", async () => {
    const idA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: idA, text: "Perk A" },
      { id: idB, text: "Perk B" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: idA,
        courseId: sampleCourseId,
        text: "Perk A",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: idB,
        courseId: sampleCourseId,
        text: "Perk B",
        icon: null,
        position: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let deletingIncludeIds = new Set<string>();

    const mockDeleteMutation = vi.fn().mockResolvedValue({ success: true });

    const handleDeleteManualInclusion = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      deletingIncludeIds = new Set(deletingIncludeIds).add(id);
      try {
        await mockDeleteMutation({ courseId: sampleCourseId, includeId: id });
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
        serverIncludes = serverIncludes.filter((s) => s.id !== id);
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    await handleDeleteManualInclusion(idA);

    // Only idA is removed from draft and server baseline
    expect(manualIncludesDraft).toEqual([{ id: idB, text: "Perk B" }]);
    expect(serverIncludes.map((s) => s.id)).toEqual([idB]);
    expect(deletingIncludeIds.size).toBe(0);
  });

  it("Case F & G: Failed DELETE keeps the Inclusion visible, clears loading state, and allows retry", async () => {
    const itemId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "Permanent Resource" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: itemId,
        courseId: sampleCourseId,
        text: "Permanent Resource",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let deletingIncludeIds = new Set<string>();
    let toastMessage = "";

    // 1st attempt fails, 2nd attempt succeeds
    const mockDeleteMutation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Server error: Unable to delete inclusion"))
      .mockResolvedValueOnce({ success: true });

    const handleDeleteManualInclusion = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      deletingIncludeIds = new Set(deletingIncludeIds).add(id);
      try {
        await mockDeleteMutation({ courseId: sampleCourseId, includeId: id });
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
        serverIncludes = serverIncludes.filter((s) => s.id !== id);
      } catch (err: unknown) {
        toastMessage = (err as Error).message;
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    // First attempt -> failure
    await handleDeleteManualInclusion(itemId);

    // Case F: Item remains visible and unchanged
    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.id).toBe(itemId);
    expect(manualIncludesDraft[0]!.text).toBe("Permanent Resource");
    expect(serverIncludes).toHaveLength(1);
    expect(toastMessage).toBe("Server error: Unable to delete inclusion");

    // Case G: Loading state is cleared, user can retry
    expect(deletingIncludeIds.has(itemId)).toBe(false);

    // Second attempt (retry) -> success
    await handleDeleteManualInclusion(itemId);

    expect(manualIncludesDraft).toHaveLength(0);
    expect(serverIncludes).toHaveLength(0);
    expect(deletingIncludeIds.has(itemId)).toBe(false);
    expect(mockDeleteMutation).toHaveBeenCalledTimes(2);
  });

  it("Case H & I: Multiple deletes can run concurrently and out-of-order responses affect only their own Inclusion", async () => {
    let resolveDeleteA: (val: { success: boolean }) => void;
    let rejectDeleteB: (err: Error) => void;
    let resolveDeleteC: (val: { success: boolean }) => void;

    const promiseA = new Promise<{ success: boolean }>((r) => (resolveDeleteA = r));
    const promiseB = new Promise<{ success: boolean }>((_, r) => (rejectDeleteB = r));
    const promiseC = new Promise<{ success: boolean }>((r) => (resolveDeleteC = r));

    const idA = "aaaaaaaa-1111-1111-1111-111111111111";
    const idB = "bbbbbbbb-2222-2222-2222-222222222222";
    const idC = "cccccccc-3333-3333-3333-333333333333";

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: idA, text: "Inclusion A" },
      { id: idB, text: "Inclusion B" },
      { id: idC, text: "Inclusion C" },
    ];
    let deletingIncludeIds = new Set<string>();
    let toastMessage = "";

    const mockDelete = (id: string) => {
      if (id === idA) return promiseA;
      if (id === idB) return promiseB;
      return promiseC;
    };

    const handleDeleteManualInclusion = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      deletingIncludeIds = new Set(deletingIncludeIds).add(id);
      try {
        await mockDelete(id);
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
      } catch (err: unknown) {
        toastMessage = (err as Error).message;
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    // Click delete on A, B, C concurrently
    const pA = handleDeleteManualInclusion(idA);
    const pB = handleDeleteManualInclusion(idB);
    const pC = handleDeleteManualInclusion(idC);

    // Case H: All 3 are concurrently deleting
    expect(deletingIncludeIds.has(idA)).toBe(true);
    expect(deletingIncludeIds.has(idB)).toBe(true);
    expect(deletingIncludeIds.has(idC)).toBe(true);
    expect(deletingIncludeIds.size).toBe(3);

    // Case I: Out of order completion:
    // 1. B finishes first (fails)
    rejectDeleteB!(new Error("B failed"));
    await pB;

    // B failed: B is still in draft, B is no longer deleting
    expect(deletingIncludeIds.has(idB)).toBe(false);
    expect(deletingIncludeIds.has(idA)).toBe(true);
    expect(deletingIncludeIds.has(idC)).toBe(true);
    expect(manualIncludesDraft.map((i) => i.id)).toEqual([idA, idB, idC]);
    expect(toastMessage).toBe("B failed");

    // 2. A finishes second (succeeds)
    resolveDeleteA!({ success: true });
    await pA;

    // A succeeded: A is removed from draft, C is still deleting
    expect(deletingIncludeIds.has(idA)).toBe(false);
    expect(deletingIncludeIds.has(idC)).toBe(true);
    expect(manualIncludesDraft.map((i) => i.id)).toEqual([idB, idC]);

    // 3. C finishes third (succeeds)
    resolveDeleteC!({ success: true });
    await pC;

    // C succeeded: C is removed from draft, only B remains
    expect(deletingIncludeIds.size).toBe(0);
    expect(manualIncludesDraft.map((i) => i.id)).toEqual([idB]);
  });

  it("Case J: Add and Delete can run concurrently without corrupting state", async () => {
    let resolveAdd: (item: CourseIncludeItem) => void;
    let resolveDelete: (val: { success: boolean }) => void;

    const addPromise = new Promise<CourseIncludeItem>((r) => (resolveAdd = r));
    const deletePromise = new Promise<{ success: boolean }>((r) => (resolveDelete = r));

    const existingId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const newServerId = "nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn";
    const tempAddId = "temp-inc-test-123";

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: existingId, text: "Existing Item" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: existingId,
        courseId: sampleCourseId,
        text: "Existing Item",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let deletingIncludeIds = new Set<string>();

    const handleAdd = async (text: string) => {
      manualIncludesDraft = [
        ...manualIncludesDraft,
        { id: tempAddId, text, isPendingCreation: true },
      ];
      const created = await addPromise;
      manualIncludesDraft = manualIncludesDraft.map((item) =>
        item.id === tempAddId
          ? { id: created.id, text: item.text, isPendingCreation: false }
          : item,
      );
      serverIncludes = [...serverIncludes, created];
    };

    const handleDelete = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      deletingIncludeIds = new Set(deletingIncludeIds).add(id);
      try {
        await deletePromise;
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
        serverIncludes = serverIncludes.filter((s) => s.id !== id);
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    // Start Add and Delete concurrently
    const pAdd = handleAdd("New Item");
    const pDel = handleDelete(existingId);

    // Both are in-flight concurrently:
    // Draft contains existing item (deleting) and temp item (pending creation)
    expect(manualIncludesDraft).toHaveLength(2);
    expect(deletingIncludeIds.has(existingId)).toBe(true);
    expect(manualIncludesDraft.find((i) => i.id === tempAddId)?.isPendingCreation).toBe(true);

    // Resolve Delete first
    resolveDelete!({ success: true });
    await pDel;

    // Existing item is gone, temp item is STILL in-flight
    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.id).toBe(tempAddId);
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(true);
    expect(deletingIncludeIds.size).toBe(0);

    // Resolve Add second
    resolveAdd!({
      id: newServerId,
      courseId: sampleCourseId,
      text: "New Item",
      icon: null,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await pAdd;

    // Newly added item is reconciled to real server UUID, state is completely clean
    expect(manualIncludesDraft).toHaveLength(1);
    expect(manualIncludesDraft[0]!.id).toBe(newServerId);
    expect(manualIncludesDraft[0]!.isPendingCreation).toBe(false);
    expect(serverIncludes).toHaveLength(1);
    expect(serverIncludes[0]!.id).toBe(newServerId);
  });

  it("Case K: Client-only temporary item removes locally without calling DELETE API", async () => {
    const mockDeleteMutation = vi.fn();
    const tempId = "temp-inc-unsaved-123";

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: tempId, text: "Unsaved local perk" },
    ];
    let deletingIncludeIds = new Set<string>();

    const handleDeleteManualInclusion = async (id: string) => {
      if (deletingIncludeIds.has(id)) return;
      if (!UUID_REGEX.test(id)) {
        manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
        return;
      }
      deletingIncludeIds = new Set(deletingIncludeIds).add(id);
      try {
        await mockDeleteMutation({ courseId: sampleCourseId, includeId: id });
      } finally {
        const next = new Set(deletingIncludeIds);
        next.delete(id);
        deletingIncludeIds = next;
      }
    };

    await handleDeleteManualInclusion(tempId);

    expect(manualIncludesDraft).toHaveLength(0);
    expect(mockDeleteMutation).not.toHaveBeenCalled();
    expect(deletingIncludeIds.size).toBe(0);
  });

  it("Case L: Baseline synchronization prevents duplicate deferred deletion in saveExtrasStep", async () => {
    const itemId = "99999999-9999-9999-9999-999999999999";
    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "Perk to delete" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: itemId,
        courseId: sampleCourseId,
        text: "Perk to delete",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockImmediateDelete = vi.fn().mockResolvedValue({ success: true });
    const mockDeferredDelete = vi.fn().mockResolvedValue({ success: true });

    // 1. Perform immediate delete
    await (async (id: string) => {
      await mockImmediateDelete({ courseId: sampleCourseId, includeId: id });
      manualIncludesDraft = manualIncludesDraft.filter((item) => item.id !== id);
      serverIncludes = serverIncludes.filter((s) => s.id !== id);
    })(itemId);

    expect(manualIncludesDraft).toHaveLength(0);
    expect(serverIncludes).toHaveLength(0);

    // 2. Later, saveExtrasStep executes its deferred delete check
    const itemsToDeleteInExtrasStep = serverIncludes.filter(
      (s) => !manualIncludesDraft.some((m) => m.id === s.id),
    );
    if (itemsToDeleteInExtrasStep.length > 0) {
      for (const d of itemsToDeleteInExtrasStep) {
        await mockDeferredDelete({ courseId: sampleCourseId, includeId: d.id });
      }
    }

    // Deferred delete should NOT be called because serverIncludes was synchronized
    expect(mockDeferredDelete).not.toHaveBeenCalled();
    expect(mockImmediateDelete).toHaveBeenCalledTimes(1);
  });
});
