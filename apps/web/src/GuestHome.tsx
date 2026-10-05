import type {
  HomeDiscoveryResponse,
  PublicPopularDiscussion,
} from "@veolms/contracts";
import { DiscoveryHome } from "./home/DiscoveryHome";

export function GuestHome({
  onNavigatePage,
  setNotice,
  initialDiscovery,
  initialPopularDiscussions,
}: {
  onNavigatePage: (page: string) => void;
  setNotice?: (message: string) => void;
  initialDiscovery?: HomeDiscoveryResponse;
  initialPopularDiscussions?: PublicPopularDiscussion[];
}) {
  return (
    <DiscoveryHome
      mode="guest"
      onNavigatePage={onNavigatePage}
      accessibleCourseIds={new Set()}
      onDiscussionNavigatePage={onNavigatePage}
      onDiscussionAccessDenied={() =>
        setNotice?.("You don't have access to this course.")
      }
      initialDiscovery={initialDiscovery}
      initialPopularDiscussions={initialPopularDiscussions}
    />
  );
}
