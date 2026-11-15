import { useSiteName } from "./siteName";

/** The site's name as text, following the academy's once it is known. */
export function SiteName() {
  return <>{useSiteName()}</>;
}
