import type { ReactNode } from "react";
import type { AdminOrder, OrderCourseOption } from "@veolms/contracts";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { UserIcon as User } from "@phosphor-icons/react/User";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { SidePanelVariant } from "../components/useSidePanelVariant";
import { ordersService } from "../services/orders";
import { useCapabilities } from "../services/authorization";
import { CourseThumb } from "./CourseThumb";
import { StudentAvatar } from "./StudentAvatar";
import { StatusPill } from "./OrdersTableRows";
import {
  formatCurrency,
  formatFullPlacedDate,
  formatMethodName,
  hasOrderInvoice,
  isOrderRefundable,
  orderItemLabel,
} from "./orderHelpers";

const ghostIcon =
  "grid size-9 shrink-0 place-items-center rounded-lg border border-(--border) text-(--text) transition-colors hover:bg-(--hover) disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-(--accent)";
const box = "rounded-2xl border border-(--border) bg-(--card-surface) p-4";
const boxTitle =
  "m-0 mb-2.5 text-[0.6875rem] font-bold tracking-wider text-(--muted) uppercase";

export interface OrderDetailsStep {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface OrderDetailsContentProps {
  order: AdminOrder;
  courses: ReadonlyMap<string, OrderCourseOption>;
  /** "3 of 34"; left out for an order not in the list. */
  position: { index: number; total: number } | null;
  variant: SidePanelVariant;
  /** Shown as the bar's ✕; a phone sheet closes on its own. */
  onClose?: () => void;
  step: OrderDetailsStep;
  onRequestRefund: (order: AdminOrder) => void;
  /** Leaves the Orders page; a covering panel is put away first. */
  onOpenPage: (path: string) => void;
  setNotice?: (message: string) => void;
}

function Row({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt
        className={`text-sm ${strong ? "font-bold text-(--text)" : "text-(--muted)"}`}
      >
        {label}
      </dt>
      <dd
        className={`m-0 min-w-0 truncate text-right text-sm ${strong ? "font-bold" : "font-medium"} text-(--text)`}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * One order, in rounded boxes: what happened to it, who bought it, what
 * they bought, the amounts, and the payment. The actions at the foot follow
 * the order's status.
 */
export function OrderDetailsContent({
  order,
  courses,
  position,
  variant,
  onClose,
  step,
  onRequestRefund,
  onOpenPage,
  setNotice,
}: OrderDetailsContentProps) {
  const student = order.admin.student;
  const studentName = student.name || student.username || "Student";
  const payment = order.admin.payment;
  const failure = payment?.failureReason;
  const free = order.subtotalAmount === 0;
  const canRefund =
    useCapabilities().can("billing.manage") && isOrderRefundable(order);
  const hasInvoice = hasOrderInvoice(order);
  const studentPath = student.username
    ? `/students/${encodeURIComponent(student.username)}?from=orders`
    : null;

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setNotice?.(`Copied ${label}.`),
      () => setNotice?.(`Could not copy the ${label}.`),
    );
  };
  const downloadInvoice = () =>
    window.open(
      ordersService.getInvoiceDownloadUrl(order.id, "admin"),
      "_blank",
      "noopener",
    );

  const footer: ReactNode[] = [];
  if (free) {
    if (studentPath) {
      footer.push(
        <button
          key="learner"
          type="button"
          onClick={() => onOpenPage(studentPath)}
          className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-(--accent) text-sm font-bold text-(--on-accent) hover:opacity-90"
        >
          <User size={16} weight="bold" aria-hidden="true" />
          View learner
        </button>,
      );
    }
  } else {
    if (canRefund) {
      footer.push(
        <button
          key="refund"
          type="button"
          onClick={() => onRequestRefund(order)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-(--border) text-sm font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
        >
          <ArrowCounterClockwise size={15} weight="bold" aria-hidden="true" />
          Refund
        </button>,
      );
    }
    if (hasInvoice) {
      footer.push(
        <button
          key="invoice"
          type="button"
          onClick={downloadInvoice}
          className={`${footer.length ? "" : "col-span-2"} inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-(--accent) text-sm font-bold text-(--on-accent) hover:opacity-90`}
        >
          <DownloadSimple size={15} weight="bold" aria-hidden="true" />
          Download invoice
        </button>,
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-15 shrink-0 items-center gap-2 border-b border-(--border) px-3">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order"
            title="Close (Esc)"
            className={ghostIcon}
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={step.onPrev}
          disabled={!step.hasPrev}
          aria-label="Previous order"
          title="Previous (←)"
          className={ghostIcon}
        >
          <CaretLeft size={14} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={step.onNext}
          disabled={!step.hasNext}
          aria-label="Next order"
          title="Next (→)"
          className={ghostIcon}
        >
          <CaretRight size={14} weight="bold" aria-hidden="true" />
        </button>
        {position && (
          <span className="text-xs whitespace-nowrap text-(--muted) tabular-nums">
            {position.index} of {position.total}
          </span>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-xs font-semibold text-(--text-secondary)">
            {order.orderNumber}
          </span>
          <button
            type="button"
            onClick={() => copy(order.orderNumber, "order ID")}
            aria-label="Copy order ID"
            title="Copy order ID"
            className="grid size-7 shrink-0 place-items-center rounded-md text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <section className={box} aria-label="Summary">
          <StatusPill status={order.status} />
          <p className="m-0 mt-2.5 text-3xl font-bold tracking-tight text-(--text) tabular-nums">
            {free ? "Free" : formatCurrency(order.totalAmount, order.currency)}
          </p>
          <p className="m-0 mt-1 text-xs text-(--muted)">
            {formatFullPlacedDate(order.createdAt)}
          </p>
          {failure && (
            <p className="m-0 mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
              {failure}
            </p>
          )}
        </section>

        <section className={box} aria-labelledby="order-student-title">
          <h3 id="order-student-title" className={boxTitle}>
            Student
          </h3>
          {studentPath ? (
            <button
              type="button"
              onClick={() => onOpenPage(studentPath)}
              className="-m-1.5 flex w-[calc(100%+0.75rem)] items-center gap-3 rounded-lg p-1.5 text-left hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
            >
              <StudentAvatar
                name={studentName}
                username={student.username}
                avatarUrl={student.avatarUrl}
                size="md"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-(--text)">
                  {studentName}
                </span>
                {student.email && (
                  <span className="block truncate font-mono text-xs text-(--muted)">
                    {student.email}
                  </span>
                )}
              </span>
              <CaretRight
                size={14}
                weight="bold"
                className="shrink-0 text-(--muted)"
                aria-hidden="true"
              />
            </button>
          ) : (
            <p className="m-0 text-sm font-semibold text-(--text)">
              {studentName}
            </p>
          )}
        </section>

        {order.items.length > 0 && (
          <section
            className="rounded-2xl border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--card-surface))] p-4"
            aria-labelledby="order-course-title"
          >
            <h3 id="order-course-title" className={boxTitle}>
              {order.items.length > 1 ? "Courses" : "Course"}
            </h3>
            <ul className="m-0 list-none space-y-2 p-0">
              {order.items.map((item, index) => {
                const label = orderItemLabel(item);
                const courseId = item.opensCourseId ?? item.courseId;
                const course = courses.get(courseId ?? "");
                const content = (
                  <>
                    <CourseThumb
                      title={label.title}
                      url={course?.thumbnailUrl ?? item.thumbnail?.url}
                      size="lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-bold text-(--text)">
                        {label.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-(--muted)">
                        {label.note ??
                          (free || course?.isFree
                            ? "Free course"
                            : `Paid course · ${formatCurrency(course?.price ?? order.subtotalAmount, course?.currency ?? order.currency)}`)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={`${courseId ?? "item"}-${index}`}>
                    {courseId ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPage(`/courses/${encodeURIComponent(courseId)}`)
                        }
                        className="-m-1.5 flex w-[calc(100%+0.75rem)] items-center gap-3 rounded-lg p-1.5 text-left hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)"
                      >
                        {content}
                        <CaretRight
                          size={14}
                          weight="bold"
                          className="shrink-0 text-(--muted)"
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!free && (
          <section className={box} aria-labelledby="order-amount-title">
            <h3 id="order-amount-title" className={boxTitle}>
              Amount
            </h3>
            <dl className="m-0">
              <Row label="Price">
                {formatCurrency(order.subtotalAmount, order.currency)}
              </Row>
              {order.discountAmount > 0 && (
                <Row
                  label={
                    order.admin.coupon
                      ? `Coupon ${order.admin.coupon.code}`
                      : "Discount"
                  }
                >
                  <span className="text-emerald-600 dark:text-emerald-400">
                    −{formatCurrency(order.discountAmount, order.currency)}
                  </span>
                </Row>
              )}
              {order.taxAmount > 0 && (
                <Row label="Tax">
                  {formatCurrency(order.taxAmount, order.currency)}
                </Row>
              )}
              <div className="mt-1 border-t border-(--border) pt-1">
                <Row label="Total" strong>
                  {formatCurrency(order.totalAmount, order.currency)}
                </Row>
              </div>
            </dl>
          </section>
        )}

        {!free && (payment || order.paidAt || order.invoiceNumber) && (
          <section className={box} aria-labelledby="order-payment-title">
            <h3 id="order-payment-title" className={boxTitle}>
              Payment
            </h3>
            <dl className="m-0">
              {payment && (
                <Row label="Gateway">
                  <span className="capitalize">{payment.gatewayProvider}</span>
                </Row>
              )}
              {payment?.paymentMethod && (
                <Row label="Method">
                  {formatMethodName(payment.paymentMethod.method)}
                  {payment.paymentMethod.vpa
                    ? ` · ${payment.paymentMethod.vpa}`
                    : ""}
                </Row>
              )}
              {payment?.gatewayPaymentId && (
                <Row label="Transaction">
                  <button
                    type="button"
                    onClick={() =>
                      copy(payment.gatewayPaymentId!, "transaction ID")
                    }
                    title="Copy transaction ID"
                    className="inline-flex max-w-full items-center gap-1 font-mono text-xs hover:text-(--accent)"
                  >
                    <span className="truncate">{payment.gatewayPaymentId}</span>
                    <Copy size={12} aria-hidden="true" className="shrink-0" />
                  </button>
                </Row>
              )}
              {order.paidAt && (
                <Row label="Paid">
                  {formatFullPlacedDate(order.paidAt).replace(
                    /^Placed on /,
                    "",
                  )}
                </Row>
              )}
              {order.invoiceNumber && (
                <Row label="Invoice">
                  <span className="font-mono text-xs">
                    {order.invoiceNumber}
                  </span>
                </Row>
              )}
            </dl>
          </section>
        )}
      </div>

      {footer.length > 0 && (
        <div
          className={`grid shrink-0 grid-cols-2 gap-2 border-t border-(--border) p-3 ${variant === "phone" ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : ""}`}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
