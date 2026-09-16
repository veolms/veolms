import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OptimisticDeletionCoordinator,
  type OptimisticDeletionKind,
} from "../../src/services/learning-interactions/optimistic-deletion-coordinator";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("OptimisticDeletionCoordinator", () => {
  let coordinator: OptimisticDeletionCoordinator;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    coordinator = new OptimisticDeletionCoordinator();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    coordinator.reset();
    queryClient.clear();
    vi.useRealTimers();
  });

  function begin(
    kind: OptimisticDeletionKind,
    clientId: string,
    serverId: string,
    commit: () => Promise<unknown> = vi.fn(async () => undefined),
  ) {
    coordinator.begin({
      kind,
      clientId,
      serverId,
      commit,
      queryClient,
    });
    return commit;
  }

  it("keeps an entity tombstoned while its DELETE is pending, then finalizes without restoring it", async () => {
    const request = deferred();
    const commit = vi.fn(() => request.promise);
    begin("thread", "client-thread-a", "server-thread-a", commit);

    expect(coordinator.get("thread", "client-thread-a")?.phase).toBe(
      "undoable",
    );
    await vi.advanceTimersByTimeAsync(9_999);
    expect(commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(coordinator.get("thread", "client-thread-a")?.phase).toBe(
      "deleting",
    );
    expect(
      coordinator.isTombstoned("thread", {
        id: "server-thread-a",
        clientId: "server-thread-a",
        serverId: "server-thread-a",
      }),
    ).toBe(true);

    request.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(coordinator.get("thread", "client-thread-a")?.phase).toBe("deleted");
    expect(
      coordinator.isTombstoned("thread", {
        id: "server-thread-a",
        clientId: "server-thread-a",
        serverId: "server-thread-a",
      }),
    ).toBe(true);
  });

  it("undoes before transport and restores without issuing DELETE", async () => {
    const commit = begin("note", "client-note-a", "server-note-a");

    expect(coordinator.undo("note", "client-note-a")).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(commit).not.toHaveBeenCalled();
    expect(coordinator.get("note", "client-note-a")).toBeUndefined();
  });

  it("restores only the failed entity and reports its failure", async () => {
    const failed = deferred();
    const onFailure = vi.fn();
    coordinator.begin({
      kind: "reply",
      clientId: "client-reply-a",
      serverId: "server-reply-a",
      parentClientId: "client-thread-a",
      parentServerId: "server-thread-a",
      parentRepliesCount: 5,
      commit: () => failed.promise,
      onFailure,
      queryClient,
    });
    begin("note", "client-note-a", "server-note-a");

    await vi.advanceTimersByTimeAsync(10_000);
    failed.reject(new Error("network"));
    await Promise.resolve();
    await Promise.resolve();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(coordinator.get("reply", "client-reply-a")).toBeUndefined();
    expect(coordinator.get("note", "client-note-a")?.phase).toBe("deleted");
  });

  it("uses one client-keyed transaction when duplicate surfaces request deletion", async () => {
    const firstCommit = vi.fn(async () => undefined);
    const secondCommit = vi.fn(async () => undefined);
    coordinator.begin({
      kind: "reply",
      clientId: "client-reply-a",
      serverId: "server-reply-a",
      commit: firstCommit,
      queryClient,
    });
    coordinator.begin({
      kind: "reply",
      clientId: "client-reply-a",
      serverId: "server-reply-a",
      commit: secondCommit,
      queryClient,
    });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(firstCommit).toHaveBeenCalledTimes(1);
    expect(secondCommit).not.toHaveBeenCalled();
  });

  it("keeps stale cache data hidden after DELETE success", async () => {
    queryClient.setQueryData(
      learningInteractionKeys.notes({ courseId: "course", lessonId: "lesson" }),
      {
        notes: [
          {
            id: "server-note-a",
            clientId: "client-note-a",
            serverId: "server-note-a",
          },
        ],
        nextCursor: null,
        totalCount: 1,
      },
    );
    begin("note", "client-note-a", "server-note-a");
    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();

    // Simulates an older GET settling after the targeted success cleanup.
    queryClient.setQueryData(
      learningInteractionKeys.notes({ courseId: "course", lessonId: "lesson" }),
      {
        notes: [{ id: "server-note-a" }],
        nextCursor: null,
        totalCount: 1,
      },
    );

    expect(coordinator.isTombstoned("note", { id: "server-note-a" })).toBe(
      true,
    );
  });

  it("projects an accepted reply deletion as unsolved with the visible reply count", () => {
    begin("reply", "client-reply-a", "server-reply-a");
    // Attach the parent details as the real reply handlers do.
    coordinator.reset();
    coordinator.begin({
      kind: "reply",
      clientId: "client-reply-a",
      serverId: "server-reply-a",
      parentClientId: "client-thread-a",
      parentServerId: "server-thread-a",
      parentRepliesCount: 5,
      commit: async () => undefined,
      queryClient,
    });

    expect(
      coordinator.projectThreadReplyState({
        id: "client-thread-a",
        clientId: "client-thread-a",
        serverId: "server-thread-a",
        repliesCount: 5,
        acceptedAnswerId: "server-reply-a",
      }),
    ).toEqual({ repliesCount: 4, acceptedAnswerId: null });

    coordinator.undo("reply", "client-reply-a");
    expect(
      coordinator.projectThreadReplyState({
        id: "client-thread-a",
        clientId: "client-thread-a",
        serverId: "server-thread-a",
        repliesCount: 5,
        acceptedAnswerId: "server-reply-a",
      }),
    ).toBeUndefined();
  });

  it("recognizes an undoable reply for its stable parent identity", () => {
    coordinator.begin({
      kind: "reply",
      clientId: "client-reply-a",
      serverId: "server-reply-a",
      parentClientId: "client-thread-a",
      parentServerId: "server-thread-a",
      commit: async () => undefined,
      queryClient,
    });

    expect(
      coordinator.hasUndoableReplyForParent(
        "client-thread-a",
        "server-thread-a",
      ),
    ).toBe(true);
    expect(
      coordinator.hasUndoableReplyForParent("other-thread", "server-thread-a"),
    ).toBe(true);
    expect(
      coordinator.hasUndoableReplyForParent("other-thread", "other-server"),
    ).toBe(false);
  });

  it("cancels timers on reset so an unmounted or prior-account transaction cannot dispatch", async () => {
    const commit = begin("thread", "client-thread-a", "server-thread-a");
    coordinator.reset();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(coordinator.get("thread", "client-thread-a")).toBeUndefined();
  });
});
