import type { ComponentType, CSSProperties } from "react";
import { BookOpen, Heart, House, UsersThree } from "@phosphor-icons/react";

type PreviewIcon = ComponentType<{ size?: number; weight?: "duotone" }>;
type MiniSurfacePreviewMode = "normal" | "dark" | "light" | "device";

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
    [BookOpen, "#a26bff", "Explore Courses"],
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
      className={`settings-icon-preview ${monochrome ? "settings-icon-preview--mono" : "settings-icon-preview--multi"}`}
      style={
        monochrome
          ? ({ "--preview-icon-color": monoColor } as CSSProperties)
          : undefined
      }
      aria-hidden="true"
    >
      {PREVIEW_NAVIGATION.map(([Icon, color, label], index) => (
        <span key={index} style={monochrome ? undefined : { color }}>
          <Icon size={15} weight="duotone" />
          <b>{label}</b>
        </span>
      ))}
    </span>
  );
}
