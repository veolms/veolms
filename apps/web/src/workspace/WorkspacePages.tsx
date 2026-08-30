import { useState } from "react";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import type { CourseRole } from "../courses/catalogue";
import type { NavigateTo } from "../routing/navigation";
import { DiscussionsWorkspace } from "./DiscussionsWorkspace";

export interface WorkspacePageProps {
  section: string;
  role: CourseRole;
  discussionTab?: string;
  onNavigatePage: NavigateTo;
  setNotice?: (message: string) => void;
  onSignOut?: () => void;
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
}: WorkspacePageProps) {
  if (section === "Discussions") {
    return (
      <DiscussionsWorkspace
        role={role}
        tab={discussionTab}
        onNavigatePage={onNavigatePage}
        setNotice={setNotice}
      />
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
