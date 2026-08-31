import { lazy, Suspense, type ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, useLocation } from "react-router";
import { fullAppStylesheet } from "./appStylesheet";
import manropeFontUrl from "./assets/fonts/manrope-core.woff2?url";
import procodrrLogoMark from "./assets/procodrr-logo-mark.svg";
import { AppLoadingScreen } from "./bootstrap/AppLoadingScreen";
import { ReadingModeEffects } from "./reading-mode/ReadingModeEffects";
import { getReadingModeBootstrapScript } from "./reading-mode/readingModePreferences";
import {
  isCoursesPublicPath,
  isLearningPath,
  isPublicAcademyPath,
} from "./routing/routeAccess";
import {
  getControlRadiusBootstrapScript,
  getScrollbarBootstrapScript,
  getSurfaceDepthBootstrapScript,
} from "./settings/settingsPreferences";
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

const getLayoutGeometryBootstrapScript = () =>
  `(()=>{const r=document.documentElement,n=(k,d,a,b)=>{try{const s=localStorage.getItem(k);if(s===null||s.trim()==="")return d;const v=Number(s);return Number.isFinite(v)?Math.min(b,Math.max(a,v)):d}catch{return d}},g=k=>{try{return localStorage.getItem(k)}catch{return null}};r.style.setProperty("--sidebar-initial-width",n("veolms-sidebar-width",300,220,300)+"px");r.style.setProperty("--learning-initial-curriculum-width",n("veolms-curriculum-width",400,300,560)+"px");const s=g("veolms-sidebar-mode"),l=g("veolms-sidebar-collapsed"),v=s==="expanded"||s==="collapsed"||s==="hidden"?s:l!==null?(l==="true"?"collapsed":"expanded"):(matchMedia("(max-width: 1080px)").matches?"collapsed":"expanded");r.dataset.sidebarInitialMode=v})();`;

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
      data-sidebar-initial-mode="expanded"
      data-elevated-surfaces="true"
      data-hide-scrollbars="true"
      data-scrollbar-style="theme"
      data-sidebar-menu-elevation="true"
      data-control-radius="balanced"
      suppressHydrationWarning
    >
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#151718" />
        <link rel="icon" type="image/svg+xml" href={procodrrLogoMark} />
        <meta data-full-app-css content={fullAppStylesheet} />
        <link
          rel="stylesheet"
          href={fullAppStylesheet}
          data-route-app-css="true"
        />
        <link
          rel="preload"
          href={manropeFontUrl}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <Meta />
        <Links />
        <script
          dangerouslySetInnerHTML={{ __html: getAppearanceBootstrapScript() }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: getLayoutGeometryBootstrapScript(),
          }}
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

const AuthenticatedRootRuntime = lazy(() =>
  import("./bootstrap/AuthenticatedRootRuntime").then((module) => ({
    default: module.AuthenticatedRootRuntime,
  })),
);

export default function Root() {
  const location = useLocation();
  const publicLearningRoute =
    isPublicAcademyPath(location.pathname) &&
    isLearningPath(location.pathname) &&
    !isCoursesPublicPath(location.pathname);

  if (publicLearningRoute) return <Outlet />;

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <AuthenticatedRootRuntime>
        <Outlet />
      </AuthenticatedRootRuntime>
    </Suspense>
  );
}
