import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAutosyncDraftKey,
  getAutosyncMutationScopeKey,
  getDirtyAutosyncDrafts,
  useAutosync,
} from "../../src/lib/autosync";
import { markAutosyncDraftDirty } from "../../src/lib/autosync/registry";

interface DraftValue {
  title: string;
}

const key = {
  entity: "course",
  entityId: "course-123",
  scope: "basics",
} as const;

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

afterEach(() => {
  window.localStorage.clear();
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

describe("universal autosync", () => {
  it("persists edits immediately and restores them after an editor remounts", async () => {
    const queryClient = createQueryClient();
    const sync = vi.fn(async (value: DraftValue) => value);
    const first = renderHook(
      () =>
        useAutosync({
          key,
          initialValue: { title: "Server title" },
          sync,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => first.result.current.update({ title: "Crash-safe draft" }));

    const draftKey = getAutosyncDraftKey(key);
    expect(window.localStorage.getItem(draftKey)).toContain("Crash-safe draft");
    expect(getDirtyAutosyncDrafts()).toEqual([
      expect.objectContaining({ key }),
    ]);
    first.unmount();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const restored = renderHook(
      () =>
        useAutosync({
          key,
          initialValue: { title: "Server title" },
          sync,
        }),
      { wrapper: createWrapper(createQueryClient()) },
    );

    await waitFor(() =>
      expect(restored.result.current.value.title).toBe("Crash-safe draft"),
    );
    expect(restored.result.current.isDirty).toBe(true);
    restored.unmount();
  });

  it("debounces normal edits and flushes at the five-second maximum", async () => {
    vi.useFakeTimers();
    const queryClient = createQueryClient();
    const sync = vi.fn(async (value: DraftValue) => value);
    const { result, unmount } = renderHook(
      () =>
        useAutosync({
          key,
          initialValue: { title: "" },
          sync,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.update({ title: "A" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(sync).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(sync).toHaveBeenCalledTimes(1);

    sync.mockClear();
    for (const title of ["A1", "A2", "A3", "A4", "A5"]) {
      act(() => result.current.update({ title }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenLastCalledWith({ title: "A5" }, expect.anything());
    unmount();
  });

  it("lets TanStack pause an offline mutation and resumes it when connectivity returns", async () => {
    vi.useFakeTimers();
    const onlineSpy = vi
      .spyOn(navigator, "onLine", "get")
      .mockReturnValue(false);
    const queryClient = createQueryClient();
    const sync = vi.fn(async (value: DraftValue) => value);
    const { result, unmount } = renderHook(
      () =>
        useAutosync({
          key,
          initialValue: { title: "" },
          sync,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.update({ title: "Offline title" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const pausedMutation = queryClient
      .getMutationCache()
      .getAll()
      .find((mutation) => mutation.state.isPaused);
    expect(pausedMutation?.state.isPaused).toBe(true);
    expect(sync).not.toHaveBeenCalled();

    onlineSpy.mockReturnValue(true);
    act(() => onlineManager.setOnline(true));
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledWith(
      { title: "Offline title" },
      expect.anything(),
    );
    expect(result.current.status).toBe("saved");
    unmount();
  });

  it("keeps requests ordered within one entity scope", async () => {
    const queryClient = createQueryClient();
    const firstRequest = Promise.withResolvers<DraftValue>();
    const sync = vi
      .fn()
      .mockImplementationOnce(async () => firstRequest.promise)
      .mockImplementation(async (value: DraftValue) => value);
    const { result, unmount } = renderHook(
      () =>
        useAutosync({
          key,
          initialValue: { title: "" },
          debounceMs: 0,
          sync,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.update({ title: "H" }));
    await waitFor(() =>
      expect(sync).toHaveBeenCalledWith({ title: "H" }, expect.anything()),
    );
    act(() => result.current.update({ title: "Hello World" }));
    expect(sync).toHaveBeenCalledTimes(1);

    firstRequest.resolve({ title: "H" });
    await waitFor(() =>
      expect(sync).toHaveBeenCalledWith(
        { title: "Hello World" },
        expect.anything(),
      ),
    );
    expect(getAutosyncMutationScopeKey(key)).toBe(
      "veolms:autosync:mutation:course%3Acourse-123%3Abasics",
    );
    unmount();
  });

  it("uses TanStack retry and backoff for transient failures", async () => {
    vi.useFakeTimers();
    const queryClient = createQueryClient();
    const sync = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValue({ title: "Retried title" });
    const { result, unmount } = renderHook(
      () =>
        useAutosync({
          key,
          initialValue: { title: "" },
          sync,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.update({ title: "Retried title" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();
    });
    expect(sync).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe("saved");
    unmount();
  });
});
