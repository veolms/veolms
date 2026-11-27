/**
 * What every AI provider does for the features: take instructions and a
 * JSON schema, give back JSON text and what it cost in tokens. One file per
 * provider implements it (anthropic, openai, gemini, xai); the AI service
 * picks one by the model's provider. Features never import a provider:
 * they call the AI service.
 *
 * A new provider: one more file here that turns this request into the
 * provider's API call and its answer back into AiJsonResult, mapping its
 * errors to AiProviderError, then one line in ai.service.ts.
 */
export interface AiJsonRequest {
  model: string;
  /** Instructions that are the same on every call (cached by the provider). */
  system: string;
  /** This call's material: the course, the brief, the current question. */
  user: string;
  /** JSON Schema the answer must follow. */
  schema: Record<string, unknown>;
  maxTokens: number;
  /** How hard it thinks; null: the model has no such setting. */
  effort: "low" | "medium" | "high" | null;
  signal?: AbortSignal;
  /** Called while the answer streams in, with the characters so far. */
  onProgress?: (chars: number) => void;
}

/**
 * Tokens of one call. `inputTokens` are fresh input only: an adapter whose
 * provider counts cached tokens inside its input total takes them out, so
 * the cost formula is the same for every provider. Thinking tokens count
 * as output (every provider bills them as output).
 */
export interface AiUsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiJsonResult {
  text: string;
  /** The model that answered (a fallback model, after a refusal). */
  model: string;
  usage: AiUsageCounts;
  /** `cut_off`: the answer hit the token limit and is incomplete. */
  ending: "complete" | "cut_off" | "refused";
}

/** How the server reaches a provider: its key, and a workspace if one is needed. */
export interface AiCredentials {
  apiKey: string;
  workspaceId: string | null;
}

/** A provider failure the service can explain to the person. */
export type AiProviderErrorCode =
  | "invalid_key"
  | "workspace_required"
  | "rate_limited"
  | "overloaded"
  | "bad_request"
  | "cancelled"
  | "network"
  | "unknown";

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;

  constructor(code: AiProviderErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AiProviderError";
  }
}

export interface AiProvider {
  generateJson(request: AiJsonRequest): Promise<AiJsonResult>;
}
