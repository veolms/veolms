import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import type { Order, OrderSortOrder } from "@veolms/contracts";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import {
  CourseActionMenu,
  MenuAction,
  MenuDivider,
} from "../courses/CourseActionMenu";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { UserIcon as User } from "@phosphor-icons/react/User";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { ShoppingBagIcon as ShoppingBag } from "@phosphor-icons/react/ShoppingBag";
import { getApplicationScrollElement } from "../shell/applicationScroll";
import type { NavigateTo } from "../routing/navigation";
import { ordersService } from "../services/orders";
import {
  formatCurrency,
  formatOrderDate,
  getCourseBrandBadge,
  getOrderStatusStyle,
} from "./orderHelpers";
import { StudentAvatar } from "./StudentAvatar";

const ORDER_ROW_ESTIMATE = 76;
const ORDER_MOBILE_ROW_ESTIMATE = 118;

const getOrderRowEstimate = () =>
  typeof window !== "undefined" && window.innerWidth < 768
    ? ORDER_MOBILE_ROW_ESTIMATE
    : ORDER_ROW_ESTIMATE;

const ORDER_ROW_OVERSCAN = 8;
const ORDER_LOAD_AHEAD = 10;

const orderListGridColumns =
  "grid-cols-[minmax(220px,1.4fr)_minmax(210px,1.5fr)_minmax(110px,0.8fr)_minmax(130px,0.9fr)_minmax(130px,0.9fr)_minmax(120px,0.8fr)_minmax(56px,0.35fr)]";

export interface OrdersTableProps {
  orders: readonly Order[];
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  sortOrder: OrderSortOrder;
  onToggleSortOrder: () => void;
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onRequestRefund: (order: Order) => void;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

function getOrderListScrollMargin(
  feed: HTMLElement | null,
  scrollport: HTMLElement | null,
): number {
  if (!feed || typeof window === "undefined") return 0;
  const feedRect = feed.getBoundingClientRect();
  if (scrollport) {
    return (
      feedRect.top -
      scrollport.getBoundingClientRect().top +
      scrollport.scrollTop
    );
  }
  return feedRect.top + window.scrollY;
}

function useOrderScrollMode() {
  const [useWindowScroll, setUseWindowScroll] = useState(true);

  useLayoutEffect(() => {
    const syncScrollMode = () => {
      setUseWindowScroll(getApplicationScrollElement() === null);
    };
    syncScrollMode();
    window.addEventListener("resize", syncScrollMode);
    return () => window.removeEventListener("resize", syncScrollMode);
  }, []);

  return useWindowScroll;
}

function useOrderScrollMargin(
  feedRef: RefObject<HTMLDivElement | null>,
  useWindowScroll: boolean,
  itemCount: number,
) {
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const syncScrollMargin = () => {
      const nextMargin = getOrderListScrollMargin(
        feedRef.current,
        useWindowScroll ? null : getApplicationScrollElement(),
      );
      setScrollMargin((current) =>
        Math.abs(current - nextMargin) > 1 ? nextMargin : current,
      );
    };
    syncScrollMargin();
    window.addEventListener("resize", syncScrollMargin);
    return () => window.removeEventListener("resize", syncScrollMargin);
  }, [feedRef, itemCount, useWindowScroll]);

  return scrollMargin;
}

interface OrderRowProps {
  order: Order;
  dataIndex: number;
  isSelected: boolean;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  measureElement: (element: Element | null) => void;
  transform: string;
  onSelectOrder: (orderId: string) => void;
  onRequestRefund: (order: Order) => void;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

const OrderRow = memo(function OrderRow({
  order,
  dataIndex,
  isSelected,
  isMenuOpen,
  onMenuOpenChange,
  measureElement,
  transform,
  onSelectOrder,
  onRequestRefund,
  onNavigatePage,
  setNotice,
}: OrderRowProps) {
  // Student info
  const student = order.admin?.student;
  const studentName = student?.name || student?.displayName || "Anonymous Student";
  const studentEmail = student?.email || "—";

  // Course info
  const firstItem = order.items?.[0];
  const courseTitle =
    firstItem?.titleSnapshot ||
    (order.items && order.items.length > 1
      ? `${order.items[0]?.titleSnapshot} + ${order.items.length - 1} more`
      : "Course Order");
  const brand = getCourseBrandBadge(courseTitle);

  // Price & Coupon
  const formattedPrice = formatCurrency(order.totalAmount, order.currency);
  const coupon = order.admin?.coupon;
  const discountAmount = order.discountAmount;

  // Date
  const { dateStr, timeStr } = formatOrderDate(order.createdAt);

  // Status
  const statusStyle = getOrderStatusStyle(order.status);

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setNotice?.(`Copied ${label} to clipboard.`);
  };

  const handleDownloadInvoice = () => {
    setNotice?.(`Downloading invoice for order ${order.orderNumber}...`);
    window.open(ordersService.getInvoiceDownloadUrl(order.id, "admin"), "_blank");
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectOrder(order.id);
    }
  };

  return (
    <div
      ref={measureElement}
      data-index={dataIndex}
      role="row"
      tabIndex={0}
      aria-selected={isSelected}
      onClick={() => onSelectOrder(order.id)}
      onKeyDown={handleRowKeyDown}
      className={`group absolute left-0 top-0 w-full flex cursor-pointer flex-col gap-2.5 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] p-3.5 transition-colors hover:bg-(--hover) focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent) ${orderListGridColumns} md:grid md:min-w-[1040px] md:items-center md:gap-0 md:p-0 ${
        isSelected
          ? "bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] border-l-3 border-l-(--accent)"
          : ""
      }`}
      style={{ transform }}
    >
      {/* Learner Cell */}
      <div role="cell" className="min-w-0 pr-10 md:pr-0 md:px-5 md:py-3.5">
        <div className="flex items-center gap-3">
          <StudentAvatar
            name={studentName}
            username={student?.username}
            size="md"
          />
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold leading-snug text-(--text) transition-colors group-hover:text-(--accent)">
              {studentName}
            </span>
            <span className="mt-0.5 block truncate font-mono text-xs leading-tight text-(--muted)">
              {studentEmail}
            </span>
          </div>
        </div>
      </div>

      {/* Course Cell */}
      <div role="cell" className="flex items-center justify-between gap-2.5 min-w-0 md:px-4 md:py-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold tracking-tight shadow-xs"
            style={{
              backgroundColor: brand.bgColor,
              color: brand.textColor,
              border: brand.borderColor ? `1px solid ${brand.borderColor}` : undefined,
            }}
          >
            {brand.label}
          </span>
          <span className="truncate text-sm font-semibold text-(--text)">
            {courseTitle}
          </span>
        </div>
        {/* Amount on mobile only */}
        <span className="shrink-0 font-mono text-sm font-bold text-(--text) md:hidden">
          {formattedPrice}
        </span>
      </div>

      {/* Amount Cell (Desktop Grid) */}
      <div role="cell" className="hidden md:block px-4 py-3.5 font-mono text-sm font-bold text-(--text) whitespace-nowrap">
        {formattedPrice}
      </div>

      {/* Coupon Cell (Desktop Grid) */}
      <div role="cell" className="hidden md:flex px-4 py-3.5 items-center gap-1.5 min-w-0">
        {coupon ? (
          <>
            <span className="inline-flex items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-2 py-0.5 text-[11px] font-bold text-(--accent) border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
              {coupon.code}
            </span>
            {discountAmount > 0 && (
              <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-400">
                -{formatCurrency(discountAmount, order.currency)}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-(--muted)">—</span>
        )}
      </div>

      {/* Date Cell (Desktop Grid) */}
      <div role="cell" className="hidden md:block px-4 py-3.5 whitespace-nowrap min-w-0">
        <span className="block text-xs font-semibold text-(--text)">
          {dateStr}
        </span>
        <span className="mt-0.5 block font-mono text-[11px] text-(--muted)">
          {timeStr}
        </span>
      </div>

      {/* Status Cell (Desktop Grid) */}
      <div role="cell" className="hidden md:block px-4 py-3.5 whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.75 text-[11px] font-semibold ${statusStyle.pillClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
          <span>{statusStyle.label}</span>
        </span>
      </div>

      {/* Actions Cell */}
      <div
        role="cell"
        className="absolute right-3.5 top-3.5 md:static md:flex md:items-center md:justify-end md:px-5 md:py-3.5 md:text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <CourseActionMenu
          open={isMenuOpen}
          onOpenChange={onMenuOpenChange}
          ariaLabel={`Actions for order ${order.orderNumber}`}
          dismissOnScroll
          className="relative z-30 ml-auto shrink-0"
        >
          {/* 1. View details */}
          <MenuAction
            Icon={Eye}
            label="View details"
            onClick={() => onSelectOrder(order.id)}
          />

          {/* 2. View student */}
          <MenuAction
            Icon={User}
            label="View student"
            onClick={() => {
              if (student?.username) {
                onNavigatePage?.(
                  `/students/${encodeURIComponent(student.username)}?from=orders`,
                );
              } else {
                setNotice?.("Student profile not available for this order.");
              }
            }}
          />

          {/* 3. View enrollment */}
          <MenuAction
            Icon={GraduationCap}
            label="View enrollment"
            onClick={() => {
              if (firstItem?.courseId) {
                onNavigatePage?.(
                  `/courses/${encodeURIComponent(firstItem.courseId)}`,
                );
              } else {
                setNotice?.("Course enrollment page not available.");
              }
            }}
          />

          <MenuDivider />

          {/* 4. Download invoice */}
          <MenuAction
            Icon={DownloadSimple}
            label="Download invoice"
            onClick={handleDownloadInvoice}
          />

          {/* 5. Issue refund */}
          <MenuAction
            Icon={ArrowCounterClockwise}
            label="Issue refund"
            destructive
            onClick={() => onRequestRefund(order)}
          />

          <MenuDivider />

          {/* 7. Copy order ID */}
          <MenuAction
            Icon={Copy}
            label="Copy order ID"
            onClick={() => handleCopy(order.orderNumber, "Order ID")}
          />

          {/* 8. Copy payment ID */}
          <MenuAction
            Icon={Copy}
            label="Copy payment ID"
            onClick={() =>
              handleCopy(
                order.admin?.payment?.gatewayPaymentId || order.id,
                "Payment ID",
              )
            }
          />

          <MenuDivider />

        </CourseActionMenu>
      </div>

      {/* Mobile Card Footer: Date + Coupon on left, Status Pill on right */}
      <div className="flex min-w-0 items-center justify-between gap-2 pt-2 border-t border-[color-mix(in_srgb,var(--text)_5%,transparent)] text-xs md:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11.5px] text-(--muted)">
            {dateStr}
          </span>
          {coupon && (
            <span className="inline-flex items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-bold text-(--accent) border border-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
              {coupon.code}
            </span>
          )}
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${statusStyle.pillClass}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
          <span>{statusStyle.label}</span>
        </span>
      </div>
    </div>
  );
});

export const OrdersTable = memo(function OrdersTable({
  orders,
  isLoading,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  sortOrder,
  onToggleSortOrder,
  selectedOrderId,
  onSelectOrder,
  onRequestRefund,
  onNavigatePage,
  setNotice,
  isFiltered,
  onResetFilters,
}: OrdersTableProps) {
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const useWindowScroll = useOrderScrollMode();
  const scrollMargin = useOrderScrollMargin(feedRef, useWindowScroll, orders.length);

  // TanStack Virtualizer
  const windowVirtualizer = useWindowVirtualizer({
    count: orders.length,
    estimateSize: getOrderRowEstimate,
    getItemKey: (index) => orders[index]?.id ?? index,
    overscan: ORDER_ROW_OVERSCAN,
    scrollMargin,
    enabled: useWindowScroll,
  });

  const elementVirtualizer = useVirtualizer({
    count: orders.length,
    getScrollElement: () => getApplicationScrollElement() ?? document.documentElement,
    estimateSize: getOrderRowEstimate,
    getItemKey: (index) => orders[index]?.id ?? index,
    overscan: ORDER_ROW_OVERSCAN,
    scrollMargin,
    enabled: !useWindowScroll,
  });

  const virtualizer = useWindowScroll ? windowVirtualizer : elementVirtualizer;
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1;

  // Infinite Scroll Trigger
  useEffect(() => {
    if (
      !hasNextPage ||
      isFetchingNextPage ||
      lastVirtualIndex < orders.length - ORDER_LOAD_AHEAD
    ) {
      return;
    }
    fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, lastVirtualIndex, orders.length, fetchNextPage]);

  // Loading Initial Skeleton
  if (isLoading && orders.length === 0) {
    return (
      <div
        className="w-full overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-12 text-center"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div className="flex flex-col items-center justify-center gap-3">
          <CircleNotch size={32} className="animate-spin text-(--accent)" />
          <p className="text-sm text-(--muted)">Loading orders data...</p>
        </div>
      </div>
    );
  }

  // Empty State
  if (!isLoading && orders.length === 0) {
    return (
      <div
        className="relative w-full overflow-hidden rounded-2xl sm:rounded-[22px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] p-8 sm:p-12 text-center shadow-(--card-shadow)"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, color-mix(in srgb, var(--accent) 6%, transparent) 50%, transparent 75%), linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--card-surface)) 0%, var(--card-surface) 48%, var(--card-surface) 100%)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        <div
          className="mx-auto mb-4 flex size-14 sm:size-16 items-center justify-center rounded-2xl sm:rounded-[20px] border border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface-strong))] text-(--accent) shadow-[0_12px_24px_color-mix(in_srgb,var(--accent-shadow)_22%,transparent)]"
          aria-hidden="true"
        >
          <ShoppingBag size={30} weight="duotone" />
        </div>
        <h3 className="text-base sm:text-lg font-bold tracking-tight text-(--text)">No orders found</h3>
        <p className="mt-1.5 text-xs sm:text-sm text-(--muted) max-w-sm mx-auto leading-relaxed">
          {isFiltered
            ? "No orders match the selected filters. Try clearing some criteria to see more results."
            : "No order records are present in this academy."}
        </p>
        {isFiltered && onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-(--accent) px-4 py-2 text-xs sm:text-sm font-semibold text-(--on-accent,#fff) shadow-sm transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
          >
            <ArrowCounterClockwise size={15} />
            <span>Reset filters</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className="overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface))"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div className="overflow-x-auto">
          <div
            role="table"
            aria-label="Orders list"
            className="min-w-0 w-full"
          >
            {/* Table Header */}
            <div
              role="row"
              className={`hidden md:grid min-w-[1040px] items-center border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold uppercase tracking-wider text-(--muted) select-none ${orderListGridColumns}`}
            >
              <div role="columnheader" className="px-5 py-3.5">
                Learner
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Course
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Amount
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Coupon
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                <button
                  type="button"
                  onClick={onToggleSortOrder}
                  className="inline-flex items-center gap-1.5 hover:text-(--text) transition-colors cursor-pointer uppercase tracking-wider"
                  title={`Sorted by date ${sortOrder}. Click to reverse.`}
                >
                  <span>Date</span>
                  {sortOrder === "desc" ? (
                    <ArrowDown size={13} weight="bold" className="text-(--accent)" />
                  ) : (
                    <ArrowUp size={13} weight="bold" className="text-(--accent)" />
                  )}
                </button>
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Status
              </div>
              <div role="columnheader" className="px-5 py-3.5 text-right">
                <span className="sr-only">Actions</span>
              </div>
            </div>

            {/* Virtualized Rows Container */}
            <div
              ref={feedRef}
              role="rowgroup"
              aria-busy={isLoading || isFetchingNextPage}
              className="relative min-w-0 w-full md:min-w-[1040px]"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
              }}
            >
              {virtualItems.map((virtualItem) => {
                const order = orders[virtualItem.index];
                if (!order) return null;

                return (
                  <OrderRow
                    key={order.id}
                    order={order}
                    dataIndex={virtualItem.index}
                    isSelected={order.id === selectedOrderId}
                    isMenuOpen={openMenuOrderId === order.id}
                    onMenuOpenChange={(open) =>
                      setOpenMenuOrderId(open ? order.id : null)
                    }
                    measureElement={virtualizer.measureElement}
                    transform={`translateY(${virtualItem.start - scrollMargin}px)`}
                    onSelectOrder={onSelectOrder}
                    onRequestRefund={onRequestRefund}
                      onNavigatePage={onNavigatePage}
                    setNotice={setNotice}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Infinite Scroll Footer Spinner */}
      {isFetchingNextPage && (
        <div
          role="status"
          aria-label="Loading more orders"
          className="flex items-center justify-center gap-2 py-6 text-xs text-(--muted)"
        >
          <CircleNotch size={18} className="animate-spin text-(--accent)" />
          <span>Loading more orders...</span>
        </div>
      )}
    </div>
  );
});
