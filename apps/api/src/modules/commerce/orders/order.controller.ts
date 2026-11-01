import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  OrdersListQuery,
  OrderScope,
  OrderStatsQuery,
  OrderDirectRefundRequest,
  NeedsRefundListQuery,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import type { OrderService } from "./order.service.ts";
import type { NeedsRefundService } from "./needs-refund.service.ts";
import type { InvoiceService } from "../invoices/invoice.service.ts";
import type { RefundService } from "../refunds/refund.service.ts";
import { toRefundResult } from "../refunds/refund.mapper.ts";
import type { AuthorizationService } from "../../authorization/authorization.service.ts";

type BillingPermission = "billing.read" | "billing.manage";

export function createOrderController({
  service,
  needsRefundService,
  invoiceService,
  refundService,
  authorizationService,
}: {
  service: OrderService;
  needsRefundService: NeedsRefundService;
  invoiceService: InvoiceService;
  refundService: RefundService;
  authorizationService: AuthorizationService;
}) {
  function requireUser(request: FastifyRequest) {
    const user = request.user;
    if (!user) {
      throw httpError(401, "UNAUTHORIZED", "Authentication required");
    }
    return user;
  }

  /**
   * Allows the request when a role reaching every course grants
   * `permission`: the academy's orders are not any one course's. Admin holds
   * every billing permission, so it needs no bypass.
   */
  async function requireBillingPermission(
    request: FastifyRequest,
    permission: BillingPermission,
    action: string,
  ) {
    const user = requireUser(request);

    const decision = await authorizationService.check({
      userId: user.id,
      permission,
      platformWide: true,
    });

    if (!decision.allowed) {
      throw httpError(
        403,
        "PERMISSION_DENIED",
        `You do not have permission to ${action}.`,
      );
    }

    return user;
  }

  async function resolveScope(
    request: FastifyRequest,
    view?: "admin" | "student",
  ): Promise<OrderScope> {
    if (view === "admin") {
      await requireBillingPermission(
        request,
        "billing.read",
        "view admin orders",
      );
      return await service.getAcademyScope();
    }

    return { type: "user", id: requireUser(request).id };
  }

  async function listOrders(
    request: FastifyRequest<{ Querystring: OrdersListQuery }>,
  ) {
    const scope = await resolveScope(request, request.query.view);
    return await service.listOrders(scope, request.query);
  }

  async function getOrderStats(
    request: FastifyRequest<{ Querystring: OrderStatsQuery }>,
  ) {
    await requireBillingPermission(request, "billing.read", "view order stats");
    const scope = await service.getAcademyScope();
    return await service.getOrderStats(scope, request.query);
  }

  async function listNeedsRefund(
    request: FastifyRequest<{ Querystring: NeedsRefundListQuery }>,
  ) {
    await requireBillingPermission(
      request,
      "billing.read",
      "view payments that need a refund",
    );
    return await needsRefundService.listNeedsRefund(request.query);
  }

  async function getOrder(
    request: FastifyRequest<{
      Params: { orderId: string };
      Querystring: { view?: "admin" | "student" };
    }>,
  ) {
    const scope = await resolveScope(request, request.query?.view);
    return await service.getOrderById(scope, request.params.orderId);
  }

  async function getInvoice(
    request: FastifyRequest<{
      Params: { orderId: string };
      Querystring: { view?: "admin" | "student" };
    }>,
  ) {
    const scope = await resolveScope(request, request.query?.view);
    return await invoiceService.generateInvoiceData(
      scope,
      request.params.orderId,
    );
  }

  async function downloadInvoice(
    request: FastifyRequest<{
      Params: { orderId: string };
      Querystring: { view?: "admin" | "student" };
    }>,
    reply: FastifyReply,
  ) {
    const scope = await resolveScope(request, request.query?.view);
    const download = await invoiceService.getInvoiceDownload(
      scope,
      request.params.orderId,
    );
    reply.header("Cache-Control", "private, no-store");
    if (download.kind === "redirect") {
      // The stored PDF, straight from the bucket, by a link that soon
      // stops working.
      await reply.redirect(download.url, 302);
      return;
    }
    await reply
      .header("Content-Type", "application/pdf")
      .header(
        "Content-Disposition",
        `attachment; filename="${download.fileName}"`,
      )
      .send(download.pdf);
  }

  async function refundOrder(
    request: FastifyRequest<{
      Params: { orderId: string };
      Body: OrderDirectRefundRequest;
      Headers: { "idempotency-key"?: string };
    }>,
  ) {
    const user = await requireBillingPermission(
      request,
      "billing.manage",
      "refund orders",
    );

    // The key may arrive as the standard `Idempotency-Key` header or in the
    // body. Both present must agree, otherwise which one wins is ambiguous.
    const headerKey = request.headers["idempotency-key"];
    const bodyKey = request.body.idempotencyKey;
    if (headerKey && bodyKey && headerKey !== bodyKey) {
      throw httpError(
        400,
        "IDEMPOTENCY_KEY_MISMATCH",
        "Idempotency-Key header and body idempotencyKey must match.",
      );
    }

    const refund = await refundService.processRefund(user.id, {
      orderId: request.params.orderId,
      amount: request.body.amount,
      reason: request.body.reason,
      preserveAccess: request.body.preserveAccess ?? false,
      idempotencyKey: headerKey ?? bodyKey,
      outsideRefund: request.body.outsideRefund,
    });
    return toRefundResult(refund);
  }

  return {
    listOrders,
    getOrderStats,
    listNeedsRefund,
    getOrder,
    getInvoice,
    downloadInvoice,
    refundOrder,
  };
}
