import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import {
  PLATFORM_ICON_MIN_SIDE,
  type PlatformBrandingSettings,
} from "@veolms/contracts";
import { Button } from "../components/Button";
import { SettingsSection } from "../home-page-settings/homePageSettingsControls";
import { LogoUploadField } from "../home-page-settings/LogoUploadField";
import {
  usePlatformSettings,
  useRemoveBrandAsset,
  useUploadBrandAsset,
} from "../services/platform";
import { BUILD_HAS_OWN_ARTWORK } from "../site/siteBrand";
import {
  builtInIconUrl,
  builtInWordmarkSvg,
  SiteLetterIcon,
  SiteNameWordmark,
} from "../site/SiteLogo";
import { useSiteName } from "../site/siteName";

/**
 * The website's logo for light pages and for dark pages, and its square
 * icon: what the sidebar, the sign-in screens, the legal pages, loading
 * screens and the browser tab show. The General tab of the Platform page.
 */
export function WebsiteBrandSection({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const settingsQuery = usePlatformSettings();
  const branding = settingsQuery.data?.settings.branding;

  return (
    <SettingsSection
      id="website-brand-heading"
      title="Website logo and icon"
      description={`Shown across your academy's website: the sidebar, sign-in, legal pages, loading screens and the browser tab. Without them, the site shows ${
        BUILD_HAS_OWN_ARTWORK ? "its built-in logo" : "your academy's name"
      }.`}
    >
      {settingsQuery.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-(--muted)">
          <CircleNotch size={16} className="animate-spin" />
          Loading…
        </p>
      ) : settingsQuery.isError || !branding ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-(--muted)">
            The website&apos;s logo and icon could not be loaded.
          </p>
          <Button onClick={() => void settingsQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <WebsiteBrandFields branding={branding} setNotice={setNotice} />
      )}
    </SettingsSection>
  );
}

function WebsiteBrandFields({
  branding,
  setNotice,
}: {
  branding: PlatformBrandingSettings;
  setNotice?: (message: string) => void;
}) {
  const name = useSiteName();
  const uploadLight = useUploadBrandAsset("logo-light");
  const removeLight = useRemoveBrandAsset("logo-light");
  const uploadDark = useUploadBrandAsset("logo-dark");
  const removeDark = useRemoveBrandAsset("logo-dark");
  const uploadIcon = useUploadBrandAsset("icon");
  const removeIcon = useRemoveBrandAsset("icon");

  /** What a page shows where there is no uploaded logo, on its surface. */
  const wordmarkFallback = (
    surface: "light" | "dark",
    otherLogo: string | null,
  ) =>
    otherLogo ? (
      <img alt={name} className="block h-8 w-auto max-w-60" src={otherLogo} />
    ) : BUILD_HAS_OWN_ARTWORK ? (
      <span
        aria-hidden="true"
        className={`inline-flex h-8 [&_svg]:h-full [&_svg]:w-auto ${
          surface === "dark" ? "text-[#F3F4F6]" : "text-[#111827]"
        }`}
        dangerouslySetInnerHTML={{ __html: builtInWordmarkSvg }}
      />
    ) : (
      <SiteNameWordmark
        className={`text-2xl leading-8 ${
          surface === "dark" ? "text-[#F3F4F6]!" : "text-[#111827]!"
        }`}
      />
    );

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <LogoUploadField
          label="Logo for light pages"
          inputLabel="Choose a logo for light pages"
          logoUrl={branding.logoLightUrl}
          alt={name || "Logo for light pages"}
          surface="light"
          fallback={wordmarkFallback("light", branding.logoDarkUrl)}
          hint={
            branding.logoLightUrl
              ? "Shown on light pages."
              : branding.logoDarkUrl
                ? "Light pages show the dark pages' logo, shown here. Upload a version with dark text if it does not show well on white."
                : "A PNG or JPEG up to 2 MB, about 80px tall, with a transparent background and dark text."
          }
          upload={uploadLight}
          remove={removeLight}
          uploadedNotice="Logo for light pages uploaded."
          removedNotice="Logo for light pages removed."
          setNotice={setNotice}
        />
        <LogoUploadField
          label="Logo for dark pages"
          inputLabel="Choose a logo for dark pages"
          logoUrl={branding.logoDarkUrl}
          alt={name || "Logo for dark pages"}
          surface="dark"
          fallback={wordmarkFallback("dark", branding.logoLightUrl)}
          hint={
            branding.logoDarkUrl
              ? "Shown on dark pages."
              : branding.logoLightUrl
                ? "Dark pages show the light pages' logo, shown here. Upload a version with light text if it does not show well on dark."
                : "Optional: the same logo with light text. Without it, dark pages show the light pages' logo."
          }
          upload={uploadDark}
          remove={removeDark}
          uploadedNotice="Logo for dark pages uploaded."
          removedNotice="Logo for dark pages removed."
          setNotice={setNotice}
        />
      </div>
      <LogoUploadField
        label="Icon"
        inputLabel="Choose an icon image"
        logoUrl={branding.iconUrl}
        alt={name || "Icon"}
        surface="light"
        shape="square"
        noun="icon"
        fallback={
          BUILD_HAS_OWN_ARTWORK ? (
            <img
              alt=""
              className="block size-12 object-contain"
              src={builtInIconUrl}
            />
          ) : (
            <SiteLetterIcon
              name={name}
              className="size-12 rounded-xl text-xl"
            />
          )
        }
        hint={`A square PNG or JPEG, at least ${PLATFORM_ICON_MIN_SIDE} × ${PLATFORM_ICON_MIN_SIDE} pixels (512 × 512 is best). Shown in the browser tab, the compact sidebar and loading screens.`}
        upload={uploadIcon}
        remove={removeIcon}
        uploadedNotice="Icon uploaded."
        removedNotice="Icon removed."
        setNotice={setNotice}
      />
    </div>
  );
}
