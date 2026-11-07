import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { useState } from "react";

import { cn } from "../lib/utils";
import { initials } from "./chatFormat";

const SIZES = {
  sm: "size-8 text-[0.7rem]",
  md: "size-10 text-[0.82rem]",
  lg: "size-12 text-[0.95rem]",
  xl: "size-24 text-[1.9rem]",
} as const;

/** Soft colours for initials, picked from the name so each person keeps one. */
const TONES = [
  "#e5484d",
  "#e93d82",
  "#8e4ec6",
  "#6e56cf",
  "#3e63dd",
  "#0090ff",
  "#00a2c7",
  "#12a594",
  "#30a46c",
  "#f76b15",
  "#ad7f58",
  "#8d8d86",
] as const;

function toneFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length]!;
}

/**
 * A person's picture (their photo, or the avatar made for them at sign-up);
 * when there is none or it fails to load, two initials on a colour of their
 * own, as in WhatsApp. Groups get a group mark.
 */
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
  const [failed, setFailed] = useState<string | null>(null);
  const base = cn(
    "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none",
    SIZES[size],
    className,
  );
  if (url && failed !== url) {
    return (
      <span className={cn(base, "bg-(--chat-input)")}>
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(url)}
          className="size-full object-cover"
        />
      </span>
    );
  }
  if (group) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          base,
          "bg-[color-mix(in_srgb,var(--accent)_22%,var(--surface-strong))] text-(--accent-ink)",
        )}
      >
        <UsersThree weight="fill" className="size-[55%]" />
      </span>
    );
  }
  const tone = toneFor(name);
  return (
    <span
      aria-hidden="true"
      className={base}
      style={{
        background: `color-mix(in srgb, ${tone} 26%, var(--surface-strong))`,
        color: `color-mix(in srgb, ${tone} 70%, var(--text))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
