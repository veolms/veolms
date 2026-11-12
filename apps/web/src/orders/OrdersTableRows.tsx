import type { KeyboardEvent } from "react";
import type { AdminOrder, OrderCourseOption } from "@veolms/contracts";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CourseThumb } from "./CourseThumb";
import { StudentAvatar } from "./StudentAvatar";
import {
  formatCurrency,
  formatMethodName,
  getStatusTone,
  orderItemLabel,
} from "./orderHelpers";

export type CourseLookup = ReadonlyMap<string, OrderCourseOption>;

export interface OrderRowProps {
  order: AdminOrder;
  courses: CourseLookup;
  selected: boolean;
  freeOnly: boolean;
  onOpen: (orderId: string) => void;
}

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Today", "Yesterday", "Nov 8" (with the year when not this year), and the time. */
export function orderWhen(value: string | Date): { day: string; time: string } {
  const date = new Date(value);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const daysAgo = Math.round(
    (startToday.getTime() - startDate.getTime()) / 86_400_000,
  );
  const day =
    daysAgo === 0
      ? "Today"
      : daysAgo === 1
        ? "Yesterday"
        : (date.getFullYear() === now.getFullYear() ? DAY : DAY_YEAR).format(
            date,
          );
  return { day, time: TIME.format(date) };
}

/** The course an order is shown by: its first item, with its picture. */
export function orderCourse(order: AdminOrder, courses: CourseLookup) {
  const item = order.items[0];
  if (!item) return { title: "—", thumbnailUrl: null, more: 0 };
  const label = orderItemLabel(item);
  const course = courses.get(item.opensCourseId ?? item.courseId ?? "");
  return {
    title: label.title,
    thumbnailUrl: course?.thumbnailUrl ?? item.thumbnail?.url ?? null,
    more: order.items.length - 1,
  };
}

export function StatusPill({ status }: { status: AdminOrder["status"] }) {
  const tone = getStatusTone(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tone.pill}`}
    >
      <span
        className={`size-1.5 rounded-full ${tone.dot}`}
        aria-hidden="true"
      />
      {tone.label}
    </span>
  );
}

export function CouponLine({ order }: { order: AdminOrder }) {
  if (!order.admin.coupon && order.discountAmount <= 0) return null;
  return (
    <span className="mt-1 inline-block max-w-full truncate rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold text-(--accent)">
      {order.admin.coupon?.code ?? "Discount"}
      {order.discountAmount > 0 &&
        ` −${formatCurrency(order.discountAmount, order.currency)}`}
    </span>
  );
}

function openOnKey(event: KeyboardEvent, open: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    open();
  }
}

const learnerName = (order: AdminOrder) =>
  order.admin.student.name || order.admin.student.username || "Student";

/** One order as a row of the table (tablet and up). */
export function OrderTableRow({
  order,
  courses,
  selected,
  freeOnly,
  onOpen,
}: OrderRowProps) {
  const course = orderCourse(order, courses);
  const when = orderWhen(order.createdAt);
  const student = order.admin.student;
  const failure = order.admin.payment?.failureReason;
  const open = () => onOpen(order.id);
  return (
    <tr
      tabIndex={0}
      aria-selected={selected}
      aria-label={`Order ${order.orderNumber} by ${learnerName(order)}`}
      onClick={open}
      onKeyDown={(event) => openOnKey(event, open)}
      className={`h-[4.25rem] cursor-pointer border-t border-(--border) transition-colors outline-none hover:bg-(--hover) focus-visible:bg-(--hover) focus-visible:shadow-[inset_0_0_0_2px_var(--accent)] ${
        selected
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[inset_0_0_0_1.5px_var(--accent)]"
          : ""
      }`}
    >
      <td className="py-2.5 pr-3 pl-4">
        <div className="flex min-w-0 items-center gap-3">
          <StudentAvatar
            name={learnerName(order)}
            username={student.username}
            avatarUrl={student.avatarUrl}
            size="md"
          />
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-semibold text-(--text)">
              {learnerName(order)}
            </p>
            {student.email && (
              <p className="m-0 truncate font-mono text-xs text-(--muted)">
                {student.email}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <CourseThumb
            title={course.title}
            url={course.thumbnailUrl}
            size="sm"
          />
          <p className="m-0 line-clamp-2 text-sm font-semibold text-(--text)">
            {course.title}
            {course.more > 0 && (
              <span className="font-normal text-(--muted)">
                {" "}
                +{course.more} more
              </span>
            )}
          </p>
        </div>
      </td>
      {!freeOnly && (
        <td className="px-3 py-2.5 whitespace-nowrap">
          <p className="m-0 text-sm font-bold text-(--text) tabular-nums">
            {formatCurrency(order.totalAmount, order.currency)}
          </p>
          <CouponLine order={order} />
        </td>
      )}
      {!freeOnly && (
        <td className="hidden px-3 py-2.5 text-sm text-(--text-secondary) @5xl:table-cell">
          {formatMethodName(order.admin.payment?.paymentMethod?.method)}
        </td>
      )}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <p className="m-0 text-sm font-semibold text-(--text)">{when.day}</p>
        <p className="m-0 font-mono text-xs text-(--muted)">{when.time}</p>
      </td>
      <td className="px-3 py-2.5">
        <StatusPill status={order.status} />
        {failure && (
          <p className="m-0 mt-1 line-clamp-2 max-w-[14rem] text-xs text-rose-600 dark:text-rose-400">
            {failure}
          </p>
        )}
      </td>
      <td className="py-2.5 pr-4 pl-1 text-right">
        <CaretRight
          size={14}
          weight="bold"
          aria-hidden="true"
          className="inline text-(--muted)"
        />
      </td>
    </tr>
  );
}

/** One order as a card (phones, and a list narrowed by the order panel). */
export function OrderListCard({
  order,
  courses,
  selected,
  freeOnly,
  onOpen,
}: OrderRowProps) {
  const course = orderCourse(order, courses);
  const when = orderWhen(order.createdAt);
  const failure = order.admin.payment?.failureReason;
  return (
    <li>
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={() => onOpen(order.id)}
        className={`flex w-full flex-col gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-(--hover) focus-visible:bg-(--hover) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) ${
          selected
            ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            : ""
        }`}
      >
        <div className="flex w-full items-start gap-3">
          <StudentAvatar
            name={learnerName(order)}
            username={order.admin.student.username}
            avatarUrl={order.admin.student.avatarUrl}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-sm font-semibold text-(--text)">
              {learnerName(order)}
            </p>
            <p className="m-0 truncate text-xs text-(--muted)">
              {when.day} · {when.time}
            </p>
          </div>
          {!freeOnly && (
            <p className="m-0 shrink-0 text-sm font-bold text-(--text) tabular-nums">
              {formatCurrency(order.totalAmount, order.currency)}
            </p>
          )}
        </div>
        <div className="flex w-full items-center gap-2.5">
          <CourseThumb
            title={course.title}
            url={course.thumbnailUrl}
            size="sm"
          />
          <p className="m-0 min-w-0 flex-1 truncate text-sm text-(--text-secondary)">
            {course.title}
            {course.more > 0 && ` +${course.more}`}
          </p>
          <StatusPill status={order.status} />
        </div>
        {(failure || (!freeOnly && order.admin.coupon)) && (
          <div className="flex w-full flex-wrap items-center gap-2">
            {!freeOnly && <CouponLine order={order} />}
            {failure && (
              <p className="m-0 text-xs text-rose-600 dark:text-rose-400">
                {failure}
              </p>
            )}
          </div>
        )}
      </button>
    </li>
  );
}

const bone = "animate-pulse rounded bg-(--border)";

/** A row's shape while orders load: same cells, same height. */
export function SkeletonTableRow({ freeOnly }: { freeOnly: boolean }) {
  return (
    <tr aria-hidden="true" className="h-[4.25rem] border-t border-(--border)">
      <td className="py-2.5 pr-3 pl-4">
        <div className="flex items-center gap-3">
          <div className={`${bone} size-9 shrink-0 rounded-full`} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className={`${bone} h-3.5 w-28 max-w-full`} />
            <div className={`${bone} h-3 w-40 max-w-full`} />
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          <div className={`${bone} aspect-video w-12 shrink-0 rounded-md`} />
          <div className={`${bone} h-3.5 w-44 max-w-full`} />
        </div>
      </td>
      {!freeOnly && (
        <td className="px-3 py-2.5">
          <div className={`${bone} h-3.5 w-16`} />
        </td>
      )}
      {!freeOnly && (
        <td className="hidden px-3 py-2.5 @5xl:table-cell">
          <div className={`${bone} h-3.5 w-10`} />
        </td>
      )}
      <td className="px-3 py-2.5">
        <div className="space-y-1.5">
          <div className={`${bone} h-3.5 w-14`} />
          <div className={`${bone} h-3 w-16`} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className={`${bone} h-5.5 w-20 rounded-full`} />
      </td>
      <td />
    </tr>
  );
}

/** A card's shape while orders load. */
export function SkeletonListCard() {
  return (
    <li aria-hidden="true" className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className={`${bone} size-9 shrink-0 rounded-full`} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className={`${bone} h-3.5 w-28`} />
          <div className={`${bone} h-3 w-24`} />
        </div>
        <div className={`${bone} h-3.5 w-12`} />
      </div>
      <div className="flex items-center gap-2.5">
        <div className={`${bone} aspect-video w-12 shrink-0 rounded-md`} />
        <div className={`${bone} h-3.5 flex-1`} />
        <div className={`${bone} h-5.5 w-20 rounded-full`} />
      </div>
    </li>
  );
}
