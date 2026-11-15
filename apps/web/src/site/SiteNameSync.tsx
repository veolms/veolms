import { useEffect } from "react";
import { usePublicAcademyBrand } from "../services/academy";
import { getSiteName, setSiteName } from "./siteName";

/**
 * Reads the academy's name once per visit and makes it the site's name.
 * The tab's title already ends in the build's name ("Courses · ProCodrr");
 * that ending is swapped at once, and titles made later use the new name.
 * Renders nothing.
 */
export function SiteNameSync() {
  const name = usePublicAcademyBrand().data?.name?.trim();

  useEffect(() => {
    if (!name) return;
    const previous = getSiteName();
    if (name === previous) return;
    setSiteName(name);
    const ending = ` · ${previous}`;
    if (document.title.endsWith(ending)) {
      document.title = `${document.title.slice(0, -ending.length)} · ${name}`;
    } else if (document.title === previous) {
      document.title = name;
    }
  }, [name]);

  return null;
}
