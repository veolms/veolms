import type { ReactNode } from "react";
import { CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { Clock } from "@phosphor-icons/react/Clock";
import { Infinity as InfinityIcon } from "@phosphor-icons/react/Infinity";
import { TrendUp } from "@phosphor-icons/react/TrendUp";
import { Warning } from "@phosphor-icons/react/Warning";
import type { CourseAccessEnrollment } from "@veolms/contracts";
import { ordersService } from "../../services/orders";
import {
  describeEnrolmentWords,
  type EnrolmentAccessTone,
} from "./enrolmentDetails";

/** The box around "Your enrollment", its heading and its list. */
export const enrolmentPanelClasses =
  "flex flex-col gap-4 border-t border-[color-mix(in_srgb,var(--text)_9%,transparent)] pt-5";
export const enrolmentListClasses =
  "grid gap-4 text-[0.9rem] @2xl/price:grid-cols-3 @2xl/price:gap-6";
export const enrolmentNeutralTileClasses =
  "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-(--accent)";
export const enrolmentPaceTileClasses =
  "bg-violet-500/12 text-violet-600 dark:text-violet-400";
/** The row that stands out while access is ending. */
export const enrolmentEndingRowClasses =
  "flex min-w-0 gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3";
export const enrolmentEndingLabelClasses =
  "text-[0.78rem] font-semibold text-amber-600 dark:text-amber-400";
export const enrolmentTileClasses =
  "grid size-9 shrink-0 place-items-center rounded-lg";
export const enrolmentLabelClasses = "text-[0.78rem] text-(--muted)";
export const enrolmentValueClasses = "font-semibold text-(--text)";
export const enrolmentNoteClasses = "mt-0.5 text-[0.78rem] text-(--muted)";
export const invoiceLinkClasses =
  "text-(--accent) underline underline-offset-2";

interface CourseEnrolmentDetailsProps {
  enrollment: CourseAccessEnrollment;
  /** When the learner's access ends; null when it does not. */
  accessExpiresAt: string | null;
}

export const enrolmentToneClasses: Record<
  EnrolmentAccessTone,
  { tile: string; remaining: string }
> = {
  lifetime: {
    tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    remaining: "text-emerald-600 dark:text-emerald-400",
  },
  active: {
    tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    remaining: "text-emerald-600 dark:text-emerald-400",
  },
  ending: {
    tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    remaining: "text-amber-600 dark:text-amber-400",
  },
  ended: {
    tile: "bg-red-500/12 text-red-600 dark:text-red-400",
    remaining: "text-red-600 dark:text-red-400",
  },
};

export function EnrolmentDetailRow({
  icon,
  tileClassName,
  label,
  children,
  note,
}: {
  icon: ReactNode;
  tileClassName: string;
  label: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <li className="flex min-w-0 gap-3">
      <span
        aria-hidden="true"
        className={`${enrolmentTileClasses} ${tileClassName}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={enrolmentLabelClasses}>{label}</p>
        <p className={enrolmentValueClasses}>{children}</p>
        {note ? <p className={enrolmentNoteClasses}>{note}</p> : null}
      </div>
    </li>
  );
}

/**
 * The learner's enrolment under their progress: when they enrolled and the
 * order it came with, how long their access lasts, and their pace. Its
 * words are `describeEnrolmentWords`; `CourseEnrolmentDetailsEarly` is the
 * same panel before the page's scripts run, so keep the two alike.
 */
export function CourseEnrolmentDetails({
  enrollment,
  accessExpiresAt,
}: CourseEnrolmentDetailsProps) {
  const words = describeEnrolmentWords(enrollment, accessExpiresAt);
  const { access, pace } = words;
  const order = enrollment.order;
  const tone = enrolmentToneClasses[access.tone];

  return (
    <div className={enrolmentPanelClasses}>
      <h3 className="font-bold text-(--text)">Your enrollment</h3>
      <ul className={enrolmentListClasses}>
        <EnrolmentDetailRow
          icon={<CalendarCheck size={18} />}
          tileClassName={enrolmentNeutralTileClasses}
          label="Enrolled on"
          note={
            <>
              {words.order}
              {order && words.hasInvoice ? (
                <>
                  {" · "}
                  <a
                    href={ordersService.getInvoiceDownloadUrl(
                      order.id,
                      "student",
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={invoiceLinkClasses}
                  >
                    Invoice
                  </a>
                </>
              ) : null}
            </>
          }
        >
          {words.enrolledOn}{" "}
          <span className="font-normal text-(--muted)">
            {words.enrolledAgo}
          </span>
        </EnrolmentDetailRow>

        {access.tone === "ending" ? (
          <li className={enrolmentEndingRowClasses}>
            <span
              aria-hidden="true"
              className={`${enrolmentTileClasses} ${tone.tile}`}
            >
              <Warning size={18} />
            </span>
            <div className="min-w-0">
              <p className={enrolmentEndingLabelClasses}>{words.accessLabel}</p>
              <p className={enrolmentValueClasses}>
                {access.value}{" "}
                <span className={tone.remaining}>({access.remaining})</span>
              </p>
            </div>
          </li>
        ) : (
          <EnrolmentDetailRow
            icon={
              access.tone === "lifetime" ? (
                <InfinityIcon size={18} />
              ) : (
                <Clock size={18} />
              )
            }
            tileClassName={tone.tile}
            label={words.accessLabel}
            note={words.accessNote ?? undefined}
          >
            {access.value}{" "}
            <span className={`font-normal ${tone.remaining}`}>
              ({access.remaining})
            </span>
          </EnrolmentDetailRow>
        )}

        <EnrolmentDetailRow
          icon={<TrendUp size={18} />}
          tileClassName={enrolmentPaceTileClasses}
          label="Your pace"
          note={pace.note}
        >
          {pace.value}
        </EnrolmentDetailRow>
      </ul>
    </div>
  );
}

const placeholderBlock =
  "rounded-md bg-[color-mix(in_srgb,var(--text)_10%,transparent)]";

/** A row of the panel while its words are on their way: tile and lines. */
function PlaceholderRow({ noteLines }: { noteLines: 0 | 1 | 2 }) {
  return (
    <li className="flex min-w-0 gap-3">
      <span className={`${enrolmentTileClasses} ${placeholderBlock}`} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`${enrolmentLabelClasses} flex h-[1lh] items-center`}>
          <span className={`${placeholderBlock} h-[0.7em] w-16`} />
        </span>
        <span className={`${enrolmentValueClasses} flex h-[1lh] items-center`}>
          <span className={`${placeholderBlock} h-[0.8em] w-32`} />
        </span>
        {Array.from({ length: noteLines }, (_, line) => (
          <span
            key={line}
            // One note of two lines: the top margin once.
            className={`${line === 0 ? enrolmentNoteClasses : "text-[0.78rem]"} flex h-[1lh] items-center`}
          >
            <span
              className={`${placeholderBlock} h-[0.7em] ${line === 0 ? "w-40" : "w-24"}`}
            />
          </span>
        ))}
      </div>
    </li>
  );
}

/**
 * "Your enrollment" before the access answer has come with its words (a
 * course page opened from another page, whose band is drawn from the
 * learner's list of courses until then): the panel at its usual size, its
 * heading in place and its rows pulsing, so the band does not grow when
 * they arrive. Each line keeps the height of the text it stands for.
 */
export function CourseEnrolmentDetailsPlaceholder() {
  return (
    <div className={enrolmentPanelClasses} aria-hidden="true">
      <h3 className="font-bold text-(--text)">Your enrollment</h3>
      <ul
        className={`${enrolmentListClasses} animate-pulse motion-reduce:animate-none`}
      >
        {/* The order under the date; the pace's note, which runs to two
            lines in the column beside the curriculum. */}
        <PlaceholderRow noteLines={1} />
        <PlaceholderRow noteLines={0} />
        <PlaceholderRow noteLines={2} />
      </ul>
    </div>
  );
}
