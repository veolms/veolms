import { useLayoutEffect, useMemo, useRef } from "react";

type Handler = ((...args: any[]) => unknown) | undefined;

/**
 * The same handlers, as functions that keep their identity from render to
 * render and call whatever was passed most recently. A handler left out
 * stays undefined, so a child can still tell whether it was given one.
 *
 * Why: the discussion's handlers are written anew on every render of the
 * discussion, and each comment card (`React.memo`) takes a dozen of them, so
 * every render rendered every card again: about once a second while a lesson
 * played (each new percent of progress re-renders the lesson page), 50 to
 * 100 ms a time, measured 2026-11-02.
 */
export function useStableHandlers<Handlers extends Record<string, Handler>>(
  handlers: Handlers,
): Handlers {
  const latestRef = useRef(handlers);
  useLayoutEffect(() => {
    latestRef.current = handlers;
  });

  const givenKeys = Object.keys(handlers)
    .filter((key) => handlers[key] !== undefined)
    .join(",");

  return useMemo(() => {
    const stable: Record<string, Handler> = {};
    const given = new Set(givenKeys.split(","));
    for (const key of Object.keys(handlers)) {
      stable[key] = given.has(key)
        ? (...args: unknown[]) => latestRef.current[key]?.(...args)
        : undefined;
    }
    return stable as Handlers;
    // Only which handlers were given changes the result; the handlers
    // themselves are read through the ref when called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [givenKeys]);
}
