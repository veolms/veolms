import { useIconPack } from "./iconPack";
import { iconRegistry } from "./registry";
import type { IconEmphasis, IconName } from "./registry";

export interface IconProps {
  name: IconName;
  size: number;
  emphasis?: IconEmphasis;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

const LUCIDE_STROKE: Record<IconEmphasis, number> = {
  regular: 2,
  bold: 2.5,
  fill: 2.5,
};

export function Icon({
  name,
  size,
  emphasis = "regular",
  className,
  "aria-hidden": ariaHidden,
}: IconProps) {
  const pack = useIconPack();
  const Glyph = iconRegistry[name][pack];

  return pack === "phosphor" ? (
    <Glyph
      aria-hidden={ariaHidden}
      className={className}
      size={size}
      weight={emphasis}
    />
  ) : (
    <Glyph
      aria-hidden={ariaHidden}
      className={className}
      size={size}
      strokeWidth={LUCIDE_STROKE[emphasis]}
    />
  );
}
