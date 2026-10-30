import type { Database, Json } from "@veolms/database";
import type { Transaction } from "kysely";

import type { DomainEvent } from "./domain-event.types.ts";
import * as outboxRepository from "./outbox.repository.ts";

export interface OutboxService {
  publish<TPayload extends Json>(
    transaction: Transaction<Database>,
    event: DomainEvent<TPayload>,
  ): Promise<void>;
}

export function createOutboxService(): OutboxService {
  return {
    publish: (transaction, event) =>
      outboxRepository.createEvent(transaction, event),
  };
}
