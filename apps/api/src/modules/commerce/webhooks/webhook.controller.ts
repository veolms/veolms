import type { FastifyReply, FastifyRequest } from "fastify";
import type { GatewayWebhookHeaders } from "@veolms/contracts";
import type { WebhookService } from "./webhook.service.ts";

export function createWebhookController({
  service,
}: {
  service: WebhookService;
}) {
  async function handleGatewayWebhook(
    request: FastifyRequest<{ Params: { provider: string } }>,
    _reply: FastifyReply,
  ) {
    // Each gateway signs its deliveries in headers of its own; the gateway
    // reads the ones it needs.
    const headers: GatewayWebhookHeaders = {};
    for (const [name, value] of Object.entries(request.headers)) {
      headers[name] = Array.isArray(value) ? value[0] : value;
    }

    return await service.processGatewayWebhook(
      request.params.provider,
      request.rawBody,
      headers,
      request.body,
    );
  }

  return {
    handleGatewayWebhook,
  };
}
