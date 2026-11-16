import {
  fillWelcomeMessage,
  isSafeWelcomeLink,
  type OrderConfirmation,
  type OrderConfirmationItem,
  type OrderConfirmationNext,
  type OrderConfirmationState,
  type OrderConfirmationWelcome,
  type OrderStatus,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { CommerceErrors } from "../shared/commerce.errors.ts";
import { toOrderPaymentSummary } from "./order.mapper.ts";
import * as orderRepo from "./order.repository.ts";
import * as repo from "./order-confirmation.repository.ts";

/**
 * The order page a buyer lands on after paying (and comes back to from the
 * confirmation email): what happened to the payment, what each item opens,
 * the creator's welcome, and the receipt. Only the buyer may read it.
 */
export function createOrderConfirmationService({
  database,
}: {
  database: Kysely<Database>;
}) {
  async function getConfirmation(
    userId: string,
    orderId: string,
    now = new Date(),
  ): Promise<OrderConfirmation> {
    const order = await orderRepo.findOrderById(database, orderId, {
      type: "user",
      id: userId,
    });
    if (!order || order.user_id !== userId) {
      throw CommerceErrors.ORDER_NOT_FOUND(orderId);
    }

    const [items, payments, refunded, buyer] = await Promise.all([
      repo.listConfirmationItems(database, order.id),
      orderRepo.listPaymentsForOrders(database, [order.id]),
      repo.sumProcessedRefunds(database, order.id),
      repo.findBuyer(database, userId),
    ]);

    const unlisted = items.flatMap((item) =>
      item.course_id && item.course_unlisted ? [item.course_id] : [],
    );
    const workshopIds = items.flatMap((item) =>
      item.workshop_id ? [item.workshop_id] : [],
    );
    const [opened, sessions] = await Promise.all([
      repo.listOpenedCourses(database, unlisted),
      repo.listNextSessions(database, workshopIds, now),
    ]);
    const openedBy = new Map(opened.map((row) => [row.from_course_id, row]));
    const sessionOf = new Map(sessions.map((row) => [row.workshop_id, row]));

    const firstName = firstNameOf(buyer);
    const state = confirmationState(order.status, order.total_amount);

    return {
      id: order.id,
      orderNumber: order.order_number,
      state,
      status: order.status,
      currency: order.currency,
      subtotalAmount: order.subtotal_amount,
      discountAmount: order.discount_amount,
      taxAmount: order.tax_amount,
      totalAmount: order.total_amount,
      refundedAmount: refunded,
      paymentMethod: paymentMethodLabel(
        toOrderPaymentSummary(payments[0])?.method ?? null,
        state,
      ),
      createdAt: new Date(order.created_at).toISOString(),
      paidAt: order.paid_at ? new Date(order.paid_at).toISOString() : null,
      invoiceAvailable:
        (state === "paid" || state === "refunded") &&
        order.total_amount > 0 &&
        order.invoice_number !== null,
      emailHint: maskEmail(buyer?.email ?? null),
      items: items.map((item) =>
        presentItem(item, {
          opened: item.course_id ? openedBy.get(item.course_id) : undefined,
          session: item.workshop_id
            ? sessionOf.get(item.workshop_id)
            : undefined,
          firstName,
        }),
      ),
    };
  }

  /** The same, with the buyer's first name: for the confirmation email. */
  async function getForEmail(userId: string, orderId: string) {
    const [confirmation, buyer] = await Promise.all([
      getConfirmation(userId, orderId),
      repo.findBuyer(database, userId),
    ]);
    return { confirmation, firstName: firstNameOf(buyer) };
  }

  return { getConfirmation, getForEmail };
}

export type OrderConfirmationService = ReturnType<
  typeof createOrderConfirmationService
>;

/** What the order page says about an order in a given status. */
export function confirmationState(
  status: OrderStatus,
  totalAmount: number,
): OrderConfirmationState {
  switch (status) {
    case "paid":
      return totalAmount > 0 ? "paid" : "free";
    case "partially_refunded":
    case "refunded":
      return "refunded";
    case "pending":
    case "payment_processing":
      return "pending";
    case "payment_failed":
    case "cancelled":
    case "expired":
      return "failed";
  }
}

function presentItem(
  item: repo.ConfirmationItemRow,
  context: {
    opened:
      Awaited<ReturnType<typeof repo.listOpenedCourses>>[number] | undefined;
    session:
      Awaited<ReturnType<typeof repo.listNextSessions>>[number] | undefined;
    firstName: string;
  },
): OrderConfirmationItem {
  const { opened, session, firstName } = context;
  let next: OrderConfirmationNext = { kind: "none" };
  let thumbnailUrl: string | null = null;
  let welcome: OrderConfirmationWelcome | null = null;

  if (item.workshop_id && item.workshop_slug) {
    next = {
      kind: "workshop",
      workshopSlug: item.workshop_slug,
      nextSession: session
        ? {
            startsAt: new Date(session.starts_at).toISOString(),
            endsAt: new Date(session.ends_at).toISOString(),
            timeZone: session.time_zone,
          }
        : null,
    };
    thumbnailUrl = item.workshop_cover_url;
    welcome = presentWelcome(
      {
        message: item.workshop_welcome_message,
        linkLabel: item.workshop_welcome_link_label,
        linkUrl: item.workshop_welcome_link_url,
      },
      firstName,
    );
  } else if (item.course_id && item.course_slug !== null) {
    // An unlisted course (part of another, sold on its own) opens the
    // course it unlocks; its own welcome wins when it has one.
    const target =
      item.course_unlisted && opened
        ? { id: opened.id, slug: opened.slug }
        : { id: item.course_id, slug: item.course_slug };
    next = {
      kind: "course",
      courseKey: target.slug.trim() || target.id,
      courseSlug: target.slug,
    };
    thumbnailUrl = item.course_thumbnail_url ?? opened?.thumbnail_url ?? null;
    welcome =
      presentWelcome(
        {
          message: item.course_welcome_message,
          linkLabel: item.course_welcome_link_label,
          linkUrl: item.course_welcome_link_url,
        },
        firstName,
      ) ??
      (opened
        ? presentWelcome(
            {
              message: opened.welcome_message,
              linkLabel: opened.welcome_link_label,
              linkUrl: opened.welcome_link_url,
            },
            firstName,
          )
        : null);
  }

  return {
    id: item.id,
    title: item.title_snapshot,
    thumbnailUrl,
    // Before any discount: the receipt lists the discount on its own line.
    amount: item.unit_price,
    next,
    welcome,
  };
}

/**
 * The creator's welcome as the buyer reads it, or null when there is
 * nothing to show. A link that is not https (saved before the rule, say)
 * is left out rather than shown.
 */
export function presentWelcome(
  welcome: {
    message: string | null;
    linkLabel: string | null;
    linkUrl: string | null;
  },
  firstName: string,
): OrderConfirmationWelcome | null {
  const message = welcome.message?.trim()
    ? fillWelcomeMessage(welcome.message.trim(), firstName)
    : "";
  const link =
    welcome.linkLabel?.trim() &&
    welcome.linkUrl &&
    isSafeWelcomeLink(welcome.linkUrl)
      ? { label: welcome.linkLabel.trim(), url: welcome.linkUrl }
      : null;
  if (!message && !link) return null;
  return { message, link };
}

export function firstNameOf(
  buyer: { display_name: string | null; username: string | null } | undefined,
): string {
  const name = buyer?.display_name?.trim() || "";
  return name.split(/\s+/u)[0] ?? "";
}

/** "a•••@gmail.com": enough to recognise, not enough to copy. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

const METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Net banking",
  wallet: "Wallet",
  emi: "EMI",
  paylater: "Pay later",
  bank_transfer: "Bank transfer",
};

function paymentMethodLabel(
  method: string | null,
  state: OrderConfirmationState,
): string | null {
  if (state === "free" || !method) return null;
  return METHOD_LABELS[method.toLowerCase()] ?? null;
}
