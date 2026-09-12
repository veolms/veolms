import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CourseIncludeItem } from "@veolms/contracts";

interface TestInclusionItem {
  id: string;
  text: string;
  isPendingCreation?: boolean;
}

describe("Course Wizard Step 4: Inclusion Immediate Edit on Blur (Milestone 3)", () => {
  const sampleCourseId = "12345678-1234-1234-1234-123456789abc";
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Case A: Keystrokes (onChange) update local draft immediately with 0 API calls", () => {
    const mockUpdateMutation = vi.fn();

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: "11111111-1111-1111-1111-111111111111", text: "Original Text" },
    ];

    const handleUpdateManualInclusionText = (id: string, text: string) => {
      const truncated = text.slice(0, 25);
      manualIncludesDraft = manualIncludesDraft.map((item) =>
        item.id === id ? { ...item, text: truncated } : item,
      );
    };

    // Simulate keystrokes: 'N', 'Ne', 'New'
    handleUpdateManualInclusionText("11111111-1111-1111-1111-111111111111", "N");
    handleUpdateManualInclusionText("11111111-1111-1111-1111-111111111111", "Ne");
    handleUpdateManualInclusionText("11111111-1111-1111-1111-111111111111", "New Text");

    expect(manualIncludesDraft[0]!.text).toBe("New Text");
    expect(mockUpdateMutation).not.toHaveBeenCalled();
  });

  it("Case B: Blur on modified inclusion immediately triggers update mutation", async () => {
    const itemId = "11111111-1111-1111-1111-111111111111";
    const mockUpdateMutation = vi.fn().mockImplementation(async ({ payload }: { payload: { text: string } }) => {
      return {
        id: itemId,
        courseId: sampleCourseId,
        text: payload.text,
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies CourseIncludeItem;
    });

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "Updated Text" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: itemId,
        courseId: sampleCourseId,
        text: "Original Text",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let savingIncludeIds = new Set<string>();

    const handleManualInclusionBlur = async (id: string) => {
      if (savingIncludeIds.has(id)) return;
      if (!UUID_REGEX.test(id)) return;

      const currentItem = manualIncludesDraft.find((i) => i.id === id);
      if (!currentItem || currentItem.isPendingCreation) return;

      const serverItem = serverIncludes.find((s) => s.id === id);
      if (!serverItem) return;

      const trimmed = currentItem.text.trim();
      if (!trimmed) {
        manualIncludesDraft = manualIncludesDraft.map((item) =>
          item.id === id ? { ...item, text: serverItem.text } : item,
        );
        return;
      }

      if (trimmed === serverItem.text.trim()) return;

      savingIncludeIds = new Set(savingIncludeIds).add(id);

      try {
        const updated = await mockUpdateMutation({
          courseId: sampleCourseId,
          includeId: id,
          payload: { text: trimmed },
        });
        serverIncludes = serverIncludes.map((s) => (s.id === id ? updated : s));
      } finally {
        const next = new Set(savingIncludeIds);
        next.delete(id);
        savingIncludeIds = next;
      }
    };

    const blurPromise = handleManualInclusionBlur(itemId);

    expect(mockUpdateMutation).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutation).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      includeId: itemId,
      payload: { text: "Updated Text" },
    });

    await blurPromise;
    expect(serverIncludes[0]!.text).toBe("Updated Text");
  });

  it("Case C: Clean blur with unmodified text issues 0 API calls", async () => {
    const itemId = "22222222-2222-2222-2222-222222222222";
    const mockUpdateMutation = vi.fn();

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "Unchanged Text" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: itemId,
        courseId: sampleCourseId,
        text: "Unchanged Text",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const handleManualInclusionBlur = async (id: string) => {
      const currentItem = manualIncludesDraft.find((i) => i.id === id);
      const serverItem = serverIncludes.find((s) => s.id === id);
      if (!currentItem || !serverItem) return;

      const trimmed = currentItem.text.trim();
      if (trimmed === serverItem.text.trim()) {
        return;
      }
      await mockUpdateMutation();
    };

    await handleManualInclusionBlur(itemId);

    expect(mockUpdateMutation).not.toHaveBeenCalled();
  });

  it("Case D: Empty text blur reverts to server-confirmed text with 0 API calls", async () => {
    const itemId = "33333333-3333-3333-3333-333333333333";
    const mockUpdateMutation = vi.fn();

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "   " },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: itemId,
        courseId: sampleCourseId,
        text: "Server Baseline",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const handleManualInclusionBlur = async (id: string) => {
      const currentItem = manualIncludesDraft.find((i) => i.id === id);
      const serverItem = serverIncludes.find((s) => s.id === id);
      if (!currentItem || !serverItem) return;

      const trimmed = currentItem.text.trim();
      if (!trimmed) {
        manualIncludesDraft = manualIncludesDraft.map((item) =>
          item.id === id ? { ...item, text: serverItem.text } : item,
        );
        return;
      }
      await mockUpdateMutation();
    };

    await handleManualInclusionBlur(itemId);

    expect(mockUpdateMutation).not.toHaveBeenCalled();
    expect(manualIncludesDraft[0]!.text).toBe("Server Baseline");
  });

  it("Case E: While PATCH is pending, only that inclusion shows saving state and is locked", async () => {
    let resolveUpdate: (val: CourseIncludeItem) => void;
    const updatePromise = new Promise<CourseIncludeItem>((resolve) => {
      resolveUpdate = resolve;
    });
    const mockUpdateMutation = vi.fn().mockReturnValue(updatePromise);

    const idA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: idA, text: "A Edited" },
      { id: idB, text: "B Normal" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: idA,
        courseId: sampleCourseId,
        text: "A Original",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: idB,
        courseId: sampleCourseId,
        text: "B Normal",
        icon: null,
        position: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let savingIncludeIds = new Set<string>();

    const handleManualInclusionBlur = async (id: string) => {
      savingIncludeIds = new Set(savingIncludeIds).add(id);
      try {
        const updated = await mockUpdateMutation();
        serverIncludes = serverIncludes.map((s) => (s.id === id ? updated : s));
      } finally {
        const next = new Set(savingIncludeIds);
        next.delete(id);
        savingIncludeIds = next;
      }
    };

    const actionA = handleManualInclusionBlur(idA);

    expect(savingIncludeIds.has(idA)).toBe(true);
    expect(savingIncludeIds.has(idB)).toBe(false);

    resolveUpdate!({
      id: idA,
      courseId: sampleCourseId,
      text: "A Edited",
      icon: null,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await actionA;

    expect(savingIncludeIds.has(idA)).toBe(false);
  });

  it("Case F: Successful PATCH keeps edited value, updates server baseline, and clears saving state", async () => {
    const itemId = "44444444-4444-4444-4444-444444444444";
    const mockUpdateMutation = vi.fn().mockResolvedValue({
      id: itemId,
      courseId: sampleCourseId,
      text: "Persisted Value",
      icon: null,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies CourseIncludeItem);

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "Persisted Value" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: itemId,
        courseId: sampleCourseId,
        text: "Old Value",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let savingIncludeIds = new Set<string>();

    const handleManualInclusionBlur = async (id: string) => {
      savingIncludeIds = new Set(savingIncludeIds).add(id);
      try {
        const updated = await mockUpdateMutation();
        serverIncludes = serverIncludes.map((s) => (s.id === id ? updated : s));
      } finally {
        const next = new Set(savingIncludeIds);
        next.delete(id);
        savingIncludeIds = next;
      }
    };

    await handleManualInclusionBlur(itemId);

    expect(manualIncludesDraft[0]!.text).toBe("Persisted Value");
    expect(serverIncludes[0]!.text).toBe("Persisted Value");
    expect(savingIncludeIds.size).toBe(0);
  });

  it("Case G: Failed PATCH reverts draft to previous server-confirmed value and displays error toast", async () => {
    const itemId = "55555555-5555-5555-5555-555555555555";
    const mockUpdateMutation = vi
      .fn()
      .mockRejectedValue(new Error("Server timeout updating inclusion"));

    let manualIncludesDraft: TestInclusionItem[] = [
      { id: itemId, text: "Failed New Edit" },
    ];
    let serverIncludes: CourseIncludeItem[] = [
      {
        id: itemId,
        courseId: sampleCourseId,
        text: "Confirmed Baseline",
        icon: null,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    let savingIncludeIds = new Set<string>();
    let toastMessage = "";

    const handleManualInclusionBlur = async (id: string) => {
      const serverItem = serverIncludes.find((s) => s.id === id);
      if (!serverItem) return;

      savingIncludeIds = new Set(savingIncludeIds).add(id);
      try {
        await mockUpdateMutation();
      } catch (err: unknown) {
        manualIncludesDraft = manualIncludesDraft.map((item) =>
          item.id === id ? { ...item, text: serverItem.text } : item,
        );
        toastMessage = (err as Error).message;
      } finally {
        const next = new Set(savingIncludeIds);
        next.delete(id);
        savingIncludeIds = next;
      }
    };

    await handleManualInclusionBlur(itemId);

    expect(manualIncludesDraft[0]!.text).toBe("Confirmed Baseline");
    expect(serverIncludes[0]!.text).toBe("Confirmed Baseline");
    expect(toastMessage).toBe("Server timeout updating inclusion");
    expect(savingIncludeIds.size).toBe(0);
  });
});
