import { lazy, Suspense } from "react";
import { useProfilePreview } from "./profilePreviewStore";

// The preview's code and the profile styles load with the first one opened.
const ProfilePreviewPanel = lazy(() =>
  import("./ProfilePreviewPanel").then((module) => ({
    default: module.ProfilePreviewPanel,
  })),
);

/** Shows the profile preview a name or picture opened. Mounted once. */
export function ProfilePreviewHost() {
  const preview = useProfilePreview();
  if (!preview) return null;
  return (
    <Suspense fallback={null}>
      <ProfilePreviewPanel
        key={preview.username}
        username={preview.username}
        anchor={preview.anchor}
      />
    </Suspense>
  );
}
