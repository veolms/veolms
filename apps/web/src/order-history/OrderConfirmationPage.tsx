import { useEffect, useState } from "react";
import {
  formatMoney,
  type OrderConfirmation,
  type OrderConfirmationItem,
} from "@veolms/contracts";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CalendarPlusIcon as CalendarPlus } from "@phosphor-icons/react/CalendarPlus";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { PlayIcon as Play } from "@phosphor-icons/react/Play";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/Receipt";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import type { NavigateTo } from "../routing/navigation";
import { PURCHASE_HISTORY_PATH } from "./orderConfirmationPath";
import { ordersService, useOrderConfirmation } from "../services/orders";
import {
  browserTimeZone,
  formatSessionDay,
  formatSessionTime,
  surfaceClass,
  timeZoneShortName,
} from "../workshops/workshopHelpers";

export interface OrderConfirmationPageProps {
  orderId?: string;
  onNavigatePage?: NavigateTo;
}

/** After this long still pending, the page stops promising "a moment". */
const PENDING_PATIENCE_MS = 6 * 60 * 1000;

const panelClass = `${surfaceClass} p-5 sm:p-6`;
const rowBorder =
  "border border-[color-mix(in_srgb,var(--text)_10%,transparent)]";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** A Google Calendar "add event" link (times in UTC). */
function googleCalendarUrl(title: string, startsAt: string, endsAt: string) {
  const stamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${stamp(startsAt)}/${stamp(endsAt)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * The buyer's order page: where checkout lands after paying, and where the
 * confirmation email links back to. It says one thing about the payment
 * (paid, being confirmed, not completed, refunded), then what to open
 * next for each item, the creator's welcome, and the receipt. A payment
 * still being confirmed is asked about again every few seconds, so the
 * page turns to "paid" by itself and is safe to reload or close.
 */
export function OrderConfirmationPage({
  orderId,
  onNavigatePage,
}: OrderConfirmationPageProps) {
  const query = useOrderConfirmation(orderId);
  const order = query.data;

  if (query.isLoading) {
    return (
      <main className="mx-auto w-full max-w-[760px]">
        <CenteredLoadingSpinner
          label="Loading your order"
          className="min-h-52 py-24"
        />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto grid w-full max-w-[760px] gap-4">
        <div className={`${panelClass} grid place-items-center text-center`}>
          <span className="flex size-11 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
            <Receipt size={24} weight="duotone" />
          </span>
          <h2 className="mt-3 text-lg font-semibold">Order not found</h2>
          <p className="mt-1 max-w-md text-sm text-(--muted)">
            {query.isError && query.error.status !== 404
              ? "We could not load this order just now. Try again in a moment."
              : "It may belong to another account, or the address is mistyped."}
          </p>
          <div className="mt-4">
            <Button onClick={() => onNavigatePage?.(PURCHASE_HISTORY_PATH)}>
              Purchase history
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const settled = order.state === "paid" || order.state === "free";

  return (
    <main
      className="mx-auto grid w-full max-w-[760px] gap-5"
      aria-labelledby="order-confirmation-title"
    >
      <div>
        <button
          type="button"
          onClick={() => onNavigatePage?.(PURCHASE_HISTORY_PATH)}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-(--muted) hover:text-(--text)"
        >
          <ArrowLeft size={16} weight="bold" />
          Purchase history
        </button>
      </div>

      <StatusPanel order={order} onNavigatePage={onNavigatePage} />

      {settled ? (
        <section
          className="grid gap-3"
          aria-label={
            order.items.length === 1 ? "Your purchase" : "Your purchases"
          }
        >
          {order.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onNavigatePage={onNavigatePage}
            />
          ))}
        </section>
      ) : null}

      <ReceiptPanel order={order} />

      <div className="grid gap-1 px-1 text-[13px] leading-5 text-(--muted)">
        {settled && order.emailHint ? (
          <p className="m-0 flex items-start gap-1.5">
            <EnvelopeSimple size={15} className="mt-0.5 shrink-0" />
            <span>
              A confirmation email is on its way to{" "}
              <span className="font-medium text-(--text)">
                {order.emailHint}
              </span>
              .
            </span>
          </p>
        ) : null}
        <p className="m-0">Your purchases are always in Purchase history.</p>
      </div>
    </main>
  );
}

/** One line about the payment, and the single thing to do about it. */
function StatusPanel({
  order,
  onNavigatePage,
}: {
  order: OrderConfirmation;
  onNavigatePage?: NavigateTo;
}) {
  const [patienceRanOut, setPatienceRanOut] = useState(false);
  useEffect(() => {
    if (order.state !== "pending") return undefined;
    const timer = window.setTimeout(
      () => setPatienceRanOut(true),
      PENDING_PATIENCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [order.state]);

  const amount = formatMoney(order.totalAmount, { currency: order.currency });
  const when = new Date(order.paidAt ?? order.createdAt).toLocaleString(
    undefined,
    { dateStyle: "medium", timeStyle: "short" },
  );
  const meta = [
    order.state === "free" ? null : amount,
    order.paymentMethod,
    `Order ${order.orderNumber}`,
    when,
  ]
    .filter(Boolean)
    .join(" · ");

  const firstItem = order.items[0];
  const retryPath =
    firstItem?.next.kind === "course"
      ? `/courses/${firstItem.next.courseSlug}/overview`
      : firstItem?.next.kind === "workshop"
        ? `/workshops/${firstItem.next.workshopSlug}`
        : null;

  const view = (() => {
    switch (order.state) {
      case "paid":
        return {
          icon: <CheckCircle size={28} weight="fill" />,
          tone: "bg-emerald-500/12 text-emerald-600",
          title: "Payment successful",
          body:
            order.items.length === 1
              ? "You're in. Everything you bought is ready below."
              : "You're in. Everything you bought is ready below.",
        };
      case "free":
        return {
          icon: <CheckCircle size={28} weight="fill" />,
          tone: "bg-emerald-500/12 text-emerald-600",
          title: "You're enrolled",
          body: "Nothing was charged. Everything is ready below.",
        };
      case "pending":
        return {
          icon: <CircleNotch size={28} className="animate-spin" />,
          tone: "bg-(--accent)/10 text-(--accent)",
          title: "Confirming your payment",
          body: patienceRanOut
            ? "This is taking longer than usual. If you paid, you'll get an email as soon as it's confirmed, and it's safe to close this page. If you didn't finish paying, you can try again."
            : "This usually takes a few seconds. Please don't pay again; this page updates by itself.",
        };
      case "failed":
        return {
          icon: <WarningCircle size={28} weight="fill" />,
          tone: "bg-rose-500/12 text-rose-500",
          title: "Payment not completed",
          body: "No money was taken. If your account was charged, the bank returns it by the next working day.",
        };
      case "refunded":
        return {
          icon: <ArrowCounterClockwise size={28} weight="bold" />,
          tone: "bg-(--accent)/10 text-(--accent)",
          title:
            order.status === "partially_refunded"
              ? "Partly refunded"
              : "Refunded",
          body: `${formatMoney(order.refundedAmount, { currency: order.currency })} was refunded to your original payment method.`,
        };
    }
  })();

  const showRetry =
    retryPath !== null &&
    (order.state === "failed" || (order.state === "pending" && patienceRanOut));

  return (
    <section
      className={`${panelClass} flex flex-col items-center gap-3 text-center`}
      aria-live="polite"
    >
      <span
        className={`flex size-14 items-center justify-center rounded-2xl ${view.tone}`}
      >
        {view.icon}
      </span>
      <div className="grid gap-1.5">
        <h1
          id="order-confirmation-title"
          className="m-0 text-[clamp(1.35rem,2vw,1.65rem)] font-bold leading-tight tracking-[-0.03em] text-(--text)"
        >
          {view.title}
        </h1>
        <p className="m-0 max-w-[520px] text-[0.92rem] leading-6 text-(--muted)">
          {view.body}
        </p>
        <p className="m-0 text-[12px] text-(--muted)">{meta}</p>
      </div>
      {showRetry && retryPath ? (
        <Button onClick={() => onNavigatePage?.(retryPath)}>Try again</Button>
      ) : null}
    </section>
  );
}

/** What one item opens, and the creator's welcome for it. */
function ItemCard({
  item,
  onNavigatePage,
}: {
  item: OrderConfirmationItem;
  onNavigatePage?: NavigateTo;
}) {
  const timeZone = browserTimeZone();
  const next = item.next;

  return (
    <article className={`${panelClass} grid gap-4`}>
      <div className="flex min-w-0 items-center gap-3.5">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="aspect-video w-24 shrink-0 rounded-lg object-cover sm:w-28"
          />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-(--accent)/10 text-(--accent)">
            {next.kind === "workshop" ? (
              <VideoConference size={22} weight="duotone" />
            ) : (
              <Play size={20} weight="duotone" />
            )}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="m-0 line-clamp-2 text-base font-bold leading-snug tracking-tight text-(--text)">
            {item.title}
          </h2>
          {next.kind === "workshop" ? (
            <p className="m-0 mt-1 flex items-center gap-1.5 text-[13px] text-(--muted)">
              <Clock size={14} className="shrink-0" />
              {next.nextSession
                ? `${formatSessionDay(next.nextSession.startsAt, timeZone)} · ${formatSessionTime(
                    next.nextSession.startsAt,
                    timeZone,
                  )} ${timeZoneShortName(timeZone, new Date(next.nextSession.startsAt))}`
                : "All sessions have ended; recordings are on its page."}
            </p>
          ) : null}
        </div>
      </div>

      {item.welcome ? (
        <div className={`grid gap-3 rounded-xl bg-(--canvas) p-4 ${rowBorder}`}>
          {item.welcome.message ? (
            <p className="m-0 whitespace-pre-line text-sm leading-6 text-(--text)">
              {item.welcome.message}
            </p>
          ) : null}
          {item.welcome.link ? (
            <div>
              <Button
                variant="quiet"
                elevation="flat"
                onClick={() => openExternal(item.welcome!.link!.url)}
              >
                {item.welcome.link.label}
                <ArrowSquareOut size={15} />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {next.kind === "course" ? (
          <Button
            onClick={() =>
              onNavigatePage?.(`/learn/${encodeURIComponent(next.courseKey)}`)
            }
          >
            <Play size={15} weight="fill" />
            Start learning
          </Button>
        ) : null}
        {next.kind === "workshop" ? (
          <>
            <Button
              onClick={() =>
                onNavigatePage?.(`/workshops/${next.workshopSlug}`)
              }
            >
              <VideoConference size={16} />
              View workshop
            </Button>
            {next.nextSession ? (
              <Button
                variant="quiet"
                elevation="flat"
                onClick={() =>
                  openExternal(
                    googleCalendarUrl(
                      item.title,
                      next.nextSession!.startsAt,
                      next.nextSession!.endsAt,
                    ),
                  )
                }
              >
                <CalendarPlus size={16} />
                Add to Google Calendar
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

/** Items, discount, tax, total, refunds, and the invoice. */
function ReceiptPanel({ order }: { order: OrderConfirmation }) {
  const money = (amount: number) =>
    formatMoney(amount, { currency: order.currency });
  const rows: { label: string; value: string; strong?: boolean }[] = [
    ...order.items.map((item) => ({
      label: item.title,
      value: money(item.amount),
    })),
  ];
  if (order.discountAmount > 0) {
    rows.push({ label: "Discount", value: `− ${money(order.discountAmount)}` });
  }
  if (order.taxAmount > 0) {
    rows.push({ label: "Tax", value: money(order.taxAmount) });
  }
  rows.push({ label: "Total", value: money(order.totalAmount), strong: true });
  if (order.refundedAmount > 0) {
    rows.push({ label: "Refunded", value: `− ${money(order.refundedAmount)}` });
  }

  return (
    <section className={panelClass} aria-labelledby="order-receipt">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="order-receipt"
          className="m-0 text-base font-bold tracking-tight text-(--text)"
        >
          Receipt
        </h2>
        {order.invoiceAvailable ? (
          <Button
            variant="quiet"
            elevation="flat"
            onClick={() =>
              openExternal(
                ordersService.getInvoiceDownloadUrl(order.id, "student"),
              )
            }
          >
            <DownloadSimple size={16} />
            Download invoice
          </Button>
        ) : null}
      </div>
      <dl className="m-0 mt-3 grid gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex items-baseline justify-between gap-4 text-sm ${
              row.strong
                ? "border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-2 font-bold text-(--text)"
                : "text-(--muted)"
            }`}
          >
            <dt className="min-w-0 truncate">{row.label}</dt>
            <dd className="m-0 shrink-0 tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
