import { getApiError, getApiRequestUrl } from "./api-client";

/**
 * POSTs and reads an NDJSON answer line by line (AI requests that take a
 * minute: progress lines, then `done` or `error`). Each line is checked
 * against `schema`; others are ignored. Resolves with the last line. A
 * refused request (no permission, invalid body) comes back as plain JSON
 * and is thrown as an ApiError.
 */
export async function streamNdjson<E>(
  path: string,
  payload: unknown,
  /** A contracts schema (zod); only its safeParse is used. */
  schema: {
    safeParse(value: unknown): { success: true; data: E } | { success: false };
  },
  onEvent: (event: E) => void,
  signal: AbortSignal,
): Promise<E | null> {
  const response = await fetch(getApiRequestUrl(path), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    const error = (
      body as { error?: { code?: string; message?: string } } | null
    )?.error;
    throw getApiError({
      status: response.status,
      code: error?.code ?? "AI_REQUEST_FAILED",
      message: error?.message ?? "The request failed. Try again.",
    });
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: E | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return;
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) return;
    last = parsed.data;
    onEvent(parsed.data);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      take(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  }
  take(buffer);
  return last;
}
