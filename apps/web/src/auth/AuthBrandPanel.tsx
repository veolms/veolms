import {
  builtInWordmarkSvg,
  SiteWordmark,
  useSiteLogoImages,
} from "../site/SiteLogo";
import { useBuildArtworkIsOurs } from "../site/siteBrand";

const DEFAULT_CLASS_NAME = "auth-card__brand";

export interface AuthBrandMarkProps {
  className?: string;
}

/**
 * The academy's logo at the top of the sign-in screens: its uploaded logo
 * for the page's theme, else the build's wordmark, else its name.
 */
export function AuthBrandMark({
  className = DEFAULT_CLASS_NAME,
}: AuthBrandMarkProps) {
  const images = useSiteLogoImages();
  const buildArtwork = useBuildArtworkIsOurs();

  if (images || !buildArtwork) {
    return (
      <SiteWordmark
        decorative
        className={
          className === DEFAULT_CLASS_NAME ? "h-12 max-w-60" : className
        }
        nameClassName="text-2xl leading-none"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: builtInWordmarkSvg }}
    />
  );
}
