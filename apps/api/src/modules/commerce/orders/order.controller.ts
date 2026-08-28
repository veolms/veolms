import type { FastifyRequest } from "fastify";
import { ADMIN_ROLE } from "../../auth/index.ts";
import type { OrderService } from "./order.service.ts";
import type { InvoiceService } from "../invoices/invoice.service.ts";

export function createOrderController({
  service,
  invoiceService,
}: {
  service: OrderService;
  invoiceService: InvoiceService;
}) {
  async function getOrder(
    request: FastifyRequest<{ Params: { orderId: string } }>,
  ) {
    const userId = request.user!.id;
    return await service.getOrderById(userId, request.params.orderId);
  }

  async function listOrders(request: FastifyRequest) {
    const userId = request.user!.id;
    return await service.listUserOrders(userId);
  }

  async function getInvoice(
    request: FastifyRequest<{ Params: { orderId: string } }>,
  ) {
    const userId = request.user!.id;
    const isAdmin = request.user?.roles?.includes(ADMIN_ROLE) ?? false;
    return await invoiceService.generateInvoiceData(
      userId,
      request.params.orderId,
      isAdmin,
    );
  }

  async function downloadInvoice(
    request: FastifyRequest<{ Params: { orderId: string } }>,
    reply: any,
  ) {
    const userId = request.user!.id;
    const isAdmin = request.user?.roles?.includes(ADMIN_ROLE) ?? false;
    const html = await invoiceService.generateInvoiceHtml(
      userId,
      request.params.orderId,
      isAdmin,
    );
    reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="invoice-${request.params.orderId}.html"`,
      )
      .send(html);
  }

  return {
    getOrder,
    listOrders,
    getInvoice,
    downloadInvoice,
  };
}
