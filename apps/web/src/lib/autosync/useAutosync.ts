import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  onlineManager,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getAutosyncDraftKey, getAutosyncMutationKey } from "./keys";
import { getAutosyncOnlineState, autosyncManager } from "./manager";
import { markAutosyncDraftClean, markAutosyncDraftDirty } from "./registry";
import {
  readAutosyncDraft,
  readAutosyncDraftSync,
  removeAutosyncDraft,
  saveAutosyncDraft,
} from "./storage";
import { getAutosyncMutationOptions } from "./tanstack";
import type {
  AutosyncOptions,
  AutosyncResult,
  AutosyncStatus,
  AutosyncSyncContext,
  AutosyncUpdater,
} from "./types";

const defaultEqual = <TValue>(left: TValue, right: TValue) => {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const browserIsOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const toErrorMessage = (error: unknown) => {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "We couldn't sync this change yet.";
};

export function useAutosync<TValue, TServerValue = TValue>({
  key,
  initialValue,
  sync,
  enabled = true,
  debounceMs = 1_000,
  maxWaitMs = 5_000,
  isEqual = defaultEqual,
  validate,
  onSynced,
}: AutosyncOptions<TValue, TServerValue>): AutosyncResult<TValue> {
  const queryClient = useQueryClient();
  const draftKey = useMemo(
    () => getAutosyncDraftKey(key),
    [key.entity, key.entityId, key.scope],
  );
  const mutationKey = useMemo(
    () => getAutosyncMutationKey(key),
    [key.entity, key.entityId, key.scope],
  );
  const keyRef = useRef(key);
  const syncRef = useRef(sync);
  const equalRef = useRef(isEqual);
  const validateRef = useRef(validate);
  const onSyncedRef = useRef(onSynced);
  keyRef.current = key;
  syncRef.current = sync;
  equalRef.current = isEqual;
  validateRef.current = validate;
  onSyncedRef.current = onSynced;

  const [value, setValue] = useState(initialValue);
  const [baseline, setBaseline] = useState(initialValue);
  const [status, setStatus] = useState<AutosyncStatus>("idle");
  const [error, setError] = useState("");
  const [isRestoring, setIsRestoring] = useState(enabled);

  const valueRef = useRef(value);
  const baselineRef = useRef(baseline);
  const valueVersionRef = useRef(0);
  const requestRef = useRef<Promise<void> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedKeyRef = useRef<string | null>(null);
  const initialValueRef = useRef(initialValue);
  const initializedEnabledRef = useRef(enabled);
  const loadedKeyRef = useRef<string | null>(null);
  const restoreGenerationRef = useRef(0);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const scheduleRef = useRef<(delay?: number) => void>(() => undefined);
  const enabledRef = useRef(enabled);
  const statusRef = useRef(status);
  enabledRef.current = enabled;
  statusRef.current = status;
  valueRef.current = value;
  baselineRef.current = baseline;

  const mutation = useMutation(
    getAutosyncMutationOptions<TServerValue, TValue>(key, async (draft) => {
      const context: AutosyncSyncContext<TValue> = {
        key: keyRef.current,
        previousValue: baselineRef.current,
      };
      return syncRef.current(draft, context);
    }),
  );

  const clearTimers = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current !== null) {
      clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, []);

  const setValueInternally = useCallback((nextValue: TValue) => {
    valueVersionRef.current += 1;
    valueRef.current = nextValue;
    setValue(nextValue);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    clearTimers();
    if (!enabledRef.current) return;

    const online = browserIsOnline();
    onlineManager.setOnline(online);
    const isOffline = !online || !getAutosyncOnlineState();

    const draft = valueRef.current;
    const previousValue = baselineRef.current;
    if (equalRef.current(draft, previousValue)) {
      removeAutosyncDraft(keyRef.current);
      markAutosyncDraftClean(keyRef.current);
      setError("");
      setStatus("saved");
      return;
    }

    const context = { key: keyRef.current, previousValue };
    const validation = validateRef.current?.(draft, context);
    if (
      validation === false ||
      (typeof validation === "object" && !validation.valid)
    ) {
      const message =
        typeof validation === "object" && validation.message
          ? validation.message
          : "Complete the required fields before syncing this draft.";
      setError(message);
      setStatus("blocked");
      return;
    }

    const inFlight = requestRef.current;
    if (inFlight) {
      if (isOffline) return;
      await inFlight;
      if (!equalRef.current(valueRef.current, baselineRef.current)) {
        await flushRef.current();
      }
      return;
    }

    const submittedValue = draft;
    setError("");
    setStatus(isOffline ? "offline" : "syncing");
    const request = mutation
      .mutateAsync(submittedValue)
      .then((serverValue) => {
        const nextBaseline =
          onSyncedRef.current?.(serverValue, submittedValue) ?? submittedValue;
        baselineRef.current = nextBaseline;
        setBaseline(nextBaseline);

        if (equalRef.current(valueRef.current, submittedValue)) {
          setValueInternally(nextBaseline);
          removeAutosyncDraft(keyRef.current);
          markAutosyncDraftClean(keyRef.current);
          setStatus("saved");
        } else {
          markAutosyncDraftDirty(keyRef.current);
          setStatus("pending");
          scheduleRef.current(0);
        }
      })
      .catch((requestError: unknown) => {
        const onlineNow = browserIsOnline();
        if (!onlineNow) {
          onlineManager.setOnline(false);
          setStatus("offline");
        } else {
          setStatus("error");
        }
        setError(toErrorMessage(requestError));
        throw requestError;
      })
      .finally(() => {
        if (requestRef.current === request) requestRef.current = null;
      });

    requestRef.current = request;
    if (isOffline) {
      // The mutation is intentionally paused by TanStack Query. Attach a
      // rejection handler here because no caller is awaiting a flush while
      // the browser is offline; reconnect handling will observe the same
      // request through requestRef.
      void request.catch(() => undefined);
      return;
    }
    await request;
  }, [clearTimers, mutation, setValueInternally]);

  flushRef.current = flush;

  const schedule = useCallback(
    (delay = debounceMs) => {
      if (
        !enabledRef.current ||
        equalRef.current(valueRef.current, baselineRef.current)
      ) {
        return;
      }

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void flushRef.current().catch(() => undefined);
      }, delay);

      if (maxWaitTimerRef.current === null) {
        maxWaitTimerRef.current = setTimeout(() => {
          maxWaitTimerRef.current = null;
          void flushRef.current().catch(() => undefined);
        }, maxWaitMs);
      }
    },
    [debounceMs, maxWaitMs],
  );

  scheduleRef.current = schedule;

  const update = useCallback(
    (nextUpdate: AutosyncUpdater<TValue>) => {
      if (!enabledRef.current) return;
      const currentValue = valueRef.current;
      const nextValue =
        typeof nextUpdate === "function"
          ? nextUpdate(currentValue)
          : typeof currentValue === "object" && currentValue !== null
            ? ({ ...currentValue, ...nextUpdate } as TValue)
            : (nextUpdate as TValue);

      setValueInternally(nextValue);
      setError("");
      if (equalRef.current(nextValue, baselineRef.current)) {
        clearTimers();
        removeAutosyncDraft(keyRef.current);
        markAutosyncDraftClean(keyRef.current);
        setStatus("saved");
        return;
      }

      saveAutosyncDraft(keyRef.current, nextValue);
      markAutosyncDraftDirty(keyRef.current);
      setStatus(browserIsOnline() ? "pending" : "offline");
      scheduleRef.current();
    },
    [clearTimers, setValueInternally],
  );

  const replaceFromServer = useCallback(
    (nextValue: TValue) => {
      clearTimers();
      baselineRef.current = nextValue;
      setBaseline(nextValue);
      setValueInternally(nextValue);
      removeAutosyncDraft(keyRef.current);
      markAutosyncDraftClean(keyRef.current);
      setError("");
      setStatus("saved");
    },
    [clearTimers, setValueInternally],
  );

  const mergeFromServer = useCallback(
    (serverPatch: Partial<TValue>) => {
      if (
        typeof baselineRef.current !== "object" ||
        baselineRef.current === null
      ) {
        return;
      }
      const nextBaseline = {
        ...baselineRef.current,
        ...serverPatch,
      } as TValue;
      const nextValue = {
        ...valueRef.current,
        ...serverPatch,
      } as TValue;
      baselineRef.current = nextBaseline;
      setBaseline(nextBaseline);
      setValueInternally(nextValue);
      if (equalRef.current(nextValue, nextBaseline)) {
        removeAutosyncDraft(keyRef.current);
        markAutosyncDraftClean(keyRef.current);
        setStatus("saved");
        return;
      }
      saveAutosyncDraft(keyRef.current, nextValue);
      markAutosyncDraftDirty(keyRef.current);
      setStatus(browserIsOnline() ? "pending" : "offline");
      scheduleRef.current(0);
    },
    [setValueInternally],
  );

  const discard = useCallback(
    () => replaceFromServer(baselineRef.current),
    [replaceFromServer],
  );

  useEffect(() => {
    const keyChanged = initializedKeyRef.current !== draftKey;
    const initialValueChanged = !equalRef.current(
      initialValueRef.current,
      initialValue,
    );
    const enabledChanged = initializedEnabledRef.current !== enabled;
    if (!keyChanged && !initialValueChanged && !enabledChanged) return;

    initialValueRef.current = initialValue;
    initializedEnabledRef.current = enabled;
    const baselineChanged = !equalRef.current(
      initialValue,
      baselineRef.current,
    );
    const currentIsDirty = !equalRef.current(
      valueRef.current,
      baselineRef.current,
    );

    if (keyChanged) {
      clearTimers();
      initializedKeyRef.current = draftKey;
      loadedKeyRef.current = null;
      baselineRef.current = initialValue;
      setBaseline(initialValue);
      setValueInternally(initialValue);
      setStatus(enabled ? "idle" : "idle");
      setError("");
    } else if (baselineChanged) {
      baselineRef.current = initialValue;
      setBaseline(initialValue);
      if (!currentIsDirty) setValueInternally(initialValue);
    }

    if (!enabled) {
      setIsRestoring(false);
      return;
    }

    const generation = ++restoreGenerationRef.current;
    const valueVersion = valueVersionRef.current;
    setIsRestoring(true);
    const applyDraft = (
      draft: Awaited<ReturnType<typeof readAutosyncDraft<TValue>>>,
    ) => {
      if (
        generation !== restoreGenerationRef.current ||
        valueVersion !== valueVersionRef.current
      ) {
        setIsRestoring(false);
        return;
      }

      if (draft && !equalRef.current(draft.value, initialValue)) {
        baselineRef.current = initialValue;
        setBaseline(initialValue);
        setValueInternally(draft.value);
        markAutosyncDraftDirty(keyRef.current);
        setStatus(browserIsOnline() ? "pending" : "offline");
        scheduleRef.current(0);
      } else if (draft) {
        removeAutosyncDraft(keyRef.current);
        markAutosyncDraftClean(keyRef.current);
        setStatus("saved");
      }
      loadedKeyRef.current = draftKey;
      setIsRestoring(false);
    };
    const localDraft = readAutosyncDraftSync<TValue>(keyRef.current);
    if (localDraft) {
      applyDraft(localDraft);
    } else {
      void readAutosyncDraft<TValue>(keyRef.current).then(applyDraft);
    }

    return () => {
      restoreGenerationRef.current += 1;
    };
  }, [clearTimers, draftKey, enabled, initialValue, setValueInternally]);

  useEffect(() => {
    onlineManager.setOnline(browserIsOnline());
    return onlineManager.subscribe((online) => {
      if (!online) {
        if (!equalRef.current(valueRef.current, baselineRef.current)) {
          clearTimers();
          setStatus("offline");
        }
        return;
      }
      if (
        enabledRef.current &&
        !equalRef.current(valueRef.current, baselineRef.current)
      ) {
        setStatus("pending");
        scheduleRef.current(0);
      }
    });
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!enabled) return undefined;
    const registration = {
      key,
      mutationKey,
      flush: () => flushRef.current(),
      isDirty: () => !equalRef.current(valueRef.current, baselineRef.current),
      getStatus: () => statusRef.current,
    };
    return autosyncManager.register(registration);
  }, [draftKey, enabled, key, mutationKey]);

  useEffect(() => {
    queryClient.setMutationDefaults(mutationKey, {
      mutationFn: async (draft: TValue) =>
        syncRef.current(draft, {
          key: keyRef.current,
          previousValue: baselineRef.current,
        }),
      networkMode: "online",
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1_000 * 2 ** attemptIndex, 30_000),
    });
  }, [key, mutationKey, queryClient]);

  const isDirty = !isEqual(value, baseline);
  return {
    value,
    update,
    replaceFromServer,
    mergeFromServer,
    discard,
    status,
    error,
    isDirty,
    isRestoring,
    flush,
  };
}
