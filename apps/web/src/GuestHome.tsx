import { DiscoveryHome } from "./home/DiscoveryHome";

export function GuestHome({
  onNavigatePage,
  setNotice,
}: {
  onNavigatePage: (page: string) => void;
  setNotice?: (message: string) => void;
}) {
  return (
    <DiscoveryHome
      mode="guest"
      accessibleCourseIds={new Set()}
      onDiscussionNavigatePage={onNavigatePage}
      onDiscussionAccessDenied={() => setNotice?.("You don't have access to this course.")}
    />
  );
}
