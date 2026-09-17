import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";

interface DiscussionAvatarProps {
  src?: string | null;
  className: string;
}

export function DiscussionAvatar({ src, className }: DiscussionAvatarProps) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--text)_16%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_78%,var(--canvas))] text-(--muted) ${className}`}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <UserCircle className="size-[68%]" weight="duotone" />
      )}
    </span>
  );
}
