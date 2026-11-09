/** The host's picture, or their initial when they have none. */
export function WorkshopHostAvatar({
  name,
  avatarUrl,
  size = 22,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="grid shrink-0 place-items-center rounded-full bg-(--accent)/15 text-[11px] font-bold text-(--accent)"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
