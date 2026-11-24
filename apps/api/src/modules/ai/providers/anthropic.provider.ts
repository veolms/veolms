import Anthropic from "@anthropic-ai/sdk";
import {
  AiProviderError,
  type AiCredentials,
  type AiJsonRequest,
  type AiJsonResult,
  type AiProvider,
} from "./provider.ts";

/**
 * Claude, through the official SDK. Streams every call (questions take a
 * minute or more), asks for JSON that follows the schema (structured
 * output), and lets the API retry on a fallback model when a safety check
 * declines a harmless request.
 */
export function createAnthropicProvider(
  credentials: AiCredentials,
): AiProvider {
  // Retries: the SDK's own (429, 5xx, connection) — twice, then we report.
  const client = new Anthropic({
    apiKey: credentials.apiKey,
    maxRetries: 2,
    timeout: 10 * 60_000,
    // A key made at the organisation level must name its workspace.
    ...(credentials.workspaceId
      ? {
          defaultHeaders: { "anthropic-workspace-id": credentials.workspaceId },
        }
      : {}),
  });

  return {
    async generateJson(request: AiJsonRequest): Promise<AiJsonResult> {
      try {
        const stream = client.beta.messages.stream(
          {
            model: request.model,
            max_tokens: request.maxTokens,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            system: [
              {
                type: "text",
                text: request.system,
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: [{ role: "user", content: request.user }],
            output_config: {
              effort: request.effort,
              format: { type: "json_schema", schema: request.schema },
            },
          },
          { signal: request.signal },
        );
        if (request.onProgress) {
          const report = request.onProgress;
          stream.on("text", (_delta, snapshot) => report(snapshot.length));
        }
        const message = await stream.finalMessage();
        const text = message.content
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("");
        const usage = message.usage;
        return {
          text,
          model: message.model,
          usage: {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            cacheReadTokens: usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
          },
          ending:
            message.stop_reason === "refusal"
              ? "refused"
              : message.stop_reason === "max_tokens"
                ? "cut_off"
                : "complete",
        };
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}

/**
 * The provider's own sentence ("This API key is not scoped…"), not the
 * status code and raw JSON the SDK puts in `message`.
 */
function providerSentence(error: InstanceType<typeof Anthropic.APIError>) {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : error.message.replace(/^\d{3}\s+/, "");
}

function toProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Anthropic.APIUserAbortError)
    return new AiProviderError("cancelled", "Stopped.");
  if (error instanceof Anthropic.AuthenticationError)
    return new AiProviderError(
      "invalid_key",
      "The AI provider did not accept the API key. Check it in Platform → AI.",
    );
  if (error instanceof Anthropic.PermissionDeniedError)
    return new AiProviderError(
      "invalid_key",
      "This API key may not use the chosen model. Check it in Platform → AI.",
    );
  if (error instanceof Anthropic.RateLimitError)
    return new AiProviderError(
      "rate_limited",
      "The AI provider is limiting requests right now. Try again in a minute.",
    );
  if (error instanceof Anthropic.BadRequestError) {
    const said = providerSentence(error);
    if (/workspace/i.test(said))
      return new AiProviderError(
        "workspace_required",
        "This API key was made outside a workspace, so requests must name one. Enter the Workspace ID (wrkspc_…) in Platform → AI, or use a key created inside a workspace.",
      );
    return new AiProviderError(
      "bad_request",
      `The AI provider refused the request: ${said}`.slice(0, 400),
    );
  }
  if (error instanceof Anthropic.APIConnectionError)
    return new AiProviderError(
      "network",
      "Could not reach the AI provider. Try again.",
    );
  if (error instanceof Anthropic.APIError) {
    if (error.status === 529 || error.status === 503)
      return new AiProviderError(
        "overloaded",
        "The AI provider is busy. Try again in a minute.",
      );
    return new AiProviderError(
      "unknown",
      `The AI provider answered ${error.status ?? "with an error"}.`,
    );
  }
  return new AiProviderError(
    "unknown",
    error instanceof Error ? error.message.slice(0, 300) : "AI call failed.",
  );
}
