import type { HomeDiscoveryResponse } from "@veolms/contracts";
import { DiscoveryHome } from "./home/DiscoveryHome";

export function GuestHome({
  onNavigatePage,
  setNotice,
  initialDiscovery,
}: {
  onNavigatePage: (page: string) => void;
  setNotice?: (message: string) => void;
  initialDiscovery?: HomeDiscoveryResponse;
}) {
  return (
    <DiscoveryHome
      mode="guest"
      accessibleCourseIds={new Set()}
      onDiscussionNavigatePage={onNavigatePage}
      onDiscussionAccessDenied={() =>
        setNotice?.("You don't have access to this course.")
      }
      initialDiscovery={initialDiscovery}
    />
  );
}
