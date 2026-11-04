import type { ReactNode } from "react";
import type { AdminOrder } from "@veolms/contracts";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { SidePanelVariant } from "../components/useSidePanelVariant";
import type { NavigateTo } from "../routing/navigation";
import { ordersService } from "../services/orders";
import { useCapabilities } from "../services/authorization";
import {
  formatCurrency,
  formatFullPlacedDate,
  getCourseBrandBadge,
  getOrderStatusStyle,
  orderItemLabel,
} from "./orderHelpers";
import { StudentAvatar } from "./StudentAvatar";

// The Discussions panel's lines and buttons (DiscussionWorkspacePanelContent).
const LINE = "border-[color-mix(in_srgb,var(--text)_8%,transparent)]";
const ghostIconButtonClasses =
  "grid size-8 shrink-0 place-items-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-(--accent)";
const rowButtonClasses =
  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-(--accent)";

/** Refunds can be made only from an order that was paid. */
const REFUNDABLE_STATUSES = new Set(["paid", "partially_refunded"]);

export interface OrderDetailsStep {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface OrderDetailsContentProps {
  order: AdminOrder;
  variant: SidePanelVariant;
  /** Shown as the bar's ✕; a tablet or phone panel closes on its own. */
  onClose?: () => void;
  step: OrderDetailsStep;
  onRequestRefund: (order: AdminOrder) => void;
  /** Leaves the Orders page; a covering panel is put away first. */
  onOpenPage: (path: string) => void;
  setNotice?: (message: string) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`border-t ${LINE} px-5 pt-4 pb-4`}>
      <h3 className="m-0 mb-2 text-xs font-bold tracking-wider text-(--muted) uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({
  label,
  children,
  emphasis = false,
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt
        className={`text-sm ${emphasis ? "font-bold text-(--text)" : "text-(--muted)"}`}
      >
        {label}
      </dt>
      <dd
        className={`m-0 min-w-0 text-right text-sm ${
          emphasis ? "font-bold text-(--text)" : "font-medium text-(--text)"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

function formatPaymentMethod(
  method: NonNullable<
    NonNullable<AdminOrder["admin"]["payment"]>["paymentMethod"]
  >,
): string {
  const name = method.method.toUpperCase();
  return method.vpa ? `${name} · ${method.vpa}` : name;
}

/**
 * One order, laid out like the Discussions panel: a bar with ✕ and the
 * steps through the list, then flat sections with what the order really
 * holds (nothing is filled in when the order does not have it), and the
 * order's actions at the foot.
 */
export function OrderDetailsContent({
  order,
  variant,
  onClose,
  step,
  onRequestRefund,
  onOpenPage,
  setNotice,
}: OrderDetailsContentProps) {
  const student = order.admin.student;
  const studentName =
    student.name || student.displayName || student.username || "Student";
  const payment = order.admin.payment;
  const coupon = order.admin.coupon;
  const status = getOrderStatusStyle(order.status);
  const orderNumber = order.orderNumber.startsWith("#")
    ? order.orderNumber
    : `#${order.orderNumber}`;
  const showStepButtons = variant !== "phone";
  const issuesRefunds = useCapabilities().can("billing.manage");
  // Nothing to give back from a free order; refunds take billing.manage.
  const canRefund =
    issuesRefunds &&
    REFUNDABLE_STATUSES.has(order.status) &&
    order.totalAmount > 0;
  const hasInvoice = Boolean(order.invoiceNumber);

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setNotice?.(`Copied ${label}.`);
  };

  const downloadInvoice = () => {
    window.open(
      ordersService.getInvoiceDownloadUrl(order.id, "admin"),
      "_blank",
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex h-14 shrink-0 items-center gap-1 border-b ${LINE} px-2.5`}
      >
        {onClose && (
          <>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              title="Close (Esc)"
              className={ghostIconButtonClasses}
            >
              <X size={17} weight="bold" aria-hidden="true" />
            </button>
            {showStepButtons && (
              <span
                className="mx-1 h-5 w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
                aria-hidden="true"
              />
            )}
          </>
        )}
        {showStepButtons && (
          <>
            <button
              type="button"
              onClick={step.onPrev}
              disabled={!step.hasPrev}
              aria-label="Previous order"
              title="Previous (←)"
              className={ghostIconButtonClasses}
            >
              <CaretLeft size={15} weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={step.onNext}
              disabled={!step.hasNext}
              aria-label="Next order"
              title="Next (→)"
              className={ghostIconButtonClasses}
            >
              <CaretRight size={15} weight="bold" aria-hidden="true" />
            </button>
          </>
        )}
        <span className="ml-auto truncate px-1.5 font-mono text-xs font-semibold text-(--muted)">
          {orderNumber}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="px-5 pt-5 pb-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-(--muted)">
            <span
              className={`size-1.5 rounded-full ${status.dotColor}`}
              aria-hidden="true"
            />
            {status.label}
          </span>
          <p className="mt-1.5 mb-0 text-2xl font-bold tracking-tight text-(--text)">
            {formatCurrency(order.totalAmount, order.currency)}
          </p>
          <p className="mt-1 mb-0 text-xs text-(--muted)">
            {formatFullPlacedDate(order.createdAt)}
          </p>
        </div>

        <Section title="Student">
          {student.username ? (
            <button
              type="button"
              onClick={() =>
                onOpenPage(
                  `/students/${encodeURIComponent(student.username)}?from=orders`,
                )
              }
              title="Open student profile"
              className={`-mx-2 ${rowButtonClasses}`}
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
                  <span className="block truncate text-xs text-(--muted)">
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
        </Section>

        {order.items.length > 0 && (
          <Section title={order.items.length > 1 ? "Courses" : "Course"}>
            <ul className="m-0 -mx-2 list-none p-0">
              {order.items.map((item, index) => {
                // Part of a course is named by the course, with a note.
                const label = orderItemLabel(item);
                // An unlisted course has no page: the course it opens.
                const openCourseId = item.opensCourseId ?? item.courseId;
                const brand = getCourseBrandBadge(label.title);
                const badge = (
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-[0.625rem] font-extrabold tracking-tight"
                    style={{
                      backgroundColor: brand.bgColor,
                      color: brand.textColor,
                    }}
                    aria-hidden="true"
                  >
                    {brand.label}
                  </span>
                );
                const title = (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-(--text)">
                      {label.title}
                    </span>
                    {label.note && (
                      <span className="block truncate text-xs text-(--muted)">
                        {label.note}
                      </span>
                    )}
                  </span>
                );
                return (
                  <li key={`${item.courseId ?? "item"}-${index}`}>
                    {openCourseId ? (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPage(
                            `/courses/${encodeURIComponent(openCourseId)}`,
                          )
                        }
                        title="Open course"
                        className={rowButtonClasses}
                      >
                        {badge}
                        {title}
                        <CaretRight
                          size={14}
                          weight="bold"
                          className="shrink-0 text-(--muted)"
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2">
                        {badge}
                        {title}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section title="Amount">
          <dl className="m-0">
            <DetailRow label="Price">
              {formatCurrency(order.subtotalAmount, order.currency)}
            </DetailRow>
            {order.discountAmount > 0 && (
              <DetailRow label={coupon ? `Coupon ${coupon.code}` : "Discount"}>
                −{formatCurrency(order.discountAmount, order.currency)}
              </DetailRow>
            )}
            {order.taxAmount > 0 && (
              <DetailRow label="Tax">
                {formatCurrency(order.taxAmount, order.currency)}
              </DetailRow>
            )}
            <DetailRow label="Total" emphasis>
              {formatCurrency(order.totalAmount, order.currency)}
            </DetailRow>
            {order.afterCommissionAmount !== null && (
              <DetailRow label="You receive">
                {formatCurrency(order.afterCommissionAmount, order.currency)}
              </DetailRow>
            )}
          </dl>
        </Section>

        {(payment || order.paidAt || order.invoiceNumber) && (
          <Section title="Payment">
            <dl className="m-0">
              {payment && (
                <DetailRow label="Gateway">
                  <span className="capitalize">{payment.gatewayProvider}</span>
                </DetailRow>
              )}
              {payment?.paymentMethod && (
                <DetailRow label="Method">
                  <span className="block truncate">
                    {formatPaymentMethod(payment.paymentMethod)}
                  </span>
                </DetailRow>
              )}
              {payment?.gatewayPaymentId && (
                <DetailRow label="Transaction">
                  <span className="inline-flex max-w-full items-center gap-1">
                    <span className="truncate font-mono text-xs">
                      {payment.gatewayPaymentId}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copy(payment.gatewayPaymentId!, "transaction ID")
                      }
                      aria-label="Copy transaction ID"
                      title="Copy"
                      className="grid size-6 shrink-0 place-items-center rounded-md text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
                    >
                      <Copy size={13} aria-hidden="true" />
                    </button>
                  </span>
                </DetailRow>
              )}
              {order.paidAt && (
                <DetailRow label="Paid">
                  {formatFullPlacedDate(order.paidAt).replace(
                    /^Placed on /,
                    "",
                  )}
                </DetailRow>
              )}
              {order.invoiceNumber && (
                <DetailRow label="Invoice">
                  <span className="font-mono text-xs">
                    {order.invoiceNumber}
                  </span>
                </DetailRow>
              )}
            </dl>
          </Section>
        )}
      </div>

      {(canRefund || hasInvoice) && (
        <div
          className={`flex shrink-0 items-center gap-2 border-t ${LINE} px-4 py-3`}
        >
          {canRefund && (
            <button
              type="button"
              onClick={() => onRequestRefund(order)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-semibold text-rose-400 transition-colors hover:bg-rose-500/10"
            >
              <ArrowCounterClockwise
                size={14}
                weight="bold"
                aria-hidden="true"
              />
              Refund
            </button>
          )}
          {hasInvoice && (
            <button
              type="button"
              onClick={downloadInvoice}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--accent) px-3.5 text-[0.8125rem] font-bold text-(--on-accent) transition-opacity hover:opacity-90"
            >
              <DownloadSimple size={15} weight="bold" aria-hidden="true" />
              Invoice
            </button>
          )}
        </div>
      )}
    </div>
  );
}
