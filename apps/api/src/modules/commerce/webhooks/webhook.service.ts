import crypto from "node:crypto";
import type { PaymentGateway } from "@veolms/contracts";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as webhookRepo from "./webhook.repository.ts";
import type { PaymentEventQueue } from "./payment-event.queue.ts";

export interface WebhookService {
  processGatewayWebhook(
    rawBody: string | Uint8Array,
    signature: string | undefined,
    parsedPayload: unknown,
    eventId?: string,
  ): Promise<{ received: boolean; eventId: string }>;
}

export function createWebhookService({
  database,
  paymentGateway,
  eventQueue,
}: {
  database: Executor;
  paymentGateway: PaymentGateway;
  eventQueue: PaymentEventQueue;
}): WebhookService {
  async function processGatewayWebhook(
    rawBody: string | Uint8Array,
    signature: string | undefined,
    parsedPayload: unknown,
    eventId?: string,
  ) {
    if (!signature) {
      throw CommerceErrors.WEBHOOK_SIGNATURE_INVALID();
    }

    // 1. Verify webhook signature via PaymentGateway adapter
    const isValid = paymentGateway.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw CommerceErrors.WEBHOOK_SIGNATURE_INVALID();
    }

    // 2. Normalize provider payload to gateway-independent domain event (using header eventId if present)
    const normalizedEvent = paymentGateway.normalizeWebhookEvent(parsedPayload, eventId);

    // 3. Idempotently deduplicate by event_id in database
    const existing = await webhookRepo.findWebhookEvent(
      database,
      paymentGateway.providerName,
      normalizedEvent.eventId,
    );

    if (existing) {
      return {
        received: true,
        eventId: existing.id,
      };
    }

    // 4. Persist webhook event record
    const internalId = crypto.randomUUID();
    await webhookRepo.insertWebhookEvent(database, {
      id: internalId,
      provider: paymentGateway.providerName,
      event_id: normalizedEvent.eventId,
      event_type: normalizedEvent.eventType,
      payload: parsedPayload,
      processed_at: null,
    });

    // 5. Enqueue for fast asynchronous worker processing
    await eventQueue.enqueue({
      ...normalizedEvent,
      eventId: internalId,
    });

    return {
      received: true,
      eventId: internalId,
    };
  }

  return {
    processGatewayWebhook,
  };
}
