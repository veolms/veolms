/**
 * What every AI provider does for the features: take instructions and a
 * JSON schema, give back JSON text and what it cost in tokens. One file per
 * provider implements it; `createProvider` picks one by name. Features never
 * import a provider: they call the AI service.
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
  effort: "low" | "medium" | "high";
  signal?: AbortSignal;
  /** Called while the answer streams in, with the characters so far. */
  onProgress?: (chars: number) => void;
}

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

/** A provider failure the service can explain to the person. */
/** How the server reaches a provider: its key, and a workspace if one is needed. */
export interface AiCredentials {
  apiKey: string;
  workspaceId: string | null;
}

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
