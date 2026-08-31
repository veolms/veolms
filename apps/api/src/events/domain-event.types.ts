import type { Json } from "@veolms/database";

export interface DomainEvent<TPayload extends Json = Json> {
  type: string;
  version: number;
  dedupeKey: string;
  occurredAt: Date;
  payload: TPayload;
}
