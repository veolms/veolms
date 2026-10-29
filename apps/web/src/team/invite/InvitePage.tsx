import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EnvelopeOpenIcon as EnvelopeOpen } from "@phosphor-icons/react/EnvelopeOpen";
import { LinkBreakIcon as LinkBreak } from "@phosphor-icons/react/LinkBreak";
import { UserSwitchIcon as UserSwitch } from "@phosphor-icons/react/UserSwitch";
import type { Icon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Button } from "../../components/Button";
import { ElevatedCard } from "../../components/ElevatedCard";
import { buildLoginPath } from "../../routing/routeAccess";
import type { NavigateTo } from "../../routing/navigation";
import { useSignOut } from "../../services/auth/auth.mutations";
import { useAcceptInvitation, useInvitationPreview } from "../../services/team";
import { useAuthStore } from "../../store/auth.store";
import { roleLabel } from "../teamFormat";
import { secondaryButtonClassName } from "../TeamBits";

function InviteCard({
  icon: IconComponent,
  title,
  children,
  actions,
}: {
  icon: Icon;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <ElevatedCard
        padded
        className="flex w-full max-w-md flex-col items-center gap-3 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-(--accent)/10 text-(--accent)">
          <IconComponent size={26} weight="duotone" />
        </span>
        <h1 className="text-xl font-bold text-(--text)">{title}</h1>
        {children ? (
          <div className="text-sm text-(--muted)">{children}</div>
        ) : null}
        {actions ? (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {actions}
          </div>
        ) : null}
      </ElevatedCard>
    </div>
  );
}

/**
 * Where an invitation email's link leads: who invited the person and to
 * which roles, then Accept. Works signed out (sign in first) and catches a
 * sign-in with another address.
 */
export function InvitePage({
  onNavigatePage,
}: {
  onNavigatePage?: NavigateTo;
}) {
  const { pathname } = useLocation();
  const token = decodeURIComponent(
    /^\/invite\/([^/?#]+)/.exec(pathname)?.[1] ?? "",
  );
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const user = useAuthStore((state) => state.user);
  const { signOut, isPending: signingOut } = useSignOut();
  const [accepted, setAccepted] = useState<string[] | null>(null);
  const invitePath = `/invite/${encodeURIComponent(token)}`;
  const signIn = () => onNavigatePage?.(buildLoginPath(invitePath));

  if (accepted) {
    return (
      <InviteCard
        icon={CheckCircle}
        title="You're on the team"
        actions={
          <Button
            elevation="flat"
            motion="static"
            onClick={() => onNavigatePage?.("/")}
          >
            Open the academy
          </Button>
        }
      >
        You now have {accepted.map(roleLabel).join(", ") || "your team roles"}.
        Team members sign in with two-factor verification; you may be asked to
        set it up next.
      </InviteCard>
    );
  }

  if (preview.isPending) {
    return (
      <div
        className="flex min-h-[70vh] items-center justify-center"
        aria-busy="true"
      >
        <div className="h-64 w-full max-w-md animate-pulse rounded-3xl bg-(--hover)" />
      </div>
    );
  }

  if (preview.isError) {
    const used = preview.error.code === "INVITE_ALREADY_USED";
    return (
      <InviteCard
        icon={LinkBreak}
        title={
          used ? "This invitation was already used" : "This link does not work"
        }
        actions={
          <Button
            elevation="flat"
            motion="static"
            onClick={() => onNavigatePage?.("/")}
          >
            Go to the academy
          </Button>
        }
      >
        {used
          ? "If it was you, sign in to find your team access. Otherwise ask the team for a new invitation."
          : "It may have expired or been cancelled. Ask the person who invited you for a new invitation."}
      </InviteCard>
    );
  }

  const invitation = preview.data;
  const mismatch = accept.error?.code === "INVITE_EMAIL_MISMATCH";

  if (mismatch && user) {
    return (
      <InviteCard
        icon={UserSwitch}
        title="Signed in with another email"
        actions={
          <Button
            elevation="flat"
            motion="static"
            disabled={signingOut}
            onClick={() => {
              void signOut().then(signIn);
            }}
          >
            {signingOut ? "Signing out…" : "Switch account"}
          </Button>
        }
      >
        This invitation was sent to{" "}
        <strong className="text-(--text)">{invitation.emailHint}</strong>, but
        you are signed in as{" "}
        <strong className="text-(--text)">{user.email ?? user.username}</strong>
        . Sign in with the invited address to accept it.
      </InviteCard>
    );
  }

  return (
    <InviteCard
      icon={EnvelopeOpen}
      title={`Join the ${invitation.academyName} team`}
      actions={
        user ? (
          <>
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={() => onNavigatePage?.("/")}
            >
              Not now
            </button>
            <Button
              elevation="flat"
              motion="static"
              disabled={accept.isPending}
              onClick={() =>
                void accept
                  .mutateAsync(token)
                  .then((result) =>
                    setAccepted(result.roles.map((role) => role.name)),
                  )
                  .catch(() => undefined)
              }
            >
              {accept.isPending ? "Accepting…" : "Accept invitation"}
            </Button>
          </>
        ) : (
          <Button elevation="flat" motion="static" onClick={signIn}>
            Sign in to accept
          </Button>
        )
      }
    >
      <p>
        {invitation.invitedByName
          ? `${invitation.invitedByName} invited`
          : "You were invited"}{" "}
        <strong className="text-(--text)">{invitation.emailHint}</strong> to
        join as{" "}
        <strong className="text-(--text)">
          {invitation.roles.map(roleLabel).join(", ")}
        </strong>
        .
      </p>
      {invitation.message ? (
        <blockquote className="mt-3 border-l-2 border-(--accent) pl-3 text-left whitespace-pre-line text-(--text)">
          {invitation.message}
        </blockquote>
      ) : null}
      {!user ? (
        <p className="mt-3 text-xs">
          Sign in, or create your account, with the invited email address.
        </p>
      ) : null}
      {accept.error && !mismatch ? (
        <p role="alert" className="mt-3 text-rose-500">
          {accept.error.message}
        </p>
      ) : null}
    </InviteCard>
  );
}
