import { useEffect } from "react";
import type { NavigateTo } from "../routing/navigation";
import { AcademyPageFallback } from "./academyPageFallbacks";

/**
 * An address whose page has moved: replaced by the new one at once, so
 * Back does not return to it.
 */
export function MovedPageRedirect({
  to,
  onNavigatePage,
}: {
  to: string;
  onNavigatePage: NavigateTo;
}) {
  useEffect(() => {
    onNavigatePage(to, { replace: true });
  }, [onNavigatePage, to]);
  return <AcademyPageFallback />;
}
