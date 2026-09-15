import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateOptimisticEditInCaches,
} from "../../src/services/learning-interactions/edit-cache-updaters";
import {
  optimisticEditCoordinator,
  type OptimisticEditFields,
} from "../../src/services/learning-interactions/optimistic-edit-coordinator";
import {
  projectNoteLocalState,
  projectReplyLocalState,
  projectThreadLocalState,
} from "../../src/services/learning-interactions/learning-interactions.queries";
import { learningInteractionKeys } from "../../src/services/learning-interactions/learning-interactions.keys";
import { authStore } from "../../src/store/auth.store";
import { useUpdateThread } from "../../src/services/learning-interactions/learning-interactions.mutations";
import { learningInteractionsService } from "../../src/services/learning-interactions/learning-interactions.service";

const baseline: OptimisticEditFields = {
  content: "Original content",
  plainText: "Original content",
  visibility: "public",
};

function begin(kind: "thread" | "reply" | "note", clientId: string) {
  return optimisticEditCoordinator.begin({
    kind,
    clientId,
    serverId: `${kind}-server-${clientId.split("-").pop()}`,
    baseline,
    optimistic: {
      content: "Optimistic content",
      plainText: "Optimistic content",
      visibility: "unlisted",
    },
  });
}

describe("simple optimistic edit lifecycle", () => {
  beforeEach(() => {
    optimisticEditCoordinator.reset();
  });

  it("guards each entity independently and keeps a confirmed response authoritative", () => {
    expect(begin("thread", "thread-client-1")).toBeDefined();
    expect(begin("thread", "thread-client-1")).toBeUndefined();
    expect(begin("thread", "thread-client-2")).toBeDefined();

    optimisticEditCoordinator.confirm("thread", "thread-client-1", {
      content: "Server content",
      plainText: "Server content",
      visibility: "public",
    });

    const projected = projectThreadLocalState({
      id: "thread-client-1",
      clientId: "thread-client-1",
      serverId: "thread-server-1",
      creationStatus: "confirmed",
      content: "Stale GET content",
      plainText: "Stale GET content",
      visibility: "public",
    } as any);

    expect(projected.id).toBe("thread-client-1");
    expect(projected.content).toBe("Server content");
    expect(projected.visibility).toBe("public");

    projectThreadLocalState({
      id: "thread-server-1",
      content: "Server content",
      plainText: "Server content",
      visibility: "public",
    } as any);
    expect(
      optimisticEditCoordinator.get("thread", "thread-client-1"),
    ).toBeUndefined();
    expect(
      projectThreadLocalState({
        id: "thread-server-1",
        content: "A later server value",
        plainText: "A later server value",
        visibility: "public",
      } as any).content,
    ).toBe("A later server value");
  });

  it("projects in-flight edits over stale thread, reply, and note reads", () => {
    begin("thread", "thread-client-1");
    begin("reply", "reply-client-1");
    begin("note", "note-client-1");

    expect(
      projectThreadLocalState({
        id: "thread-server-1",
        content: "Stale",
        plainText: "Stale",
        visibility: "public",
      } as any),
    ).toMatchObject({ id: "thread-client-1", content: "Optimistic content" });
    expect(
      projectReplyLocalState(
        {
          id: "reply-server-1",
          threadId: "thread-server-1",
          content: "Stale",
          plainText: "Stale",
        } as any,
        "thread-server-1",
      ),
    ).toMatchObject({ id: "reply-client-1", content: "Optimistic content" });
    expect(
      projectNoteLocalState({
        id: "note-server-1",
        content: "Stale",
        plainText: "Stale",
        visibility: "public",
      } as any),
    ).toMatchObject({ id: "note-client-1", content: "Optimistic content" });
  });

  it("patches only edit fields and restores only those fields on failure", () => {
    const queryClient = new QueryClient();
    const key = learningInteractionKeys.threadDetails("thread-server-1");
    queryClient.setQueryData(key, {
      id: "thread-client-1",
      clientId: "thread-client-1",
      serverId: "thread-server-1",
      creationStatus: "confirmed",
      content: "Original content",
      plainText: "Original content",
      visibility: "public",
      isLiked: true,
      likesCount: 4,
      isBookmarked: true,
      isFollowing: true,
      isLocked: true,
      attachments: [{ id: "attachment-1" }],
    });

    begin("thread", "thread-client-1");
    updateOptimisticEditInCaches(
      queryClient,
      "thread",
      "thread-client-1",
      "thread-server-1",
      { content: "Optimistic content", plainText: "Optimistic content", visibility: "unlisted" },
    );
    expect(queryClient.getQueryData<any>(key)).toMatchObject({
      content: "Optimistic content",
      visibility: "unlisted",
      isLiked: true,
      isBookmarked: true,
      isFollowing: true,
      isLocked: true,
    });

    optimisticEditCoordinator.fail("thread", "thread-client-1");
    updateOptimisticEditInCaches(
      queryClient,
      "thread",
      "thread-client-1",
      "thread-server-1",
      baseline,
    );
    expect(queryClient.getQueryData<any>(key)).toMatchObject({
      content: "Original content",
      visibility: "public",
      isLiked: true,
      attachments: [{ id: "attachment-1" }],
    });
  });

  it("does not expose a client identity as the transport identity", () => {
    const record = begin("note", "client-note-1");
    expect(record?.clientId).toBe("client-note-1");
    expect(record?.serverId).toBe("note-server-1");
    expect(record?.serverId).not.toBe(record?.clientId);
  });

  it("runs the real update mutation with server identity and reconciles its response", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const key = learningInteractionKeys.threadDetails("thread-server-1");
    queryClient.setQueryData(key, {
      id: "thread-client-1",
      clientId: "thread-client-1",
      serverId: "thread-server-1",
      creationStatus: "confirmed",
      content: "Original content",
      plainText: "Original content",
      visibility: "public",
      isLiked: true,
    });
    const updateThread = vi
      .spyOn(learningInteractionsService, "updateThread")
      .mockResolvedValue({
        id: "thread-server-1",
        content: "Authoritative content",
        plainText: "Authoritative content",
        visibility: "unlisted",
      } as any);
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useUpdateThread(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        threadId: "thread-server-1",
        payload: { content: "Optimistic content", visibility: "unlisted" },
        __optimistic: {
          clientId: "thread-client-1",
          serverId: "thread-server-1",
          baseline,
          optimistic: {
            content: "Optimistic content",
            plainText: "Optimistic content",
            visibility: "unlisted",
          },
        },
      });
    });

    expect(updateThread).toHaveBeenCalledWith(
      "thread-server-1",
      { content: "Optimistic content", visibility: "unlisted" },
    );
    expect(updateThread).not.toHaveBeenCalledWith(
      "thread-client-1",
      expect.anything(),
    );
    expect(queryClient.getQueryData<any>(key)).toMatchObject({
      id: "thread-client-1",
      content: "Authoritative content",
      visibility: "unlisted",
      isLiked: true,
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
    updateThread.mockRestore();
  });

  it("drops late edit state when the auth write generation changes", () => {
    begin("thread", "thread-client-1");
    authStore.clearAuth();

    expect(
      optimisticEditCoordinator.get("thread", "thread-client-1"),
    ).toBeUndefined();
  });
});
