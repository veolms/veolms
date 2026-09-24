import { useLayoutEffect, type ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import { installTabFocusVisibility } from "./accessibility/tabFocusVisibility";
import { fullAppStylesheet } from "./appStylesheet";
import manropeFontUrl from "./assets/fonts/manrope-core.woff2?url";
import procodrrLogoMark from "./assets/procodrr-logo-mark.svg";
import { getLearningPlayerBootstrapScript } from "./learning/learningPlayerPreferences";
import { getLearningShellBootstrapScript } from "./learning/learningShellPreferences";
import { getEarlyCourseCatalogueScript } from "./courses/courseCatalogueBootstrap";
import {
  API_BASE_URL_ORIGIN,
  getApiRequestUrl,
} from "./lib/apiBaseUrl";
import {
  EARLY_HLS_PRELOAD_URL_PLACEHOLDER,
  getEarlyHlsPreloadInlineScript,
} from "./learning/learningHlsInlineScript";
import { getVideoPlaybackCdnOrigin } from "./learning/videoPlaybackCdn";
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
  getSidebarPresentationBootstrapScript,
  getSidebarShellBootstrapScript,
} from "./shell/sidebarPreferences";
import {
  ACADEMY_THEME_VERSION,
  DEFAULT_ACADEMY_THEME,
  academyThemes,
} from "./themes";

interface LayoutProps {
  children: ReactNode;
}

const academyThemeIds = JSON.stringify(academyThemes.map(({ id }) => id));
const videoPlaybackCdnOrigin = getVideoPlaybackCdnOrigin();

const getAppearanceBootstrapScript = () =>
  `(()=>{const r=document.documentElement,p=${academyThemeIds};try{const t=localStorage.getItem("veolms-theme")||"dark";r.dataset.theme=t==="device"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t==="light"?"light":"dark"}catch{}try{const e=localStorage.getItem("veolms-randomize-academy-theme")==="true",s=sessionStorage.getItem("veolms-session-academy-theme"),l=localStorage.getItem("veolms-academy-theme"),c=localStorage.getItem("veolms-academy-theme-version")===${JSON.stringify(ACADEMY_THEME_VERSION)},v=e&&p.includes(s||"")?s:c&&p.includes(l||"")?l:${JSON.stringify(DEFAULT_ACADEMY_THEME)};r.dataset.palette=v}catch{}})();`;

const DEFAULT_ROOT_ATTRIBUTES: Record<string, string> = {
  lang: "en",
  "data-theme": "dark",
  "data-palette": "codex",
  "data-reading-mode": "false",
  "data-reading-mode-texture": "false",
  "data-reading-mode-temperature": "false",
  "data-reading-mode-colors": "full",
  "data-page-tab-colors": "follow-sidebar",
  "data-content-layout": "framed",
  "data-sidebar-header-layout": "inline",
  "data-sidebar-glow": "theme",
  "data-sidebar-glow-shape": "circle",
  "data-elevated-surfaces": "true",
  "data-hide-scrollbars": "true",
  "data-scrollbar-style": "theme",
  "data-sidebar-menu-elevation": "true",
  "data-sidebar-state": "expanded",
  "data-navigation-layout": "wide",
  "data-learning-curriculum-state": "expanded",
  "data-player-autoplay": "on",
  "data-player-muted": "false",
  "data-player-playback-rate": "1",
  "data-player-volume": "1",
  "data-collapsed-tooltips": "true",
  "data-collapsed-sidebar-logo": "true",
  "data-active-fill": "true",
  "data-control-radius": "balanced",
  "data-app-hydrated": "false",
  "data-tab-navigation": "false",
};

type InitialLayoutDomState = {
  rootAttributes: Record<string, string>;
  rootStyle: Record<string, string>;
  bodyAttributes: Record<string, string>;
};

const getInitialLayoutDomState = (): InitialLayoutDomState => {
  if (typeof document === "undefined") {
    return {
      rootAttributes: DEFAULT_ROOT_ATTRIBUTES,
      rootStyle: {},
      bodyAttributes: {},
    };
  }

  const rootAttributes = { ...DEFAULT_ROOT_ATTRIBUTES };
  const rootStyle: Record<string, string> = {};
  for (const attribute of Array.from(document.documentElement.attributes)) {
    if (attribute.name === "style") {
      for (
        let index = 0;
        index < document.documentElement.style.length;
        index++
      ) {
        const property = document.documentElement.style.item(index);
        if (property) {
          rootStyle[property] =
            document.documentElement.style.getPropertyValue(property);
        }
      }
      continue;
    }
    rootAttributes[attribute.name === "class" ? "className" : attribute.name] =
      attribute.value;
  }

  const bodyAttributes: Record<string, string> = {};
  if (document.body) {
    for (const attribute of Array.from(document.body.attributes)) {
      if (attribute.name === "style") continue;
      bodyAttributes[
        attribute.name === "class" ? "className" : attribute.name
      ] = attribute.value;
    }
  }

  return {
    rootAttributes,
    rootStyle,
    bodyAttributes,
  };
};

export function Layout({ children }: LayoutProps) {
  // The preference scripts run before hydration so they can prevent visual
  // flashes. Snapshot the already-mutated document into React's first render;
  // the server uses the deterministic defaults above.
  const initialLayoutDomState = getInitialLayoutDomState();

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
      data-hide-scrollbars="true"
      data-scrollbar-style="theme"
      data-sidebar-menu-elevation="true"
      data-sidebar-state="expanded"
      data-navigation-layout="wide"
      data-learning-curriculum-state="expanded"
      data-player-autoplay="on"
      data-player-muted="false"
      data-player-playback-rate="1"
      data-player-volume="1"
      data-collapsed-tooltips="true"
      data-collapsed-sidebar-logo="true"
      data-active-fill="true"
      data-control-radius="balanced"
      data-app-hydrated="false"
      data-tab-navigation="false"
      {...initialLayoutDomState.rootAttributes}
      style={initialLayoutDomState.rootStyle}
      // The head preference scripts must mutate the root before first paint;
      // those client-only values cannot be present in SSR HTML.
      suppressHydrationWarning
    >
      <head>
        <meta charSet="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#151718" />
        {API_BASE_URL_ORIGIN ? (
          <link
            rel="preconnect"
            href={API_BASE_URL_ORIGIN}
            crossOrigin="use-credentials"
          />
        ) : null}
        {videoPlaybackCdnOrigin ? (
          <link
            rel="preconnect"
            href={videoPlaybackCdnOrigin}
            crossOrigin="anonymous"
          />
        ) : null}
        <link rel="icon" type="image/svg+xml" href={procodrrLogoMark} />
        <link
          rel="preload"
          href={manropeFontUrl}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `${getSidebarShellBootstrapScript()}${getSidebarPresentationBootstrapScript()}${getLearningShellBootstrapScript()}${getLearningPlayerBootstrapScript()}`,
          }}
        />
        <Meta />
        <script
          dangerouslySetInnerHTML={{
            __html: getEarlyCourseCatalogueScript(
              getApiRequestUrl("courses?limit=50"),
            ),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: getEarlyHlsPreloadInlineScript(
              EARLY_HLS_PRELOAD_URL_PLACEHOLDER,
            ),
          }}
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
        {/* Shared shell styles stay linked for the initial view. Feature
            styles are loaded with their lazy page modules. In development,
            keep React Router from adding a second route stylesheet request. */}
        {!import.meta.env.DEV && <Links />}
      </head>
      <body {...initialLayoutDomState.bodyAttributes}>
        <div id="root">{children}</div>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(()=>{const e=document.getElementById("courses-hydrate-fallback");if(!e)return;if(location.pathname==="/courses"||location.pathname==="/")e.style.removeProperty("display");else e.style.display="none"})();',
          }}
        />
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
  const showCoursesFallback =
    typeof window !== "undefined" &&
    (window.location.pathname === "/courses" ||
      window.location.pathname === "/");

  return (
    <div
      id="courses-hydrate-fallback"
      aria-hidden="true"
      className="courses-app"
      style={showCoursesFallback ? undefined : { display: "none" }}
    >
      <aside className="courses-sidebar" />
      <div className="courses-main-frame">
        <main className="courses-main">
          <div className="mx-auto w-full max-w-screen-2xl">
            <div className="mb-8 space-y-3">
              <h1 className="text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)">
                Courses
              </h1>
              <p className="mt-1.5 hidden text-[0.88rem] leading-6 text-(--muted) min-[640px]:block">
                Browse courses and keep learning.
              </p>
            </div>
            <div className="mb-7 flex gap-3">
              <div className="h-10 w-24 rounded-full bg-(--track)" />
              <div className="h-10 w-28 rounded-full bg-(--track)" />
              <div className="h-10 w-28 rounded-full bg-(--track)" />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-xl border border-(--border) bg-(--surface)"
                >
                  <div className="aspect-video bg-(--track)" />
                  <div className="space-y-3 p-4">
                    <div className="h-5 w-4/5 rounded bg-(--track)" />
                    <div className="h-4 w-2/3 rounded bg-(--track)" />
                    <div className="h-9 w-28 rounded-lg bg-(--track)" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function SessionInitializer({ children }: { children: ReactNode }) {
  useCurrentUser();
  return <>{children}</>;
}

function HydrationMarker() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.appHydrated = "true";
    const removeTabFocusListeners = installTabFocusVisibility(root);

    return () => {
      removeTabFocusListeners();
      root.dataset.appHydrated = "false";
      root.dataset.tabNavigation = "false";
    };
  }, []);
  return null;
}

export default function Root() {
  return (
    <QueryProvider>
      <HydrationMarker />
      <SessionInitializer>
        <Outlet />
      </SessionInitializer>
    </QueryProvider>
  );
}
