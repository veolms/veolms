const PLACEHOLDER_SHAPE_CLASS =
  "block animate-pulse bg-[color-mix(in_srgb,var(--text)_12%,transparent)] motion-reduce:animate-none";

/**
 * Stands in for the profile button while the session is still being checked
 * and nothing is remembered about the account, so the sidebar neither shows
 * "Login" to someone who is signed in nor jumps when the answer arrives. It
 * takes the profile button's classes and repeats its layout: the picture
 * frame, then the name and subtitle lines.
 */
export function ProfileButtonPlaceholder({ className }: { className: string }) {
  return (
    <div
      className={`${className} pointer-events-none`}
      role="status"
      aria-busy="true"
      aria-label="Loading account"
    >
      <span className="courses-profile__avatar-wrap">
        <span className={`${PLACEHOLDER_SHAPE_CLASS} size-full rounded-full`} />
      </span>
      <span className="gap-0!" aria-hidden="true">
        <span className={`${PLACEHOLDER_SHAPE_CLASS} h-3.5 w-24 rounded-md`} />
        <span
          className={`${PLACEHOLDER_SHAPE_CLASS} mt-2 h-3 w-16 rounded-md`}
        />
      </span>
    </div>
  );
}
