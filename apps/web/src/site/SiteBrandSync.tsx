import { useEffect, useState } from "react";
import builtInIconUrl from "../assets/procodrr-logo-mark.svg";
import { usePublicPlatformSettings } from "../services/platform";
import {
  BUILD_HAS_OWN_ARTWORK,
  setSiteBrandAssets,
  useSiteBrandAssets,
} from "./siteBrand";
import { useSiteName } from "./siteName";

/** The build's own icon for a phone's home screen. */
const BUILT_IN_TOUCH_ICON = "/static/app-icon-192.png";

/**
 * Reads the academy's website artwork with the public settings and
 * remembers it for the next visit. Renders nothing.
 */
export function SiteBrandSync() {
  const branding = usePublicPlatformSettings().data?.branding;

  useEffect(() => {
    if (branding) setSiteBrandAssets(branding);
  }, [branding]);

  return null;
}

/** The academy's first letter on the theme's accent, as an SVG address. */
function letterIconUrl(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase() || "·";
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue("--accent").trim() || "#4f46e5";
  const foreground = styles.getPropertyValue("--on-accent").trim() || "#ffffff";
  const escape = (value: string) =>
    value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${escape(background)}"/><text x="32" y="44" font-family="system-ui,sans-serif" font-size="36" font-weight="700" text-anchor="middle" fill="${escape(foreground)}">${escape(letter)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The browser tab's icon and the home-screen icon, in the page's head: the
 * academy's uploaded icon, else the build's own, else its first letter.
 * Prerendered pages carry the build's own until the browser runs.
 *
 * Its own component, so a change re-renders only these links: the head's
 * other tags (the title above all) are left as they are.
 */
export function SiteIconLinks() {
  const { icon, touchIcon } = useSiteIconLinks();
  return (
    <>
      <link rel="apple-touch-icon" href={touchIcon} />
      <link rel="icon" type={icon.type} href={icon.href} />
    </>
  );
}

function useSiteIconLinks(): {
  icon: { href: string; type?: string };
  touchIcon: string;
} {
  const { iconUrl } = useSiteBrandAssets();
  const name = useSiteName();
  // Worked out in the browser: it reads the theme's colours.
  const [letterIcon, setLetterIcon] = useState<string | null>(null);

  useEffect(() => {
    if (iconUrl || BUILD_HAS_OWN_ARTWORK) return;
    setLetterIcon(letterIconUrl(name));
  }, [iconUrl, name]);

  if (iconUrl) return { icon: { href: iconUrl }, touchIcon: iconUrl };
  if (!BUILD_HAS_OWN_ARTWORK && letterIcon) {
    return {
      icon: { href: letterIcon, type: "image/svg+xml" },
      touchIcon: letterIcon,
    };
  }
  return {
    icon: { href: builtInIconUrl, type: "image/svg+xml" },
    touchIcon: BUILT_IN_TOUCH_ICON,
  };
}
