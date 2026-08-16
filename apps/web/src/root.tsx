import "@fontsource-variable/manrope";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import { ReadingModeEffects } from "./reading-mode/ReadingModeEffects";
import { getReadingModeBootstrapScript } from "./reading-mode/readingModePreferences";
import { getSurfaceDepthBootstrapScript } from "./settings/settingsPreferences";
import "./styles.css";
import "./shell-theme.css";
import "./reading-mode.css";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-palette="codex"
      data-reading-mode="false"
      data-reading-mode-texture="false"
      data-reading-mode-temperature="false"
      data-reading-mode-colors="full"
      data-page-tab-colors="follow-sidebar"
      data-elevated-surfaces="true"
      data-sidebar-menu-elevation="false"
      suppressHydrationWarning
    >
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="theme-color" content="#151718" />
        <script
          dangerouslySetInnerHTML={{ __html: getReadingModeBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getSurfaceDepthBootstrapScript() }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <div id="root">{children}</div>
        <Scripts />
        <ReadingModeEffects />
      </body>
    </html>
  );
}

export const meta = () => [
  { title: "UI/UX Design Mastery \u00B7 ProCodrr" },
  {
    name: "description",
    content: "ProCodrr learning workspace",
  },
];

export function HydrateFallback() {
  return null;
}

export default function Root() {
  return <Outlet />;
}
