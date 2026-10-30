import { memo, useState, useEffect } from "react";
import { getStudentInitials } from "./orderHelpers";

export interface StudentAvatarProps {
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const StudentAvatar = memo(function StudentAvatar({
  name,
  username,
  avatarUrl,
  size = "md",
  className = "",
}: StudentAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  // The order response carries the buyer's avatar, so a row never has to
  // fetch the student to show it.
  const effectiveAvatarUrl = avatarUrl || null;

  useEffect(() => {
    setImgFailed(false);
  }, [effectiveAvatarUrl]);

  const initials = getStudentInitials(name, username);

  const sizeClasses = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-10 w-10 text-xs",
    lg: "h-11 w-11 text-sm",
  }[size];

  const dim = size === "sm" ? 28 : size === "md" ? 40 : 44;

  if (effectiveAvatarUrl && !imgFailed) {
    return (
      <img
        src={effectiveAvatarUrl}
        alt=""
        width={dim}
        height={dim}
        onError={() => setImgFailed(true)}
        className={`${sizeClasses} shrink-0 rounded-full object-cover border border-(--border) shadow-xs ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} flex shrink-0 items-center justify-center rounded-full font-bold text-(--accent) border border-(--border) shadow-xs ${className}`}
      style={{
        background: "color-mix(in srgb, var(--accent) 15%, var(--surface))",
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
});
