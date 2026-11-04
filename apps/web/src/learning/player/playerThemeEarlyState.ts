import { LEARNING_PREFERENCES_KEY } from "../../settings/settingsPreferences";
import { PLATFORM_APPEARANCE_STORAGE_KEY } from "../../store/appearanceDefaults";

/**
 * The player theme this browser last played in, as `useLearningPlayerTheme`
 * resolved it (a saved choice, else the academy's default, and only a theme
 * that is offered). The head script draws a reloaded lesson page in it.
 */
export const PLAYER_THEME_COPY_KEY = "veolms-player-theme";

const DEFAULT_THEME_ID = "youtube";

export function rememberPlayerTheme(themeId: string) {
  try {
    if (window.localStorage.getItem(PLAYER_THEME_COPY_KEY) !== themeId) {
      window.localStorage.setItem(PLAYER_THEME_COPY_KEY, themeId);
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  document.documentElement.dataset.playerThemeEarly = themeId;
}

/**
 * The lessons list's theme the head script drew the page in (none for
 * YouTube), for the render that hydrates that drawing.
 */
export function readEarlyLessonListTheme(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__VEO_BOOTSTRAP__?.lessonListTheme;
}

/**
 * A lesson page is prerendered once for everyone, so its player and its
 * lessons list are drawn as YouTube. Before anything is painted this script
 * works out the viewer's theme (the copy above, else the saved choice, else
 * the academy's default as this browser last heard it) and:
 *
 * - names it on `<html>` as `data-player-theme-early`, so the stand-in
 *   player's YouTube controls stay hidden until they are drawn in that
 *   theme (see lesson-themes.css), instead of turning into it;
 * - gives the page's lessons column `data-lesson-theme` as the parser adds
 *   it, so the list is in the theme from the first paint; hydration reads
 *   the same value back (`readEarlyLessonListTheme`).
 */
export const getPlayerThemeBootstrapScript = () =>
  `(()=>{const r=document.documentElement;const ok=v=>typeof v==="string"&&/^[a-z][a-z0-9-]{0,39}$/.test(v);const read=k=>{try{return localStorage.getItem(k)}catch{return null}};const json=k=>{try{return JSON.parse(read(k)||"null")}catch{return null}};let t=read(${JSON.stringify(PLAYER_THEME_COPY_KEY)});if(!ok(t)){const p=json(${JSON.stringify(LEARNING_PREFERENCES_KEY)});const a=json(${JSON.stringify(PLATFORM_APPEARANCE_STORAGE_KEY)});t=p&&ok(p.playerThemeChoice)?p.playerThemeChoice:a&&ok(a.defaultVideoPlayerTheme)?a.defaultVideoPlayerTheme:${JSON.stringify(DEFAULT_THEME_ID)}}r.dataset.playerThemeEarly=t;const l=t===${JSON.stringify(DEFAULT_THEME_ID)}?"":t;window.__VEO_BOOTSTRAP__={...window.__VEO_BOOTSTRAP__,playerTheme:t,lessonListTheme:l||undefined};if(!l||!location.pathname.startsWith("/learn/"))return;const s=".learning-workspace__curriculum-column";const fill=n=>{if(!(n instanceof Element))return;const f=e=>{if(e.getAttribute("data-lesson-theme")!==l)e.setAttribute("data-lesson-theme",l)};if(n.matches(s))f(n);for(const e of n.querySelectorAll(s))f(e)};const o=new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes)fill(n)});o.observe(r,{childList:true,subtree:true});document.addEventListener("DOMContentLoaded",()=>{o.disconnect();fill(document.body)},{once:true})})();`;
