/**
 * The grip in the middle of the gutter between the lesson and the course
 * content. It only shows where to grab: the rail around it (`group/rail`)
 * owns the pointer and keyboard handling, so the whole gutter resizes.
 *
 * While the course content is collapsed there is no gutter, so the grip
 * stays out of the way until the rail at the lesson's edge is hovered.
 */
export function CurriculumResizeGrip() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none block h-16 w-1 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_54%,var(--border))] opacity-50 transition-[height,opacity,background-color] duration-160 ease-out group-hover/rail:h-20 group-hover/rail:bg-(--accent) group-hover/rail:opacity-100 group-focus-visible/rail:h-20 group-focus-visible/rail:bg-(--accent) group-focus-visible/rail:opacity-100 motion-reduce:transition-none [[data-learning-curriculum-state=collapsed]_&]:opacity-0 [[data-learning-curriculum-state=collapsed]_&]:group-hover/rail:opacity-100 [.is-curriculum-resizing_&]:h-20 [.is-curriculum-resizing_&]:bg-(--accent) [.is-curriculum-resizing_&]:opacity-100"
    />
  );
}
