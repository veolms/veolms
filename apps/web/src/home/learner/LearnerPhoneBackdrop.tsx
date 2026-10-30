import { phoneBackdropClasses } from "./learnerHeroLayout";

/**
 * The light behind a phone's hero copy: a glow in the theme's accent from
 * the hero's top right corner (see `phoneBackdropClasses`).
 */
export function LearnerPhoneBackdrop({
  className = "",
}: {
  className?: string;
} = {}) {
  return (
    <div
      aria-hidden="true"
      className={`${phoneBackdropClasses} ${className}`}
    />
  );
}
