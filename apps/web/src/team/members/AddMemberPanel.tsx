import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react/LinkSimple";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { UserCheckIcon as UserCheck } from "@phosphor-icons/react/UserCheck";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { Icon } from "@phosphor-icons/react";
import type { TeamUserSearchResult } from "@veolms/contracts";
import { useDeferredValue, useState, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { SlideOverFrame } from "../../components/SlideOverPanel";
import {
  useCreateTeamInvitations,
  useSetTeamMemberRoles,
  useTeamRoles,
  useTeamUserSearch,
} from "../../services/team";
import type { ToastMessage } from "../../ToastNotification";
import { RolePicker } from "../RolePicker";
import { looksLikeEmail, roleLabel } from "../teamFormat";
import { useTeamAccess } from "../useTeamAccess";
import { PersonAvatar, RoleChips, secondaryButtonClassName } from "../TeamBits";

type Target =
  | { kind: "user"; user: TeamUserSearchResult }
  | { kind: "email"; email: string; mode: "preapproved" | "invite" };

const line = "border-(--border)";
const softSurface = "bg-(--card-surface)";

/** The three ways in, shown before anything is typed. */
const WAYS_IN: readonly { icon: Icon; title: string; text: string }[] = [
  {
    icon: UserCheck,
    title: "Someone with an account",
    text: "Find them by name or email. Their roles apply at once.",
  },
  {
    icon: UserPlus,
    title: "Add by email",
    text: "Roles wait for their first sign-in with that address.",
  },
  {
    icon: LinkSimple,
    title: "Send an invite",
    text: "They get a link and accept before joining.",
  },
];

function SectionLabel({
  children,
  aside,
}: {
  children: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <p className="text-sm font-semibold text-(--text)">{children}</p>
      {aside ? <span className="text-xs text-(--muted)">{aside}</span> : null}
    </div>
  );
}

/**
 * Add someone to the team: find an account and pick roles (applied at
 * once), or, when nobody matches, add the email so the roles apply on first
 * sign-in, or send an invitation to accept.
 */
export function AddMemberPanel({
  onClose,
  setNotice,
  initialUser,
}: {
  onClose: () => void;
  setNotice?: (message: ToastMessage) => void;
  /** Opened from a student's page: that person is already chosen. */
  initialUser?: TeamUserSearchResult;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [target, setTarget] = useState<Target | null>(
    initialUser ? { kind: "user", user: initialUser } : null,
  );
  const [roleIds, setRoleIds] = useState<string[]>(
    initialUser?.roles.map((role) => role.id) ?? [],
  );
  const search = useTeamUserSearch(target ? "" : deferredQuery);
  // Opened for a chosen person (from their student page): saving replaces
  // their team roles, so read the ones they hold before anything is saved.
  const initialLookup = useTeamUserSearch(initialUser?.email ?? "");
  const [initialRolesLoaded, setInitialRolesLoaded] = useState(!initialUser);
  const initialMatch = initialLookup.data?.users.find(
    (user) => user.userId === initialUser?.userId,
  );
  if (initialUser && !initialRolesLoaded && initialLookup.isSuccess) {
    setInitialRolesLoaded(true);
    if (initialMatch) {
      setTarget({ kind: "user", user: initialMatch });
      setRoleIds(initialMatch.roles.map((role) => role.id));
    }
  }
  const { can } = useTeamAccess();
  const setRoles = useSetTeamMemberRoles();
  const invite = useCreateTeamInvitations();
  const roles = useTeamRoles();
  const pending = setRoles.isPending || invite.isPending || !initialRolesLoaded;
  const [error, setError] = useState<string | null>(null);

  const users = search.data?.users ?? [];
  const typed = query.trim();
  const typedEmail = typed.toLowerCase();
  const exactMatch = users.some((user) => user.email === typedEmail);
  // Adding by email or inviting is the team.invite permission's.
  const canInvite = can("team.invite");
  const offerEmail = canInvite && looksLikeEmail(typedEmail) && !exactMatch;
  const searched = deferredQuery.trim().length >= 2 && search.isSuccess;
  const chosenRoles = (roles.data?.roles ?? []).filter((role) =>
    roleIds.includes(role.id),
  );

  const pickUser = (user: TeamUserSearchResult) => {
    setTarget({ kind: "user", user });
    setRoleIds(user.roles.map((role) => role.id));
    setError(null);
  };

  const save = async () => {
    if (!target || roleIds.length === 0) return;
    setError(null);
    try {
      if (target.kind === "user") {
        await setRoles.mutateAsync({ userId: target.user.userId, roleIds });
        setNotice?.({
          type: "success",
          message: `${target.user.name || target.user.email} is on the team.`,
        });
      } else {
        const { results } = await invite.mutateAsync({
          emails: [target.email],
          roleIds,
          kind: target.mode,
          notify: true,
          message: null,
        });
        const result = results[0];
        if (!result || result.outcome === "failed") {
          setError(result?.error ?? "This email could not be added.");
          return;
        }
        setNotice?.({
          type:
            result.emailSent || result.outcome === "already_member"
              ? "success"
              : "warning",
          message: outcomeMessage(
            target.email,
            result.outcome,
            result.emailSent,
          ),
        });
      }
      onClose();
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ?? "Something went wrong.",
      );
    }
  };

  const targetName =
    target?.kind === "user"
      ? target.user.name || target.user.email
      : target?.email;

  return (
    <SlideOverFrame
      label="Add team member"
      onClose={onClose}
      className="max-w-[560px]"
    >
      <div className={`shrink-0 border-b px-6 pt-6 pb-5 ${line}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-(--text)">Add team member</h2>
            <p className="mt-1 text-xs text-(--muted)">
              Give someone access to help run the academy.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {target ? (
          <>
            <SectionLabel>Who</SectionLabel>
            <ChosenTarget
              target={target}
              onChange={initialUser ? undefined : () => setTarget(null)}
            />
            <div className="mt-6">
              <SectionLabel aside="Pick one or more">Roles</SectionLabel>
              <RolePicker
                selected={roleIds}
                onChange={setRoleIds}
                idPrefix="add-member-role"
              />
              <p className="mt-2 text-xs text-(--muted)">
                Team members sign in with two-factor verification.
              </p>
            </div>
          </>
        ) : (
          <>
            <SectionLabel>Who</SectionLabel>
            <label
              className={`flex h-11 items-center gap-2.5 rounded-xl border px-3.5 transition-colors focus-within:border-(--accent) ${line} ${softSurface}`}
            >
              <span className="sr-only">Find a person</span>
              <MagnifyingGlass
                size={16}
                aria-hidden="true"
                className="shrink-0 text-(--muted)"
              />
              <input
                type="search"
                value={query}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, username or email"
                className="min-w-0 flex-1 bg-transparent text-sm text-(--text) placeholder:text-(--muted) focus:outline-none"
              />
            </label>

            {typed.length < 2 ? (
              <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0">
                {WAYS_IN.map((way) => (
                  <li
                    key={way.title}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 ${line} ${softSurface}`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                      <way.icon size={16} weight="bold" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-(--text)">
                        {way.title}
                      </span>
                      <span className="block text-xs text-(--muted)">
                        {way.text}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {users.length > 0 ? (
              <div
                className={`mt-4 overflow-hidden rounded-xl border ${line}`}
                aria-live="polite"
              >
                <p
                  className={`border-b px-3.5 py-2 text-[0.68rem] font-semibold tracking-wider text-(--muted) uppercase ${line}`}
                >
                  Accounts
                </p>
                <ul className="m-0 list-none p-0">
                  {users.map((user) => (
                    <li
                      key={user.userId}
                      className={`border-b last:border-b-0 ${line}`}
                    >
                      <button
                        type="button"
                        onClick={() => pickUser(user)}
                        className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-(--hover)"
                      >
                        <PersonAvatar
                          name={user.name}
                          email={user.email}
                          avatarUrl={user.avatarUrl}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-(--text)">
                            {user.name || user.username}
                          </span>
                          <span className="block truncate text-xs text-(--muted)">
                            {user.email}
                          </span>
                        </span>
                        {user.isMember ? (
                          <RoleChips roles={user.roles} />
                        ) : (
                          <span className="text-xs font-semibold text-(--accent)">
                            Select
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {searched && users.length === 0 && !offerEmail ? (
              <p className="mt-4 text-sm text-(--muted)">
                Nobody matches “{typed}”.{" "}
                {canInvite
                  ? "Type their full email to add them by email or send an invite."
                  : "Only people who already have an account can be added."}
              </p>
            ) : null}

            {offerEmail ? (
              <div className="mt-5">
                <p className="mb-2 text-sm text-(--text)">
                  No account uses{" "}
                  <strong className="font-semibold">{typedEmail}</strong> yet.
                  How should they join?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        mode: "preapproved",
                        icon: UserPlus,
                        title: "Add by email",
                        text: "Roles apply on their first sign-in",
                      },
                      {
                        mode: "invite",
                        icon: EnvelopeSimple,
                        title: "Send invite",
                        text: "They get a link and accept first",
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() =>
                        setTarget({
                          kind: "email",
                          email: typedEmail,
                          mode: option.mode,
                        })
                      }
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-colors hover:border-(--accent) hover:bg-(--accent)/6 ${line} ${softSurface}`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                        <option.icon size={16} weight="bold" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-(--text)">
                          {option.title}
                        </span>
                        <span className="block text-xs text-(--muted)">
                          {option.text}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {error ? (
          <p role="alert" className="mt-4 text-sm text-rose-500">
            {error}
          </p>
        ) : null}
      </div>

      <div
        className={`flex shrink-0 items-center justify-between gap-3 border-t px-6 py-4 ${line}`}
      >
        <p className="min-w-0 truncate text-xs text-(--muted)">
          {target ? (
            <>
              <strong className="text-(--text)">{targetName}</strong>
              {chosenRoles.length > 0 ? (
                <>
                  {" as "}
                  <strong className="text-(--text)">
                    {chosenRoles
                      .map((role) => roleLabel(role.name))
                      .join(" + ")}
                  </strong>
                </>
              ) : (
                " · pick at least one role"
              )}
            </>
          ) : (
            "Choose who to add"
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={onClose}
          >
            Cancel
          </button>
          <Button
            disabled={!target || roleIds.length === 0 || pending}
            onClick={() => void save()}
          >
            {setRoles.isPending || invite.isPending
              ? "Saving…"
              : saveLabel(target)}
          </Button>
        </div>
      </div>
    </SlideOverFrame>
  );
}

function saveLabel(target: Target | null): string {
  if (target?.kind === "email") {
    return target.mode === "invite" ? "Send invite" : "Add by email";
  }
  return target?.user.isMember ? "Save roles" : "Add to team";
}

function outcomeMessage(
  email: string,
  outcome: string,
  emailSent: boolean,
): string {
  switch (outcome) {
    case "promoted":
      return `${email} already had an account and is on the team now.`;
    case "already_member":
      return `${email} already holds these roles.`;
    case "invited":
    case "updated":
      return emailSent
        ? `Invitation sent to ${email}.`
        : `Invitation saved, but the email to ${email} failed. Resend it from Invitations.`;
    default:
      return `${email} gets these roles the first time they sign in with this address.`;
  }
}

function ChosenTarget({
  target,
  onChange,
}: {
  target: Target;
  onChange?: () => void;
}) {
  const isUser = target.kind === "user";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3.5 ${line} ${softSurface}`}
    >
      {isUser ? (
        <PersonAvatar
          name={target.user.name}
          email={target.user.email}
          avatarUrl={target.user.avatarUrl}
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--accent)/12 text-(--accent)">
          <EnvelopeSimple size={18} weight="bold" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-(--text)">
          <span className="truncate">
            {isUser ? target.user.name || target.user.username : target.email}
          </span>
          {isUser && target.user.isMember ? (
            <CheckCircle
              size={15}
              weight="fill"
              className="shrink-0 text-(--accent)"
              aria-label="Already on the team"
            />
          ) : null}
        </span>
        <span className="block truncate text-xs text-(--muted)">
          {isUser
            ? target.user.email
            : target.mode === "invite"
              ? "Gets an email with a link to accept"
              : "Roles apply the first time they sign in with this email"}
        </span>
      </span>
      {onChange ? (
        <button
          type="button"
          onClick={onChange}
          className="shrink-0 cursor-pointer text-xs font-semibold text-(--accent) hover:underline"
        >
          Change
        </button>
      ) : null}
    </div>
  );
}
