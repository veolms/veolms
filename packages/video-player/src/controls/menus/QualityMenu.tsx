import { usePlayerController } from "../../react/context";
import { useQuality } from "../../react/usePlayerState";
import { usePlayerTheme } from "../../themes/PlayerThemeContext";
import { MenuTriggerContent } from "./MenuTriggerContent";
import { PlayerMenuItem } from "./PlayerMenuItem";
import { PopoverMenu } from "./PopoverMenu";
import type { PlayerMenuCommonProps } from "./menuTypes";

export interface QualityMenuProps extends PlayerMenuCommonProps {
  onQualityChange?: (qualityId: string | null) => void;
}

export function QualityMenu({
  align,
  className,
  defaultOpen,
  disabled,
  onOpenChange,
  onQualityChange,
  open,
  panelClassName,
  side,
  trigger,
  triggerClassName,
}: QualityMenuProps) {
  const controller = usePlayerController();
  const QualityIcon = usePlayerTheme().icons.quality;
  const { auto, qualities, selectedId } = useQuality();
  const activeQuality =
    qualities.find((quality) => quality.id === selectedId) ??
    qualities.find((quality) => quality.active);
  const currentLabel = auto ? "Auto" : (activeQuality?.label ?? "Quality");

  return (
    <PopoverMenu
      label={`Video quality, ${currentLabel}`}
      menuLabel="Video quality"
      trigger={
        trigger ?? (
          <MenuTriggerContent
            icon={<QualityIcon className="size-4" />}
            value={currentLabel}
          />
        )
      }
      className={className}
      triggerClassName={triggerClassName}
      panelClassName={panelClassName}
      side={side}
      align={align}
      disabled={disabled || qualities.length === 0}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <PlayerMenuItem
        label="Auto"
        description={
          activeQuality
            ? `Currently ${activeQuality.label}`
            : "Adapts to your connection"
        }
        selected={auto}
        onClick={() => {
          controller.selectQuality(null);
          onQualityChange?.(null);
        }}
      />
      {qualities.map((quality) => (
        <PlayerMenuItem
          key={quality.id}
          label={quality.label}
          description={formatQualityDetails(quality)}
          selected={!auto && quality.id === selectedId}
          onClick={() => {
            controller.selectQuality(quality.id);
            onQualityChange?.(quality.id);
          }}
        />
      ))}
    </PopoverMenu>
  );
}

function formatQualityDetails(quality: {
  width?: number;
  height?: number;
  frameRate?: number;
  hdr?: string;
}): string | undefined {
  const parts: string[] = [];
  if (quality.width && quality.height)
    parts.push(`${quality.width} × ${quality.height}`);
  if (quality.frameRate) parts.push(`${Math.round(quality.frameRate)} fps`);
  if (quality.hdr) parts.push(quality.hdr);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
