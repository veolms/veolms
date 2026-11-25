import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentResponse,
} from "@google/genai";
import {
  AiProviderError,
  type AiCredentials,
  type AiJsonRequest,
  type AiJsonResult,
  type AiProvider,
} from "./provider.ts";

const LEVELS = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
} as const;

/** Finish reasons that mean the answer was blocked, not cut off. */
const BLOCKED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

/**
 * Gemini (Google), through the official `@google/genai` SDK and
 * generateContent. Streams every call, asks for JSON that follows the
 * schema (`responseJsonSchema`) and passes the effort as the thinking
 * level. Gemini 2.5 models take no thinking level: add them with
 * "effort" off.
 */
export function createGeminiProvider(credentials: AiCredentials): AiProvider {
  const client = new GoogleGenAI({ apiKey: credentials.apiKey });

  return {
    async generateJson(request: AiJsonRequest): Promise<AiJsonResult> {
      try {
        const stream = await client.models.generateContentStream({
          model: request.model,
          contents: [{ role: "user", parts: [{ text: request.user }] }],
          config: {
            systemInstruction: request.system,
            // Thinking counts inside this limit.
            maxOutputTokens: request.maxTokens,
            responseMimeType: "application/json",
            responseJsonSchema: request.schema,
            ...(request.effort
              ? { thinkingConfig: { thinkingLevel: LEVELS[request.effort] } }
              : {}),
            abortSignal: request.signal,
          },
        });
        let text = "";
        let last: GenerateContentResponse | null = null;
        for await (const chunk of stream) {
          last = chunk;
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            if (part.text && !part.thought) text += part.text;
          }
          request.onProgress?.(text.length);
        }
        const finish = last?.candidates?.[0]?.finishReason;
        const blocked =
          Boolean(last?.promptFeedback?.blockReason) ||
          (finish ? BLOCKED.has(finish) : false);
        const usage = last?.usageMetadata;
        const cached = usage?.cachedContentTokenCount ?? 0;
        return {
          text,
          model: last?.modelVersion || request.model,
          usage: {
            // The prompt count includes the cached part.
            inputTokens: Math.max(0, (usage?.promptTokenCount ?? 0) - cached),
            // Thinking is billed as output.
            outputTokens:
              (usage?.candidatesTokenCount ?? 0) +
              (usage?.thoughtsTokenCount ?? 0),
            cacheReadTokens: cached,
            cacheWriteTokens: 0,
          },
          ending: blocked
            ? "refused"
            : finish === FinishReason.MAX_TOKENS
              ? "cut_off"
              : "complete",
        };
      } catch (error) {
        throw toProviderError(error, request.signal);
      }
    },
  };
}

function toProviderError(
  error: unknown,
  signal: AbortSignal | undefined,
): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (
    signal?.aborted ||
    (error instanceof Error && error.name === "AbortError")
  )
    return new AiProviderError("cancelled", "Stopped.");
  if (error instanceof ApiError) {
    const said = error.message.slice(0, 300);
    // A wrong key is a 400 with "API key not valid"; a blocked one a 403.
    if (error.status === 401 || error.status === 403 || /api key/i.test(said))
      return new AiProviderError(
        "invalid_key",
        "Gemini did not accept the API key. Check the Gemini key in Platform → AI.",
      );
    if (error.status === 429)
      return new AiProviderError(
        "rate_limited",
        "Gemini is limiting requests right now (or the free quota is used). Try again in a minute.",
      );
    if (error.status === 503 || error.status === 500 || error.status === 504)
      return new AiProviderError(
        "overloaded",
        "Gemini is busy. Try again in a minute.",
      );
    if (error.status === 400 || error.status === 404)
      return new AiProviderError(
        "bad_request",
        `Gemini refused the request: ${said}`.slice(0, 400),
      );
    return new AiProviderError("unknown", `Gemini answered ${error.status}.`);
  }
  if (error instanceof TypeError)
    return new AiProviderError("network", "Could not reach Gemini. Try again.");
  return new AiProviderError(
    "unknown",
    error instanceof Error ? error.message.slice(0, 300) : "AI call failed.",
  );
}
