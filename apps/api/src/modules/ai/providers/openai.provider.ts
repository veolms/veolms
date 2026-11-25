import OpenAI from "openai";
import {
  AiProviderError,
  type AiCredentials,
  type AiJsonRequest,
  type AiJsonResult,
  type AiProvider,
} from "./provider.ts";
import { dropNulls, strictSchema } from "./schema-tools.ts";

/**
 * ChatGPT (OpenAI) and Grok (xAI), through the official `openai` SDK and
 * the Responses API: xAI serves the same API at its own address. Streams
 * every call, asks for JSON that follows the schema (strict structured
 * output) and passes the effort as `reasoning.effort`.
 */
export function createOpenAiProvider(credentials: AiCredentials): AiProvider {
  return createResponsesProvider(credentials, {
    label: "ChatGPT",
    baseURL: undefined,
  });
}

export function createXaiProvider(credentials: AiCredentials): AiProvider {
  return createResponsesProvider(credentials, {
    label: "Grok",
    baseURL: "https://api.x.ai/v1",
  });
}

interface UsageShape {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
}

function createResponsesProvider(
  credentials: AiCredentials,
  options: { label: string; baseURL: string | undefined },
): AiProvider {
  // Retries: the SDK's own (429, 5xx, connection) — twice, then we report.
  const client = new OpenAI({
    apiKey: credentials.apiKey,
    baseURL: options.baseURL,
    maxRetries: 2,
    timeout: 10 * 60_000,
  });

  return {
    async generateJson(request: AiJsonRequest): Promise<AiJsonResult> {
      try {
        const stream = await client.responses.create(
          {
            model: request.model,
            instructions: request.system,
            input: request.user,
            // Thinking counts inside this limit, so leave it room.
            max_output_tokens: request.maxTokens,
            ...(request.effort
              ? { reasoning: { effort: request.effort } }
              : {}),
            text: {
              format: {
                type: "json_schema",
                name: "answer",
                schema: strictSchema(request.schema),
                strict: true,
              },
            },
            store: false,
            stream: true,
          },
          { signal: request.signal },
        );
        let text = "";
        let refusal = "";
        let final: OpenAI.Responses.Response | null = null;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            text += event.delta;
            request.onProgress?.(text.length);
          } else if (event.type === "response.refusal.delta") {
            refusal += event.delta;
          } else if (
            event.type === "response.completed" ||
            event.type === "response.incomplete" ||
            event.type === "response.failed"
          ) {
            final = event.response;
          } else if (event.type === "error") {
            throw new AiProviderError(
              "unknown",
              `${options.label} answered with an error: ${event.message}`.slice(
                0,
                400,
              ),
            );
          }
        }
        if (final?.status === "failed")
          throw new AiProviderError(
            "unknown",
            `${options.label} could not answer: ${final.error?.message ?? "unknown error"}`.slice(
              0,
              400,
            ),
          );
        // xAI's docs show both the Responses and the Chat names: read both.
        const usage = (final?.usage ?? {}) as UsageShape;
        const cached =
          usage.input_tokens_details?.cached_tokens ??
          usage.prompt_tokens_details?.cached_tokens ??
          0;
        const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
        const reason = final?.incomplete_details?.reason;
        const ending: AiJsonResult["ending"] =
          refusal || reason === "content_filter"
            ? "refused"
            : final?.status === "incomplete"
              ? "cut_off"
              : "complete";
        return {
          text: ending === "complete" ? normalise(text, request.schema) : text,
          model: final?.model ?? request.model,
          usage: {
            // The provider's input total includes the cached part.
            inputTokens: Math.max(0, input - cached),
            outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
            cacheReadTokens: cached,
            cacheWriteTokens: 0,
          },
          ending,
        };
      } catch (error) {
        throw toProviderError(error, options.label);
      }
    },
  };
}

/** The answer with strict mode's stand-in nulls taken out again. */
function normalise(text: string, schema: Record<string, unknown>) {
  try {
    return JSON.stringify(dropNulls(JSON.parse(text), schema));
  } catch {
    // Not JSON: the feature reports it like any other bad answer.
    return text;
  }
}

function providerSentence(error: InstanceType<typeof OpenAI.APIError>) {
  const body = error.error as { message?: unknown } | undefined;
  const message = body?.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : error.message.replace(/^\d{3}\s+/, "");
}

function toProviderError(error: unknown, label: string): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof OpenAI.APIUserAbortError)
    return new AiProviderError("cancelled", "Stopped.");
  if (error instanceof OpenAI.AuthenticationError)
    return new AiProviderError(
      "invalid_key",
      `${label} did not accept the API key. Check the ${label} key in Platform → AI.`,
    );
  if (error instanceof OpenAI.PermissionDeniedError)
    return new AiProviderError(
      "invalid_key",
      `This ${label} key may not use the chosen model. Check it in Platform → AI.`,
    );
  if (error instanceof OpenAI.RateLimitError) {
    const said = providerSentence(error);
    // A 429 is also "out of credits", which waiting does not fix.
    return new AiProviderError(
      "rate_limited",
      /quota|billing|credit/i.test(said)
        ? `${label} says this account is out of credits or over its spend limit.`
        : `${label} is limiting requests right now. Try again in a minute.`,
    );
  }
  if (
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.NotFoundError ||
    error instanceof OpenAI.UnprocessableEntityError
  )
    return new AiProviderError(
      "bad_request",
      `${label} refused the request: ${providerSentence(error)}`.slice(0, 400),
    );
  if (error instanceof OpenAI.APIConnectionError)
    return new AiProviderError(
      "network",
      `Could not reach ${label}. Try again.`,
    );
  if (error instanceof OpenAI.APIError) {
    if (error.status === 503 || error.status === 529)
      return new AiProviderError(
        "overloaded",
        `${label} is busy. Try again in a minute.`,
      );
    return new AiProviderError(
      "unknown",
      `${label} answered ${error.status ?? "with an error"}.`,
    );
  }
  return new AiProviderError(
    "unknown",
    error instanceof Error ? error.message.slice(0, 300) : "AI call failed.",
  );
}
