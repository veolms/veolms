import type { ComponentType, CSSProperties } from "react";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { HeartIcon as Heart } from "@phosphor-icons/react/Heart";
import { HouseIcon as House } from "@phosphor-icons/react/House";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";

type PreviewIcon = ComponentType<{
  className?: string;
  size?: number;
  weight?: "duotone";
}>;
type MiniSurfacePreviewMode = "normal" | "dark" | "light" | "device";

const sidebarIconPreviewClass = [
  "settings-icon-preview grid h-35 w-51.75 flex-none basis-51.75",
  "content-start gap-2 rounded-xl px-2.5 py-3 text-(--accent-ink,var(--accent))",
  "[background:color-mix(in_srgb,var(--canvas)_91%,var(--accent)_9%)]",
  "max-[1120px]:w-42.5 max-[1120px]:basis-42.5",
  "max-[900px]:w-34 max-[900px]:basis-34 max-[900px]:py-2.75",
].join(" ");
const sidebarIconPreviewRowClass =
  "grid min-h-5.75 grid-cols-[22px_minmax(0,1fr)] items-center gap-2.25";

export interface MiniSurfaceProps {
  variant?: string;
  layout?: "framed" | "edge";
  previewMode?: MiniSurfacePreviewMode;
}

function MiniApp() {
  return (
    <span className="settings-mini-app">
      <span className="settings-mini-app__rail">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="settings-mini-app__body">
        <b />
        <em />
        <span>
          <i />
          <i />
        </span>
      </span>
    </span>
  );
}

export function MiniSurface({
  variant = "dark",
  layout = "framed",
  previewMode = "normal",
}: MiniSurfaceProps) {
  const isThemePreviewDark = previewMode === "dark";
  const isThemePreviewLight = previewMode === "light";
  const isDevicePreview = previewMode === "device";

  return (
    <span
      className={`settings-mini-surface settings-mini-surface--${variant} settings-mini-surface--${layout}${isDevicePreview ? " settings-mini-surface--device" : ""}${isThemePreviewLight ? " settings-mini-surface--forced-light" : ""}${isThemePreviewDark ? " settings-mini-surface--forced-dark" : ""}`}
      aria-hidden="true"
    >
      {isDevicePreview ? (
        <span className="settings-mini-surface__device-split">
          <span
            className={`settings-mini-surface__device-pane settings-mini-surface__device-pane--light settings-mini-surface--${variant} settings-mini-surface--forced-light`}
          >
            <MiniApp />
          </span>
          <span
            className={`settings-mini-surface__device-pane settings-mini-surface__device-pane--dark settings-mini-surface--${variant} settings-mini-surface--forced-dark`}
          >
            <MiniApp />
          </span>
        </span>
      ) : (
        <MiniApp />
      )}
    </span>
  );
}

const PREVIEW_NAVIGATION: readonly (readonly [PreviewIcon, string, string])[] =
  [
    [House, "#2e9bff", "Dashboard"],
    [Heart, "#ee4f72", "Wishlist"],
    [BookOpen, "#a26bff", "Courses"],
    [UsersThree, "#27c968", "Students"],
  ];

export interface SidebarIconPreviewProps {
  monochrome?: boolean;
  monoColor?: string;
}

export function SidebarIconPreview({
  monochrome = false,
  monoColor = "#9eacc0",
}: SidebarIconPreviewProps) {
  return (
    <span
      className={sidebarIconPreviewClass}
      style={
        monochrome
          ? ({
              "--preview-icon-color": monoColor,
              color: "var(--preview-icon-color, var(--accent))",
            } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
    >
      {PREVIEW_NAVIGATION.map(([Icon, color, label]) => (
        <span
          key={label}
          className={sidebarIconPreviewRowClass}
          style={monochrome ? undefined : { color }}
        >
          <Icon className="size-5.25 shrink-0" size={15} weight="duotone" />
          <b
            className={`min-w-0 truncate text-[0.78rem] font-[650] leading-[1.2] max-[900px]:text-[0.64rem] ${monochrome ? "text-(--text-secondary)" : "text-(--text)"}`}
          >
            {label}
          </b>
        </span>
      ))}
    </span>
  );
}
