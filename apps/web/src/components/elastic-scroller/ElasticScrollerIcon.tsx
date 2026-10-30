import { ArrowFatUpIcon as ArrowFatUp } from "@phosphor-icons/react/ArrowFatUp";
import { ArrowLineUpIcon as ArrowLineUp } from "@phosphor-icons/react/ArrowLineUp";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { CaretDoubleUpIcon as CaretDoubleUp } from "@phosphor-icons/react/CaretDoubleUp";
import { CaretUpIcon as CaretUp } from "@phosphor-icons/react/CaretUp";
import type { ElasticScrollIcon } from "../../settings/settingsPreferences";

interface ElasticScrollerIconProps {
  icon: ElasticScrollIcon;
  className?: string;
  size?: number;
}

export function ElasticScrollerGlyph({
  icon,
  className,
  size = 20,
}: ElasticScrollerIconProps) {
  const props = {
    className,
    size,
    weight: "bold" as const,
    "aria-hidden": true,
    "data-elastic-scroll-icon": icon,
  };

  switch (icon) {
    case "caret":
      return <CaretUp {...props} />;
    case "double-caret":
      return <CaretDoubleUp {...props} />;
    case "bold-arrow":
      return <ArrowFatUp {...props} />;
    case "edge":
      return <ArrowLineUp {...props} />;
    default:
      return <ArrowUp {...props} />;
  }
}
