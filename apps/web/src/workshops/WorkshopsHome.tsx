import type { NavigateTo } from "../routing/navigation";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import { useAuthStore } from "../store/auth.store";
import { WorkshopsAdminPage } from "./WorkshopsAdminPage";
import { WorkshopsPage } from "./WorkshopsPage";

/**
 * /workshops for everyone: staff who run workshops get the list they manage
 * them from, learners get their agenda. One address, like /courses, so a
 * link to it works for whoever opens it.
 */
export function WorkshopsHome({
  onNavigatePage,
  setNotice,
}: {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}) {
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const user = authUserFetched ? authUser : storeUser;
  const capabilities = useCapabilities({ enabled: Boolean(user) });
  const isStaff =
    capabilities.can("workshop.read") || capabilities.can("workshop.manage");

  // Wait for the answer rather than flash the learner view at staff.
  if (user && capabilities.isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1320px]">
        <CenteredLoadingSpinner
          label="Loading workshops"
          className="min-h-52 py-24"
        />
      </main>
    );
  }
  if (user && isStaff) {
    return (
      <WorkshopsAdminPage
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
    );
  }
  return (
    <WorkshopsPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
  );
}
