import { getCourseBrandBadge } from "./orderHelpers";

const SIZES = {
  sm: "w-12 text-[0.5625rem]",
  md: "w-16 text-[0.625rem]",
  lg: "w-28 text-sm",
} as const;

/**
 * A course's picture at 16:9. Without one, the course's initials on a
 * colour stand in, so rows keep their shape.
 */
export function CourseThumb({
  title,
  url,
  size = "md",
}: {
  title: string;
  url: string | null | undefined;
  size?: keyof typeof SIZES;
}) {
  const box = `aspect-video shrink-0 overflow-hidden rounded-md ${SIZES[size]}`;
  if (url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${box} bg-(--border) object-cover`}
      />
    );
  }
  const badge = getCourseBrandBadge(title);
  return (
    <span
      aria-hidden="true"
      className={`${box} grid place-items-center font-extrabold tracking-tight`}
      style={{ backgroundColor: badge.bgColor, color: badge.textColor }}
    >
      {badge.label}
    </span>
  );
}
