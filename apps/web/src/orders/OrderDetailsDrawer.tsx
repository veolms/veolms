import { memo, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Order } from "@veolms/contracts";
import { XIcon as X } from "@phosphor-icons/react/X";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { TagIcon as Tag } from "@phosphor-icons/react/Tag";
import { CreditCardIcon as CreditCard } from "@phosphor-icons/react/CreditCard";
import type { NavigateTo } from "../routing/navigation";
import { ordersService } from "../services/orders";
import {
  formatCurrency,
  formatFullPlacedDate,
  formatOrderDate,
  getCourseBrandBadge,
  getOrderStatusStyle,
  getStudentInitials,
  insetClass,
} from "./orderHelpers";
import { StudentAvatar } from "./StudentAvatar";

export interface OrderDetailsDrawerProps {
  order: Order | null;
  onClose: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRequestRefund: (order: Order) => void;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export const OrderDetailsDrawer = memo(function OrderDetailsDrawer({
  order,
  onClose,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onRequestRefund,
  onNavigatePage,
  setNotice,
}: OrderDetailsDrawerProps) {
  // ESC key listener to close drawer & body scroll lock
  useEffect(() => {
    if (!order) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev) {
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext) {
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    const originalOverflow = document.body.style.overflow;
    const originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscroll;
    };
  }, [order, hasPrev, hasNext, onClose, onPrev, onNext]);

  if (!order) return null;

  const student = order.admin?.student;
  const studentName = student?.name || student?.displayName || "Anonymous Student";
  const studentEmail = student?.email || "";
  const studentInitials = getStudentInitials(studentName, student?.username);

  const firstItem = order.items?.[0];
  const courseId = firstItem?.courseId;
  const courseTitle =
    firstItem?.titleSnapshot ||
    (order.items && order.items.length > 1
      ? `${order.items[0]?.titleSnapshot} + ${order.items.length - 1} more`
      : "Course Order");
  const brand = getCourseBrandBadge(courseTitle);

  const statusStyle = getOrderStatusStyle(order.status);
  const payment = order.admin?.payment;
  const coupon = order.admin?.coupon;

  const coursePricePaise = order.subtotalAmount || order.totalAmount;
  const discountPaise = order.discountAmount || 0;
  const subtotalPaise = coursePricePaise - discountPaise;
  const taxPaise = order.taxAmount || 0;
  const totalPaidPaise = order.totalAmount;

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setNotice?.(`Copied ${label} to clipboard.`);
  };

  const handleDownloadInvoice = () => {
    setNotice?.(`Downloading invoice for order ${order.orderNumber}...`);
    window.open(ordersService.getInvoiceDownloadUrl(order.id, "admin"), "_blank");
  };

  const paymentDateFormatted = formatFullPlacedDate(order.paidAt || order.createdAt);
  const { dateStr: enrollmentDate } = formatOrderDate(order.paidAt || order.createdAt);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop overlay */}
      <div
        className="animate-in fade-in fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <aside
        role="dialog"
        aria-label="Order Details"
        aria-modal="true"
        className="animate-in slide-in-from-right relative z-10 flex h-full w-full max-w-[500px] flex-col border-l border-(--border) bg-(--card-surface,var(--surface)) shadow-2xl duration-200"
        style={{ boxShadow: "var(--card-floating-shadow,var(--card-shadow))" }}
      >
        {/* Header */}
        <div className="flex shrink-0 flex-col border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight text-(--text)">Order Details</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Order # and Status + Prev/Next Controls */}
          <div className="mt-3.5 flex items-center justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="font-mono text-base font-bold tracking-tight text-(--text)">
                {order.orderNumber.startsWith("#") ? order.orderNumber : `#${order.orderNumber}`}
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle.pillClass}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
                <span>{statusStyle.label}</span>
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={onPrev}
                aria-label="Previous order"
                title="Previous order"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-(--muted) transition-colors hover:border-(--accent) hover:bg-(--hover) hover:text-(--text) disabled:pointer-events-none disabled:opacity-25"
              >
                <CaretLeft size={14} weight="bold" />
              </button>
              <button
                type="button"
                disabled={!hasNext}
                onClick={onNext}
                aria-label="Next order"
                title="Next order"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] text-(--muted) transition-colors hover:border-(--accent) hover:bg-(--hover) hover:text-(--text) disabled:pointer-events-none disabled:opacity-25"
              >
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
          </div>

          <p className="mt-1 text-xs text-(--muted)">{formatFullPlacedDate(order.createdAt)}</p>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 sm:p-6">
          {/* 1. Student Card */}
          <div>
            <h3 className="mb-2.5 text-xs font-bold tracking-wider text-(--muted) uppercase">
              Student
            </h3>
            <div className={`${insetClass} flex items-center justify-between gap-3 p-4`}>
              <div className="flex min-w-0 items-center gap-3">
                <StudentAvatar name={studentName} username={student?.username} size="lg" />
                <div className="min-w-0">
                  <span className="block truncate text-sm font-bold text-(--text)">
                    {studentName}
                  </span>
                  {studentEmail && (
                    <span className="mt-0.5 block truncate font-mono text-xs text-(--muted)">
                      {studentEmail}
                    </span>
                  )}
                  <span className="mt-0.5 block truncate text-xs text-(--muted)">
                    +91 98765 43210
                  </span>
                </div>
              </div>

              {student?.username && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigatePage?.(
                      `/students/${encodeURIComponent(student.username)}?from=orders`,
                    )
                  }
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_80%,transparent)] px-2.5 py-1 text-[11px] font-medium text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
                >
                  <span>Profile</span>
                  <ArrowSquareOut size={12} weight="bold" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Course Card */}
          <div>
            <h3 className="mb-2.5 text-xs font-bold tracking-wider text-(--muted) uppercase">
              Course
            </h3>
            <div className={`${insetClass} flex flex-col gap-2 p-4`}>
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tracking-tight shadow-xs"
                  style={{
                    backgroundColor: brand.bgColor,
                    color: brand.textColor,
                    border: brand.borderColor ? `1px solid ${brand.borderColor}` : undefined,
                  }}
                >
                  {brand.label}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-sm leading-tight font-bold text-(--text)">
                    {courseTitle}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs text-(--muted)">
                    Build modern, scalable applications with {brand.label}
                  </span>
                </div>
              </div>

              {courseId && (
                <div className="flex justify-end border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)] pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigatePage?.(`/courses/${encodeURIComponent(courseId)}`)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-(--muted) transition-colors hover:text-(--accent)"
                  >
                    <span>View Course</span>
                    <ArrowSquareOut size={11} weight="bold" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 3. Pricing Breakdown */}
          <div>
            <h3 className="mb-2.5 text-xs font-bold tracking-wider text-(--muted) uppercase">
              Pricing
            </h3>
            <div className={`${insetClass} space-y-2.5 p-4 text-xs`}>
              <div className="flex items-center justify-between text-(--muted)">
                <span>Course Price</span>
                <span className="font-semibold text-(--text)">
                  {formatCurrency(coursePricePaise, order.currency)}
                </span>
              </div>

              {discountPaise > 0 && (
                <div className="flex items-center justify-between text-emerald-400">
                  <span>Coupon Discount ({coupon?.code || "PROMO"})</span>
                  <span className="font-semibold">
                    -{formatCurrency(discountPaise, order.currency)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-(--muted)">
                <span>Subtotal</span>
                <span className="font-semibold text-(--text)">
                  {formatCurrency(subtotalPaise, order.currency)}
                </span>
              </div>

              <div className="flex items-center justify-between text-(--muted)">
                <span>GST (18%)</span>
                <span className="font-semibold text-(--text)">
                  {formatCurrency(taxPaise, order.currency)}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] pt-2.5">
                <span className="text-sm font-bold text-(--text)">Total Paid</span>
                <span className="text-xl font-extrabold text-(--text)">
                  {formatCurrency(totalPaidPaise, order.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* 4. Payment Details */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-xs font-bold tracking-wider text-(--muted) uppercase">Payment</h3>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                <CheckCircle size={12} weight="fill" />
                <span>Payment Successful</span>
              </span>
            </div>

            <div className={`${insetClass} space-y-2.5 p-4 text-xs`}>
              <div className="flex items-center justify-between">
                <span className="text-(--muted)">Gateway</span>
                <span className="flex items-center gap-1.5 font-semibold text-(--text)">
                  <CreditCard size={14} className="text-(--accent)" />
                  <span>{payment?.gatewayProvider || "Razorpay"}</span>
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--muted)">Payment Method</span>
                <span className="font-medium text-(--text)">
                  {payment?.paymentMethod?.method
                    ? `${payment.paymentMethod.method.toUpperCase()} ${payment.paymentMethod.vpa ? `(${payment.paymentMethod.vpa})` : ""}`
                    : "UPI (Google Pay)"}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--muted)">Transaction ID</span>
                <div className="flex items-center gap-1.5 font-mono text-(--text)">
                  <span className="max-w-[140px] truncate">
                    {payment?.gatewayPaymentId || `pay_${order.id.slice(0, 14)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(
                        payment?.gatewayPaymentId || `pay_${order.id.slice(0, 14)}`,
                        "Transaction ID",
                      )
                    }
                    className="cursor-pointer rounded p-0.5 text-(--muted) hover:text-(--text)"
                    title="Copy Transaction ID"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-(--muted)">Payment Date</span>
                <span className="text-(--text)">{paymentDateFormatted}</span>
              </div>
            </div>
          </div>

          {/* 5. Coupon Section (if any) */}
          {coupon && (
            <div>
              <h3 className="mb-2.5 text-xs font-bold tracking-wider text-(--muted) uppercase">
                Coupon
              </h3>
              <div className={`${insetClass} flex items-center justify-between gap-3 p-4 text-xs`}>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-2 py-1 text-xs font-bold text-(--accent)">
                    <Tag size={13} weight="bold" />
                    <span>{coupon.code}</span>
                  </span>
                  {discountPaise > 0 && (
                    <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold text-emerald-400">
                      -{formatCurrency(discountPaise, order.currency)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-(--muted)">10% off on all courses</span>
              </div>
            </div>
          )}

          {/* 6. Enrollment Status */}
          <div>
            <h3 className="mb-2.5 text-xs font-bold tracking-wider text-(--muted) uppercase">
              Enrollment Status
            </h3>
            <div className={`${insetClass} flex items-center justify-between gap-3 p-4`}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <GraduationCap size={20} weight="duotone" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-(--text)">Enrolled</span>
                  <span className="block text-xs text-(--muted)">
                    Student enrolled in the course on {enrollmentDate}
                  </span>
                </div>
              </div>

              {courseId && (
                <button
                  type="button"
                  onClick={() => onNavigatePage?.(`/courses/${encodeURIComponent(courseId)}`)}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_80%,transparent)] px-2.5 py-1 text-[11px] font-medium text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
                >
                  <span>View Enrollment</span>
                  <ArrowSquareOut size={12} weight="bold" />
                </button>
              )}
            </div>
          </div>

          {/* 7. Order Timeline */}
          <div>
            <h3 className="mb-3 text-xs font-bold tracking-wider text-(--muted) uppercase">
              Order Timeline
            </h3>
            <div className="space-y-4 pl-1">
              {/* Step 1: Created */}
              <div className="relative flex items-start gap-3">
                <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle size={16} weight="fill" />
                </div>
                <div className="absolute top-6 bottom-[-16px] left-3 w-0.5 bg-emerald-500/30" />
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-(--text)">Order created</span>
                    <span className="text-[11px] text-(--muted)">
                      {formatFullPlacedDate(order.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-(--muted)">
                    Order #{order.orderNumber} was created successfully
                  </p>
                </div>
              </div>

              {/* Step 2: Payment */}
              <div className="relative flex items-start gap-3">
                <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle size={16} weight="fill" />
                </div>
                <div className="absolute top-6 bottom-[-16px] left-3 w-0.5 bg-emerald-500/30" />
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-(--text)">Payment confirmed</span>
                    <span className="text-[11px] text-(--muted)">
                      {formatFullPlacedDate(order.paidAt || order.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-(--muted)">
                    Payment received via {payment?.gatewayProvider || "gateway"}
                  </p>
                </div>
              </div>

              {/* Step 3: Enrollment */}
              <div className="relative flex items-start gap-3">
                <div className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <CheckCircle size={16} weight="fill" />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-(--text)">Enrollment granted</span>
                    <span className="text-[11px] text-(--muted)">
                      {formatFullPlacedDate(order.paidAt || order.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-(--muted)">Student enrolled in the course</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Actions Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-(--card-surface,var(--surface)) p-4 sm:p-5">
          {/* Left: Refund button */}
          <button
            type="button"
            onClick={() => onRequestRefund(order)}
            disabled={order.status === "refunded"}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-3.5 text-xs font-semibold whitespace-nowrap text-rose-400 transition-all hover:bg-rose-500/20 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
          >
            <ArrowCounterClockwise size={14} weight="bold" />
            <span>{order.status === "refunded" ? "Refunded" : "Refund Order"}</span>
          </button>

          {/* Right action group */}
          <div className="flex items-center gap-2.5">
            {student?.username && (
              <button
                type="button"
                onClick={() =>
                  onNavigatePage?.(`/students/${encodeURIComponent(student.username)}?from=orders`)
                }
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--text)_6%,var(--surface))] px-3.5 text-xs font-semibold whitespace-nowrap text-(--text) transition-all hover:bg-[color-mix(in_srgb,var(--text)_12%,var(--surface))] active:scale-[0.98]"
              >
                <span>View Student</span>
                <ArrowSquareOut size={13} weight="bold" />
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadInvoice}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-(--accent) px-4 text-xs font-bold whitespace-nowrap text-(--on-accent,#ffffff) shadow-[inset_0_1px_0_color-mix(in_srgb,white_25%,transparent),0_2px_6px_rgba(0,0,0,0.2)] transition-all hover:bg-(--accent-hover,var(--accent)) active:scale-[0.98]"
              title="Download printable invoice receipt"
            >
              <DownloadSimple size={15} weight="bold" />
              <span>Download Invoice</span>
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
});
