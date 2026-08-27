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

  return {
    getOrder,
    listOrders,
    getInvoice,
  };
}
