import { useState } from "react";
import type {
  WorkshopAdminListItem,
  WorkshopAdminTab,
} from "@veolms/contracts";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { VideoConferenceIcon as VideoConference } from "@phosphor-icons/react/VideoConference";
import { Button } from "../components/Button";
import { CenteredLoadingSpinner } from "../components/LoadingSpinner";
import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import { useWorkshopsAdminList } from "../services/workshops";
import { useAuthStore } from "../store/auth.store";
import type { NavigateTo } from "../routing/navigation";
import { WorkshopsAccessDenied } from "./WorkshopsAccessDenied";
import { WorkshopsAdminList } from "./WorkshopsAdminList";
import {
  WORKSHOPS_SEARCH_INPUT_ID,
  WorkshopsAdminTabs,
} from "./WorkshopsAdminTabs";
import { surfaceClass } from "./workshopHelpers";

export const WORKSHOPS_ADMIN_PATH = "/workshops-admin";

export interface WorkshopsAdminPageProps {
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export function WorkshopsAdminPage({
  onNavigatePage,
}: WorkshopsAdminPageProps) {
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const isAuthReady = Boolean(storeUser) || authUserFetched;
  const user = authUserFetched ? authUser : storeUser;
  const { can } = useCapabilities({ enabled: Boolean(user) });
  const canRead = Boolean(
    user && (can("workshop.read") || can("workshop.manage")),
  );
  const canManage = Boolean(user && can("workshop.manage"));

  const [tab, setTab] = useState<WorkshopAdminTab>("upcoming");
  const [search, setSearch] = useState("");
  const list = useWorkshopsAdminList({ tab, search, enabled: canRead });

  usePageSearchShortcut(WORKSHOPS_SEARCH_INPUT_ID);

  const openCreate = () => onNavigatePage?.(`${WORKSHOPS_ADMIN_PATH}/create`);
  const openWorkshop = (workshop: WorkshopAdminListItem) =>
    onNavigatePage?.(`${WORKSHOPS_ADMIN_PATH}/${workshop.id}`);

  if (!isAuthReady) {
    return (
      <main className="mx-auto w-full max-w-[1320px]">
        <CenteredLoadingSpinner
          label="Loading workshops"
          className="min-h-52 py-24"
        />
      </main>
    );
  }

  if (!canRead) {
    return <WorkshopsAccessDenied onNavigatePage={onNavigatePage} />;
  }

  return (
    <main
      className="mx-auto grid w-full max-w-[1800px] gap-6"
      aria-labelledby="workshops-page-title"
    >
      <header className="flex flex-col gap-3.5 border-b border-(--border) pt-2 pb-4.5 sm:gap-5 sm:pt-0 sm:pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1
            id="workshops-page-title"
            className="text-[clamp(1.8rem,2.4vw,2.15rem)] font-bold leading-tight tracking-[-0.035em] text-(--text)"
          >
            Workshops
          </h1>
          <p className="mt-1.5 max-w-2xl text-[0.88rem] leading-6 text-(--muted)">
            Live sessions on Zoom, Google Meet or YouTube Live. Schedule them
            here; learners register, get reminders and join from the app.
          </p>
        </div>
        {canManage ? (
          <div className="shrink-0 pt-2 pb-0.5 sm:py-0">
            <Button onClick={openCreate}>
              <Plus size={16} weight="bold" />
              Create workshop
            </Button>
          </div>
        ) : null}
      </header>

      <section className={surfaceClass} aria-label="Workshop list">
        <div className="flex items-start justify-between gap-3 border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-3 py-2.5 sm:p-7">
          <div>
            <h2 className="text-base font-bold tracking-tight text-(--text) sm:text-lg">
              All workshops
            </h2>
            <p className="mt-0.5 text-xs text-(--muted)">
              {canManage
                ? "Open a workshop to edit its sessions, publish or cancel it."
                : "Open a workshop to see its sessions and registrations."}
            </p>
          </div>
          {canManage ? (
            <Button className="hidden sm:inline-flex" onClick={openCreate}>
              <Plus size={16} weight="bold" />
              New workshop
            </Button>
          ) : null}
        </div>

        <WorkshopsAdminTabs
          activeTab={tab}
          onTabChange={setTab}
          counts={list.data?.counts}
          searchQuery={search}
          onSearchChange={setSearch}
        />

        {list.isError ? (
          <div className="grid place-items-center p-6 text-center sm:p-12">
            <span className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
              <VideoConference size={22} weight="bold" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">
              Could not load workshops
            </h3>
            <p className="mt-1 max-w-sm text-xs leading-5 text-(--muted)">
              {list.error?.message || "Try again in a moment."}
            </p>
            <div className="mt-4">
              <Button onClick={() => void list.refetch()}>Retry</Button>
            </div>
          </div>
        ) : (
          <WorkshopsAdminList
            items={list.data?.items ?? []}
            tab={tab}
            isLoading={list.isLoading}
            canManage={canManage}
            onOpen={openWorkshop}
            onCreate={canManage ? openCreate : undefined}
          />
        )}
      </section>
    </main>
  );
}
