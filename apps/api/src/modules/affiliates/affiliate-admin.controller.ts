import { Readable } from "node:stream";

import type {
  AdminAffiliatesQuery,
  AdminCommissionsQuery,
  AdminPayoutsQuery,
  AffiliateAdjustmentRequest,
  AffiliateAuditQuery,
  AffiliateCommissionRuleInput,
  AffiliateExportQuery,
  AffiliatePayoutExportQuery,
  AffiliateReportQuery,
  AffiliateStatusAction,
  AffiliateStatusChangeRequest,
  ClosePayoutRequest,
  CreateAdminPayoutsRequest,
  InviteAffiliateRequest,
  MarkPayoutPaidRequest,
  RejectCommissionRequest,
  SetOrderAttributionRequest,
  UpdateAffiliateProgramSettingsRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AffiliateAdminService } from "./affiliate-admin.service.ts";
import type { AffiliatePayoutsAdminService } from "./affiliate-payouts-admin.service.ts";

type Id = { id: string };

function actor(request: FastifyRequest): string {
  return request.user!.id;
}

/** A CSV as a download: a byte-order mark first, so spreadsheets read UTF-8. */
async function sendCsv(
  reply: FastifyReply,
  name: string,
  lines: AsyncGenerator<string>,
) {
  // Read the first line before answering, so an error is a JSON error.
  const first = await lines.next();
  async function* withLineBreaks() {
    yield "﻿";
    if (!first.done) yield `${first.value}\r\n`;
    for await (const line of lines) yield `${line}\r\n`;
  }
  const day = new Date().toISOString().slice(0, 10);
  return reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${name}-${day}.csv"`)
    .header("Cache-Control", "private, no-store")
    .send(Readable.from(withLineBreaks()));
}

export function createAffiliateAdminController({
  service,
  payouts,
}: {
  service: AffiliateAdminService;
  payouts: AffiliatePayoutsAdminService;
}) {
  return {
    getSettings: async () => await service.getSettings(),
    updateSettings: async (
      request: FastifyRequest<{ Body: UpdateAffiliateProgramSettingsRequest }>,
    ) => await service.updateSettings(actor(request), request.body),
    listRules: async () => await service.listRules(),
    setRule: async (
      request: FastifyRequest<{ Body: AffiliateCommissionRuleInput }>,
    ) => await service.setRule(actor(request), request.body),
    deleteRule: async (request: FastifyRequest<{ Params: Id }>) => {
      await service.deleteRule(actor(request), request.params.id);
      return { message: "Rule archived." };
    },
    listProducts: async () => await service.listProducts(),

    listAffiliates: async (
      request: FastifyRequest<{
        Querystring: AdminAffiliatesQuery;
      }>,
    ) => await service.listAffiliates(request.query),
    getAffiliate: async (request: FastifyRequest<{ Params: Id }>) =>
      await service.getAffiliate(request.params.id),
    invite: async (
      request: FastifyRequest<{
        Body: InviteAffiliateRequest & { email: string };
      }>,
      reply: FastifyReply,
    ) =>
      reply
        .status(201)
        .send(await service.invite(actor(request), request.body)),
    changeStatus:
      (action: AffiliateStatusAction) =>
      async (
        request: FastifyRequest<{
          Params: Id;
          Body: AffiliateStatusChangeRequest | undefined;
        }>,
      ) =>
        await service.changeStatus(
          actor(request),
          request.params.id,
          action,
          request.body?.reason,
        ),
    getPayoutDetails: async (
      request: FastifyRequest<{ Params: Id }>,
      reply: FastifyReply,
    ) => {
      reply.header("Cache-Control", "private, no-store");
      return await service.getPayoutDetails(actor(request), request.params.id);
    },

    listCommissions: async (
      request: FastifyRequest<{
        Querystring: AdminCommissionsQuery;
      }>,
    ) => await service.listCommissions(request.query),
    approveCommission: async (request: FastifyRequest<{ Params: Id }>) =>
      await service.approveCommission(actor(request), request.params.id),
    rejectCommission: async (
      request: FastifyRequest<{ Params: Id; Body: RejectCommissionRequest }>,
    ) =>
      await service.rejectCommission(
        actor(request),
        request.params.id,
        request.body.reason,
      ),
    addAdjustment: async (
      request: FastifyRequest<{ Body: AffiliateAdjustmentRequest }>,
      reply: FastifyReply,
    ) =>
      reply
        .status(201)
        .send(await service.addAdjustment(actor(request), request.body)),
    setOrderAttribution: async (
      request: FastifyRequest<{
        Params: { orderId: string };
        Body: SetOrderAttributionRequest;
      }>,
    ) =>
      await service.setOrderAttribution(
        actor(request),
        request.params.orderId,
        request.body,
      ),

    listPayouts: async (
      request: FastifyRequest<{
        Querystring: AdminPayoutsQuery;
      }>,
    ) => await payouts.listPayouts(request.query),
    createPayouts: async (
      request: FastifyRequest<{ Body: CreateAdminPayoutsRequest }>,
    ) => await payouts.createPayouts(actor(request), request.body),
    markPaid: async (
      request: FastifyRequest<{ Params: Id; Body: MarkPayoutPaidRequest }>,
    ) =>
      await payouts.markPaid(actor(request), request.params.id, request.body),
    closePayout:
      (status: "rejected" | "failed") =>
      async (
        request: FastifyRequest<{ Params: Id; Body: ClosePayoutRequest }>,
      ) =>
        await payouts.close(
          actor(request),
          request.params.id,
          status,
          request.body.reason,
        ),
    exportPayouts: async (
      request: FastifyRequest<{ Querystring: AffiliatePayoutExportQuery }>,
      reply: FastifyReply,
    ) =>
      await sendCsv(
        reply,
        "affiliate-payouts",
        payouts.exportCsv(actor(request), request.query),
      ),

    summary: async (
      request: FastifyRequest<{ Querystring: AffiliateReportQuery }>,
    ) => await service.summary(request.query),
    exportReport: async (
      request: FastifyRequest<{ Querystring: AffiliateExportQuery }>,
      reply: FastifyReply,
    ) =>
      await sendCsv(
        reply,
        `affiliate-${request.query.type}`,
        service.exportCsv(request.query),
      ),
    listAudit: async (
      request: FastifyRequest<{
        Querystring: AffiliateAuditQuery & { limit: number };
      }>,
    ) => await service.listAudit(request.query),
  };
}
