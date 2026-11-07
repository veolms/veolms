import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";

import { cn } from "../lib/utils";
import { initials } from "./chatFormat";

const SIZES = {
  sm: "size-8 text-[0.7rem]",
  md: "size-10 text-[0.8rem]",
  lg: "size-12 text-[0.95rem]",
  xl: "size-24 text-[1.8rem]",
} as const;

/** A person's picture or initials; groups get a group mark. */
export function ChatAvatar({
  name,
  url,
  group = false,
  size = "lg",
  className,
}: {
  name: string;
  url?: string | null;
  group?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const base = cn(
    "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold select-none",
    SIZES[size],
    className,
  );
  if (url) {
    return (
      <span className={base}>
        <img
          src={url}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        base,
        group
          ? "bg-[color-mix(in_srgb,var(--accent)_22%,var(--surface-strong))] text-(--accent-ink)"
          : "bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface-strong))] text-(--text-secondary)",
      )}
    >
      {group ? (
        <UsersThree weight="fill" className="size-[55%]" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
