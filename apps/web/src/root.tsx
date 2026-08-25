import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import { fullAppStylesheet } from "./appStylesheet";
import manropeFontUrl from "./assets/fonts/manrope-core.woff2?url";
import procodrrLogoMark from "./assets/procodrr-logo-mark.svg";
import { AppLoadingScreen } from "./bootstrap/AppLoadingScreen";
import { QueryProvider } from "./providers/query-provider";
import { ReadingModeEffects } from "./reading-mode/ReadingModeEffects";
import { getReadingModeBootstrapScript } from "./reading-mode/readingModePreferences";
import {
  getControlRadiusBootstrapScript,
  getScrollbarBootstrapScript,
  getSurfaceDepthBootstrapScript,
} from "./settings/settingsPreferences";
import { useCurrentUser } from "./services/auth";
import {
  ACADEMY_THEME_VERSION,
  DEFAULT_ACADEMY_THEME,
  academyThemes,
} from "./themes";

interface LayoutProps {
  children: ReactNode;
}

const academyThemeIds = JSON.stringify(academyThemes.map(({ id }) => id));

const getAppearanceBootstrapScript = () =>
  `(()=>{const r=document.documentElement,p=${academyThemeIds};try{const t=localStorage.getItem("veolms-theme")||"dark";r.dataset.theme=t==="device"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t==="light"?"light":"dark"}catch{}try{const e=localStorage.getItem("veolms-randomize-academy-theme")==="true",s=sessionStorage.getItem("veolms-session-academy-theme"),l=localStorage.getItem("veolms-academy-theme"),c=localStorage.getItem("veolms-academy-theme-version")===${JSON.stringify(ACADEMY_THEME_VERSION)},v=e&&p.includes(s||"")?s:c&&p.includes(l||"")?l:${JSON.stringify(DEFAULT_ACADEMY_THEME)};r.dataset.palette=v}catch{}})();`;

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
      data-content-layout="framed"
      data-sidebar-header-layout="inline"
      data-sidebar-glow="theme"
      data-sidebar-glow-shape="circle"
      data-elevated-surfaces="true"
      data-hide-scrollbars="false"
      data-scrollbar-style="theme"
      data-sidebar-menu-elevation="true"
      data-control-radius="balanced"
      suppressHydrationWarning
    >
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="theme-color" content="#151718" />
        <link rel="icon" type="image/svg+xml" href={procodrrLogoMark} />
        <link
          rel="preload"
          href={manropeFontUrl}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{ __html: getAppearanceBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getReadingModeBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getSurfaceDepthBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{ __html: getScrollbarBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: getControlRadiusBootstrapScript(),
          }}
        />
        <link rel="stylesheet" href={fullAppStylesheet} />
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
  { title: "ProCodrr \u00B7 Learn, build, and keep moving" },
  {
    name: "description",
    content:
      "Continue your courses, track learning progress, and explore practical developer education in ProCodrr.",
  },
];

export function HydrateFallback() {
  return <AppLoadingScreen />;
}

function SessionInitializer({ children }: { children: ReactNode }) {
  useCurrentUser();
  return <>{children}</>;
}

export default function Root() {
  return (
    <QueryProvider>
      <SessionInitializer>
        <Outlet />
      </SessionInitializer>
    </QueryProvider>
  );
}
