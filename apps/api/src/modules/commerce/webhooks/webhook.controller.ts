import type { FastifyReply, FastifyRequest } from "fastify";
import type { WebhookService } from "./webhook.service.ts";

export function createWebhookController({
  service,
}: {
  service: WebhookService;
}) {
  async function handleRazorpayWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const signature = request.headers["x-razorpay-signature"] as string | undefined;
    const eventId = request.headers["x-razorpay-event-id"] as string | undefined;
    const rawBody = (request as any).rawBody || JSON.stringify(request.body);

    const result = await service.processGatewayWebhook(
      rawBody,
      signature,
      request.body,
      eventId,
    );

    return result;
  }

  return {
    handleRazorpayWebhook,
  };
}
