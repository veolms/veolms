import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  OrdersListQuery,
  OrderScope,
  OrderStatsQuery,
  OrderDirectRefundRequest,
} from "@veolms/contracts";
import { ADMIN_ROLE } from "../../auth/index.ts";
import { httpError } from "../../../lib/errors.ts";
import type { OrderService } from "./order.service.ts";
import type { InvoiceService } from "../invoices/invoice.service.ts";
import type { RefundService } from "../refunds/refund.service.ts";
import type { AuthorizationService } from "../../authorization/authorization.service.ts";

type BillingPermission = "billing.read" | "billing.manage";

export function createOrderController({
  service,
  invoiceService,
  refundService,
  authorizationService,
}: {
  service: OrderService;
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
   * Allows the request when RBAC grants `permission`, or when the user holds
   * the legacy ADMIN_ROLE.
   *
   * ADMIN_ROLE is a superuser bypass: it passes even if an RBAC policy
   * explicitly denies the permission (`AuthorizationDecision` doesn't tell an
   * explicit deny from a missing grant). That matches the `requireAdmin`
   * routes, which check the role alone. Honouring a deny only here would be
   * sidestepped through those routes, so tightening it has to be done
   * platform-wide rather than in this controller.
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
    });
    const hasAdminRole = user.roles?.includes(ADMIN_ROLE) ?? false;

    if (!decision.allowed && !hasAdminRole) {
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
    await requireBillingPermission(
      request,
      "billing.read",
      "view order stats",
    );
    const scope = await service.getAcademyScope();
    return await service.getOrderStats(scope, request.query);
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
    const html = await invoiceService.generateInvoiceHtml(
      scope,
      request.params.orderId,
    );
    reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="invoice-${request.params.orderId}.html"`,
      )
      .send(html);
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

    return await refundService.processRefund(user.id, {
      orderId: request.params.orderId,
      amount: request.body.amount,
      reason: request.body.reason,
      preserveAccess: request.body.preserveAccess ?? false,
      idempotencyKey: headerKey ?? bodyKey,
    });
  }

  return {
    listOrders,
    getOrderStats,
    getOrder,
    getInvoice,
    downloadInvoice,
    refundOrder,
  };
}
