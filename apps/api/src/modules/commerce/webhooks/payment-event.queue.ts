import type { NormalizedPaymentEvent } from "@veolms/contracts";
import type { FastifyBaseLogger } from "fastify";

export interface PaymentEventQueue {
  enqueue(event: NormalizedPaymentEvent): Promise<string>;
}

/**
 * Payment event queue dispatcher using background queue/worker architecture.
 */
export class BackgroundPaymentEventQueue implements PaymentEventQueue {
  private readonly logger?: FastifyBaseLogger;
  private readonly handler?: (event: NormalizedPaymentEvent) => Promise<void>;

  constructor(options?: {
    logger?: FastifyBaseLogger;
    handler?: (event: NormalizedPaymentEvent) => Promise<void>;
  }) {
    this.logger = options?.logger;
    this.handler = options?.handler;
  }

  async enqueue(event: NormalizedPaymentEvent): Promise<string> {
    const jobId = event.eventId;
    this.logger?.info(
      { jobId, eventType: event.eventType, provider: event.provider },
      `Enqueued payment event: ${event.eventType}`,
    );

    // Asynchronously dispatch to worker handler if attached
    if (this.handler) {
      queueMicrotask(() => {
        this.handler!(event).catch((err) => {
          this.logger?.error(
            { err, jobId, eventType: event.eventType },
            `Failed processing queued payment event ${jobId}`,
          );
        });
      });
    }

    return jobId;
  }
}
