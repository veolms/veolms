/**
 * Safely inspect properties on the global `window` object without `any`.
 */
export function getGlobalWindowProperty<T>(
  propertyName: string,
): T | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const windowRecord = window as unknown as Record<string, unknown>;
  const prop = windowRecord[propertyName];
  return prop as T | undefined;
}

/**
 * Safely inspect nested object properties on `window` (e.g. "webkit.messageHandlers").
 */
export function getNestedGlobalProperty<T>(
  path: readonly string[],
): T | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  let current: unknown = window;
  for (const segment of path) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T | undefined;
}

/**
 * Sanitize an endpoint name into a safe valid JavaScript identifier suffix.
 * Replaces non-alphanumeric characters with underscores.
 */
export function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_$]/g, "_");
}

/**
 * Dispatches an event payload string to a Set of message handlers safely.
 * Isolates subscriber exceptions so one failing handler never prevents others
 * from receiving the message.
 */
export function safelyDispatchHandlers(
  handlers: Set<(message: string) => void>,
  message: string,
): void {
  const handlerSnapshot = Array.from(handlers);
  for (const handler of handlerSnapshot) {
    try {
      handler(message);
    } catch (error) {
      // Isolate handler failure from breaking remaining dispatches
      if (
        typeof console !== "undefined" &&
        typeof console.error === "function"
      ) {
        console.error(
          "Unhandled exception in NativeEndpoint message handler:",
          error,
        );
      }
    }
  }
}
