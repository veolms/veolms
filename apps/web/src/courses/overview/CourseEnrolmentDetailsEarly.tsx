import type { CSSProperties, ReactNode } from "react";
import { CalendarCheck } from "@phosphor-icons/react/CalendarCheck";
import { Clock } from "@phosphor-icons/react/Clock";
import { Infinity as InfinityIcon } from "@phosphor-icons/react/Infinity";
import { TrendUp } from "@phosphor-icons/react/TrendUp";
import { Warning } from "@phosphor-icons/react/Warning";
import {
  enrolmentEndingLabelClasses,
  enrolmentEndingRowClasses,
  enrolmentLabelClasses,
  enrolmentListClasses,
  enrolmentNeutralTileClasses,
  enrolmentNoteClasses,
  enrolmentPaceTileClasses,
  enrolmentPanelClasses,
  enrolmentTileClasses,
  enrolmentToneClasses,
  enrolmentValueClasses,
  invoiceLinkClasses,
} from "./CourseEnrolmentDetails";

/** Words the head's style writes, as `content` (see `courseCardEarlyState`). */
function Words({
  variable,
  className = "",
}: {
  variable: string;
  className?: string;
}) {
  return (
    <span
      className={`${className} after:content-(--words)`}
      style={{ "--words": `var(${variable})` } as CSSProperties}
    />
  );
}

function Tile({
  tone,
  className,
  children,
}: {
  /** The access tones it is shown for, space-separated. */
  tone?: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${enrolmentTileClasses} ${className}`}
      data-course-early-tone={tone}
    >
      {children}
    </span>
  );
}

/**
 * `CourseEnrolmentDetails` before the page's scripts have run, inside
 * `CourseLearnerProgressBarEarly`: the same panel, its words written by the
 * style the document's head builds from this tab's copy of them (see
 * `enrolmentWordsCopy`). Each form a row can take is here; the style shows
 * the one for the learner's access (`data-course-early-tone`) and the notes
 * that have something to say. Keep the two looking the same.
 */
export function CourseEnrolmentDetailsEarly() {
  return (
    <div className={enrolmentPanelClasses}>
      <h3 className="font-bold text-(--text)">Your enrollment</h3>
      <ul className={enrolmentListClasses}>
        <li className="flex min-w-0 gap-3">
          <Tile className={enrolmentNeutralTileClasses}>
            <CalendarCheck size={18} />
          </Tile>
          <div className="min-w-0">
            <p className={enrolmentLabelClasses}>Enrolled on</p>
            <p className={enrolmentValueClasses}>
              <Words variable="--course-early-enrolled-on" />{" "}
              <Words
                variable="--course-early-enrolled-ago"
                className="font-normal text-(--muted)"
              />
            </p>
            <p className={enrolmentNoteClasses}>
              <Words variable="--course-early-order" />
              <span className="hidden" data-course-early-invoice="">
                {" · "}
                <span className={invoiceLinkClasses}>Invoice</span>
              </span>
            </p>
          </div>
        </li>

        <li
          className={enrolmentEndingRowClasses}
          data-course-early-tone="ending"
        >
          <Tile className={enrolmentToneClasses.ending.tile}>
            <Warning size={18} />
          </Tile>
          <div className="min-w-0">
            <p className={enrolmentEndingLabelClasses}>
              <Words variable="--course-early-access-label" />
            </p>
            <p className={enrolmentValueClasses}>
              <Words variable="--course-early-access-value" />{" "}
              <Words
                variable="--course-early-access-remaining"
                className={enrolmentToneClasses.ending.remaining}
              />
            </p>
          </div>
        </li>
        <li
          className="flex min-w-0 gap-3"
          data-course-early-tone="lifetime active ended"
        >
          <Tile tone="lifetime" className={enrolmentToneClasses.lifetime.tile}>
            <InfinityIcon size={18} />
          </Tile>
          <Tile tone="active" className={enrolmentToneClasses.active.tile}>
            <Clock size={18} />
          </Tile>
          <Tile tone="ended" className={enrolmentToneClasses.ended.tile}>
            <Clock size={18} />
          </Tile>
          <div className="min-w-0">
            <p className={enrolmentLabelClasses}>
              <Words variable="--course-early-access-label" />
            </p>
            <p className={enrolmentValueClasses}>
              <Words variable="--course-early-access-value" />{" "}
              {(["lifetime", "active", "ended"] as const).map((tone) => (
                <span key={tone} data-course-early-tone={tone}>
                  <Words
                    variable="--course-early-access-remaining"
                    className={`font-normal ${enrolmentToneClasses[tone].remaining}`}
                  />
                </span>
              ))}
            </p>
            <p
              className={`${enrolmentNoteClasses} hidden`}
              data-course-early-access-note=""
            >
              <Words variable="--course-early-access-note" />
            </p>
          </div>
        </li>

        <li className="flex min-w-0 gap-3">
          <Tile className={enrolmentPaceTileClasses}>
            <TrendUp size={18} />
          </Tile>
          <div className="min-w-0">
            <p className={enrolmentLabelClasses}>Your pace</p>
            <p className={enrolmentValueClasses}>
              <Words variable="--course-early-pace" />
            </p>
            <p
              className={`${enrolmentNoteClasses} hidden`}
              data-course-early-pace-note=""
            >
              <Words variable="--course-early-pace-note" />
            </p>
          </div>
        </li>
      </ul>
    </div>
  );
}
