import { useState } from "react";
import logoDarkSvg from "../assets/procodrr-logo-dark.svg?raw";
import builtInIconUrl from "../assets/procodrr-logo-mark.svg";
import { cn } from "../lib/utils";
import { BUILD_HAS_OWN_ARTWORK, useSiteBrandAssets } from "./siteBrand";
import { useSiteName } from "./siteName";

/** The build's own wordmark, drawn in the text colour of where it sits. */
export const builtInWordmarkSvg = logoDarkSvg.replace(
  /fill="black"/g,
  'fill="currentColor"',
);

export { builtInIconUrl };

/**
 * The academy's logo for this page's theme: the light pages' logo, or the
 * dark pages' one on a dark page; each stands in for the other when only
 * one was uploaded. Null when there is neither.
 */
export function useSiteLogoImages(): { light: string; dark: string } | null {
  const { logoLightUrl, logoDarkUrl } = useSiteBrandAssets();
  const light = logoLightUrl ?? logoDarkUrl;
  const dark = logoDarkUrl ?? logoLightUrl;
  return light && dark ? { light, dark } : null;
}

/** The academy's name, its first letter in the theme's accent. */
export function SiteNameWordmark({ className }: { className?: string }) {
  const name = useSiteName();
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center truncate font-bold tracking-[-0.02em] text-(--text)",
        className,
      )}
    >
      <span className="text-(--accent)">{name.charAt(0)}</span>
      <span className="truncate">{name.slice(1)}</span>
    </span>
  );
}

/**
 * The site's wordmark: the academy's uploaded logo for the page's theme,
 * else the build's own wordmark, else the academy's name. `className` sizes
 * it (its height); the image keeps its proportions within.
 */
export function SiteWordmark({
  className,
  nameClassName,
  decorative = false,
}: {
  className?: string;
  /** For the academy's name, when it is shown instead of a logo. */
  nameClassName?: string;
  /** Hidden from screen readers when the name is announced beside it. */
  decorative?: boolean;
}) {
  const name = useSiteName();
  const images = useSiteLogoImages();
  // An address that failed to load: the fallback shows instead.
  const [failed, setFailed] = useState<string | null>(null);
  const usable =
    images && failed !== images.light && failed !== images.dark ? images : null;

  if (usable) {
    const imageClass =
      "block h-full w-auto max-w-full object-contain object-left";
    return (
      <span
        className={cn("inline-flex min-w-0 items-center", className)}
        {...(decorative ? { "aria-hidden": true } : {})}
      >
        {usable.light === usable.dark ? (
          <img
            alt={decorative ? "" : name}
            className={imageClass}
            src={usable.light}
            onError={() => setFailed(usable.light)}
          />
        ) : (
          <>
            <img
              alt={decorative ? "" : name}
              className={cn(imageClass, "in-data-[theme=dark]:hidden!")}
              src={usable.light}
              onError={() => setFailed(usable.light)}
            />
            <img
              alt={decorative ? "" : name}
              className={cn(imageClass, "hidden! in-data-[theme=dark]:block!")}
              src={usable.dark}
              onError={() => setFailed(usable.dark)}
            />
          </>
        )}
      </span>
    );
  }

  if (BUILD_HAS_OWN_ARTWORK) {
    return (
      <span
        className={cn(
          "inline-flex text-(--text) [&_svg]:h-full [&_svg]:w-auto",
          className,
        )}
        {...(decorative
          ? { "aria-hidden": true }
          : { role: "img", "aria-label": name })}
        dangerouslySetInnerHTML={{ __html: builtInWordmarkSvg }}
      />
    );
  }

  return (
    <span
      className={cn("inline-flex min-w-0 items-center", className)}
      {...(decorative ? { "aria-hidden": true } : {})}
    >
      <SiteNameWordmark className={nameClassName ?? "text-xl leading-none"} />
    </span>
  );
}

/**
 * The site's square icon: the academy's uploaded icon, else the build's
 * own, else the academy's first letter on the theme's accent. Always
 * decorative: the name is announced by what it sits in.
 */
export function SiteIcon({ className }: { className?: string }) {
  const name = useSiteName();
  const { iconUrl } = useSiteBrandAssets();
  const [failed, setFailed] = useState<string | null>(null);

  if (iconUrl && failed !== iconUrl) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={cn("block size-8 rounded-lg object-cover", className)}
        src={iconUrl}
        onError={() => setFailed(iconUrl)}
      />
    );
  }

  if (BUILD_HAS_OWN_ARTWORK) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={cn("block size-8 object-contain", className)}
        src={builtInIconUrl}
        width={115}
        height={136}
      />
    );
  }

  return <SiteLetterIcon name={name} className={className} />;
}

/** The academy's first letter on the theme's accent. */
export function SiteLetterIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 place-items-center rounded-lg bg-(--accent) text-base leading-none font-bold text-(--on-accent)",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
}
