import { Suspense, useState } from "react";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import "../styles/features/workspace.css";
import type { CourseRole } from "../courses/catalogue";
import type { NavigateTo } from "../routing/navigation";
import { definePrerenderedBody } from "../routing/prerenderedBodies";

const discussionsWorkspaceBody = definePrerenderedBody(
  () => import("./DiscussionsWorkspace"),
  (module) => module.DiscussionsWorkspace,
);
const DiscussionsWorkspace = discussionsWorkspaceBody.Body;
/**
 * Fetches the Discussions page ahead of a visit. Until it has arrived the
 * page can only show placeholders, heading and filters included; with it,
 * those are there at once and only the list waits for its data.
 */
export const preloadDiscussionsWorkspace = () =>
  discussionsWorkspaceBody.preload().then(() => undefined);

export interface WorkspacePageProps {
  section: string;
  role: CourseRole;
  discussionTab?: string;
  onNavigatePage: NavigateTo;
  setNotice?: (message: string) => void;
  onSignOut?: () => void;
  /** See `DiscussionsWorkspace`. */
  sessionPending?: boolean;
}

interface WorkspaceHeaderProps {
  title: string;
  description: string;
}

function WorkspaceHeader({ title, description }: WorkspaceHeaderProps) {
  return (
    <header className="workspace-page__header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}

function LogoutWorkspace({
  onNavigatePage,
  setNotice,
  onSignOut,
}: Pick<WorkspacePageProps, "onNavigatePage" | "setNotice" | "onSignOut">) {
  const [ready, setReady] = useState(false);

  return (
    <div className="workspace-page workspace-page--logout">
      <section className="workspace-signout" aria-labelledby="signout-heading">
        <span className="workspace-signout__icon">
          <SignOut size={26} weight="duotone" />
        </span>
        <div>
          <h1 id="signout-heading">Sign out</h1>
          <p>End this local workspace session on this device.</p>
        </div>
        <div className="workspace-signout__actions">
          {ready && (
            <p role="status">
              This clears the local workspace session and returns you to the
              home screen. Server-side sign-out will follow when account
              sessions are connected.
            </p>
          )}
          <button
            type="button"
            className="workspace-button workspace-button--secondary"
            onClick={() => onNavigatePage("home")}
          >
            Stay signed in
          </button>
          <button
            type="button"
            className="workspace-button"
            onClick={() => {
              if (!ready) {
                setReady(true);
                return;
              }
              onSignOut?.();
              setNotice?.(
                "Local workspace session ended. You are back at home.",
              );
              onNavigatePage("home");
            }}
          >
            {ready ? "Confirm sign out" : "Sign out"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function WorkspacePage({
  section,
  role,
  discussionTab,
  onNavigatePage,
  setNotice,
  onSignOut,
  sessionPending,
}: WorkspacePageProps) {
  if (section === "Discussions") {
    return (
      // Nothing stands in while the page's code arrives. Placeholders for
      // the list alone used to, at the top of the page where the heading
      // goes, and then jumped down under the heading, tabs and filters when
      // those came. The page shows its own placeholders, in the list.
      <Suspense fallback={null}>
        <DiscussionsWorkspace
          role={role}
          tab={discussionTab}
          onNavigatePage={onNavigatePage}
          setNotice={setNotice}
          sessionPending={sessionPending}
        />
      </Suspense>
    );
  }
  if (section === "Logout") {
    return (
      <LogoutWorkspace
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div className="workspace-page">
      <WorkspaceHeader
        title="Workspace"
        description="Choose a section from the navigation to continue."
      />
    </div>
  );
}
