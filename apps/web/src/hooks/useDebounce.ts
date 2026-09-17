import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface DebounceOptions {
  /**
   * Specify invoking on the leading edge of the timeout.
   * @default false
   */
  leading?: boolean;

  /**
   * Specify invoking on the trailing edge of the timeout.
   * @default true
   */
  trailing?: boolean;

  /**
   * The maximum time the given function is allowed to be delayed before it's called.
   */
  maxWait?: number;
}

export interface UseDebounceValueOptions extends DebounceOptions {
  /**
   * When true, if the value is empty string, null, or undefined, the debounced
   * value immediately updates without waiting for the delay.
   * @default true
   */
  immediateIfEmpty?: boolean;
}

export interface DebouncedFunction<TArgs extends unknown[], TReturn = void> {
  (...args: TArgs): TReturn | undefined;
  /** Cancels any pending delayed invocations. */
  cancel: () => void;
  /** Immediately invokes any pending delayed invocations. */
  flush: () => TReturn | undefined;
  /** Returns true if there is a pending delayed invocation. */
  isPending: () => boolean;
}

/**
 * Enterprise-grade pure debounce utility function.
 * Creates a debounced function that delays invoking `func` until after `delayMs`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 *
 * @param func The function to debounce.
 * @param delayMs The delay in milliseconds. Defaults to 500ms.
 * @param options Debounce configuration options.
 */
export function debounce<TArgs extends unknown[], TReturn = void>(
  func: (...args: TArgs) => TReturn,
  delayMs = 500,
  options: DebounceOptions = {},
): DebouncedFunction<TArgs, TReturn> {
  const { leading = false, trailing = true, maxWait } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;
  let lastThis: unknown = null;
  let result: TReturn | undefined;
  let lastCallTime: number | null = null;
  let lastInvokeTime = 0;

  function invokeFunc(time: number): TReturn | undefined {
    const args = lastArgs;
    const thisArg = lastThis;

    lastArgs = null;
    lastThis = null;
    lastInvokeTime = time;

    if (args) {
      result = func.apply(thisArg, args);
    }
    return result;
  }

  function startTimer(pendingFunc: () => void, wait: number): ReturnType<typeof setTimeout> {
    return setTimeout(pendingFunc, wait);
  }

  function cancelTimer(id: ReturnType<typeof setTimeout> | null) {
    if (id !== null) {
      clearTimeout(id);
    }
  }

  function leadingEdge(time: number): TReturn | undefined {
    lastInvokeTime = time;
    if (maxWait !== undefined) {
      maxWaitTimeoutId = startTimer(maxWaitExpired, maxWait);
    }
    timeoutId = startTimer(timerExpired, delayMs);
    return leading ? invokeFunc(time) : result;
  }

  function timerExpired() {
    timeoutId = null;
    const time = Date.now();
    if (shouldInvoke(time)) {
      trailingEdge(time);
    } else {
      const timeSinceLastCall = lastCallTime ? time - lastCallTime : 0;
      const remainingWait = delayMs - timeSinceLastCall;
      timeoutId = startTimer(timerExpired, remainingWait);
    }
  }

  function maxWaitExpired() {
    maxWaitTimeoutId = null;
    const time = Date.now();
    if (trailing && lastArgs) {
      invokeFunc(time);
    }
    lastArgs = null;
    lastThis = null;
  }

  function trailingEdge(time: number): TReturn | undefined {
    timeoutId = null;
    cancelTimer(maxWaitTimeoutId);
    maxWaitTimeoutId = null;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = null;
    lastThis = null;
    return result;
  }

  function shouldInvoke(time: number): boolean {
    if (lastCallTime === null) {
      return true;
    }
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      timeSinceLastCall >= delayMs ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  }

  function cancel() {
    cancelTimer(timeoutId);
    cancelTimer(maxWaitTimeoutId);
    timeoutId = null;
    maxWaitTimeoutId = null;
    lastArgs = null;
    lastThis = null;
    lastCallTime = null;
    lastInvokeTime = 0;
  }

  function flush(): TReturn | undefined {
    if (timeoutId === null) {
      return result;
    }
    return trailingEdge(Date.now());
  }

  function isPending(): boolean {
    return timeoutId !== null;
  }

  const debounced = function (this: unknown, ...args: TArgs): TReturn | undefined {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === null) {
        return leadingEdge(lastCallTime);
      }
      if (maxWait !== undefined) {
        cancelTimer(timeoutId);
        timeoutId = startTimer(timerExpired, delayMs);
        return invokeFunc(lastCallTime);
      }
    }
    if (timeoutId === null) {
      timeoutId = startTimer(timerExpired, delayMs);
    }
    return result;
  } as DebouncedFunction<TArgs, TReturn>;

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.isPending = isPending;

  return debounced;
}

/**
 * Enterprise React hook that returns a memoized debounced callback function.
 * Ensures the latest callback is always called without re-binding effects.
 * Automatically cancels pending timers when the component unmounts.
 *
 * @param callback The function to debounce.
 * @param delayMs Delay in milliseconds. Defaults to 500ms.
 * @param options Optional debounce settings (leading, trailing, maxWait).
 */
export function useDebouncedCallback<TArgs extends unknown[], TReturn = void>(
  callback: (...args: TArgs) => TReturn,
  delayMs = 500,
  options: DebounceOptions = {},
): DebouncedFunction<TArgs, TReturn> {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debounced = useMemo(() => {
    return debounce<TArgs, TReturn>(
      (...args: TArgs) => callbackRef.current(...args),
      delayMs,
      options,
    );
  }, [delayMs, options.leading, options.trailing, options.maxWait]);

  useEffect(() => {
    return () => {
      debounced.cancel();
    };
  }, [debounced]);

  return debounced;
}

export interface DebounceControl {
  /** Immediately forces the debounced value to a specific value. */
  (val: unknown): void;
  /** Immediately triggers the debounced value to update to the latest source value. */
  flush: () => void;
  /** Cancels the pending debounced update. */
  cancel: () => void;
  /** Returns true if there is a pending debounced update. */
  isPending: () => boolean;
  /** Immediately forces the debounced value to a specific value. */
  setValueImmediately: (val: unknown) => void;
}

/**
 * Enterprise React hook that returns a debounced copy of a value alongside control helpers.
 *
 * @param value The value to debounce.
 * @param delayMs The delay in milliseconds. Defaults to 500ms.
 * @param options Options including `immediateIfEmpty` and `maxWait`.
 * @returns [debouncedValue, controls] tuple.
 */
export function useDebounceValue<T>(
  value: T,
  delayMs = 500,
  options: UseDebounceValueOptions = {},
): [T, DebounceControl] {
  const { immediateIfEmpty = true, ...debounceOpts } = options;
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  const updateDebouncedValue = useDebouncedCallback(
    (nextVal: T) => {
      setDebouncedValue(nextVal);
    },
    delayMs,
    debounceOpts,
  );

  useEffect(() => {
    // If immediateIfEmpty is enabled and value is an empty string, null, or undefined,
    // clear immediately without waiting for debounce timeout.
    const isEmpty =
      value === "" ||
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "");

    if (immediateIfEmpty && isEmpty) {
      updateDebouncedValue.cancel();
      setDebouncedValue(value);
    } else {
      updateDebouncedValue(value);
    }
  }, [value, immediateIfEmpty, updateDebouncedValue]);

  const flush = useCallback(() => {
    updateDebouncedValue.cancel();
    setDebouncedValue(valueRef.current);
  }, [updateDebouncedValue]);

  const cancel = useCallback(() => {
    updateDebouncedValue.cancel();
  }, [updateDebouncedValue]);

  const isPending = useCallback(() => {
    return updateDebouncedValue.isPending();
  }, [updateDebouncedValue]);

  const setValueImmediately = useCallback(
    (val: unknown) => {
      updateDebouncedValue.cancel();
      setDebouncedValue(val as T);
    },
    [updateDebouncedValue],
  );

  const controls: DebounceControl = useMemo(() => {
    const callable = ((val: unknown) => {
      setValueImmediately(val);
    }) as DebounceControl;
    callable.flush = flush;
    callable.cancel = cancel;
    callable.isPending = isPending;
    callable.setValueImmediately = setValueImmediately;
    return callable;
  }, [flush, cancel, isPending, setValueImmediately]);

  return [debouncedValue, controls];
}

/**
 * Simple enterprise React hook for debouncing any state or input value.
 * Uses 500ms default delay.
 *
 * @example
 * const debouncedSearch = useDebounce(searchQuery, 500);
 *
 * @param value The value to debounce.
 * @param delayMs Delay in milliseconds. Defaults to 500ms.
 * @param options Optional debounce settings.
 */
export function useDebounce<T>(
  value: T,
  delayMs = 500,
  options?: UseDebounceValueOptions,
): T {
  const [debounced] = useDebounceValue(value, delayMs, options);
  return debounced;
}
