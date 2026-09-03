import crypto from "node:crypto";
import type { PaymentGateway } from "@veolms/contracts";
import type { Json } from "@veolms/database";
import type { Executor } from "../shared/repository.types.ts";
import { CommerceErrors } from "../shared/commerce.errors.ts";
import * as webhookRepo from "./webhook.repository.ts";
import type { PaymentEventQueue } from "./payment-event.queue.ts";

/** Postgres unique_violation (23505), as raised by the pg driver via node-postgres. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

export interface WebhookService {
  processGatewayWebhook(
    rawBody: string | Uint8Array | undefined,
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
    rawBody: string | Uint8Array | undefined,
    signature: string | undefined,
    parsedPayload: unknown,
    eventId?: string,
  ) {
    if (!signature || !rawBody) {
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
    try {
      await webhookRepo.insertWebhookEvent(database, {
        id: internalId,
        provider: paymentGateway.providerName,
        event_id: normalizedEvent.eventId,
        event_type: normalizedEvent.eventType,
        payload: parsedPayload as Json,
        processed_at: null,
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        // Another concurrent delivery of the same event (Razorpay retrying
        // a slow-200) won the race between our dedup check (step 3) and
        // this insert. Look up the row it created and respond idempotently
        // — the same shape as the step-3 dedup hit above — instead of
        // letting an unhandled constraint-violation error surface as a 500,
        // which Razorpay would log as a failed delivery and retry forever.
        const winner = await webhookRepo.findWebhookEvent(
          database,
          paymentGateway.providerName,
          normalizedEvent.eventId,
        );
        if (winner) {
          return { received: true, eventId: winner.id };
        }
      }
      throw err;
    }

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
