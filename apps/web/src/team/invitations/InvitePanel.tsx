import {
  TEAM_INVITATION_MAX_EMAILS,
  TEAM_INVITATION_MESSAGE_MAX_LENGTH,
  type CreateTeamInvitationsResponse,
  type TeamInvitationKind,
} from "@veolms/contracts";
import { useState, type ReactNode } from "react";
import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { SlideOverPanel } from "../../components/SlideOverPanel";
import { useCreateTeamInvitations, useTeamRoles } from "../../services/team";
import { RolePicker } from "../RolePicker";
import { looksLikeEmail, roleLabel } from "../teamFormat";
import {
  inputClassName,
  PanelBody,
  secondaryButtonClassName,
  StatusChip,
} from "../TeamBits";
import { EmailChipsInput } from "./EmailChipsInput";

const OUTCOME_LABELS: Record<
  CreateTeamInvitationsResponse["results"][number]["outcome"],
  { label: string; tone: "success" | "accent" | "neutral" | "danger" }
> = {
  invited: { label: "Invited", tone: "success" },
  updated: { label: "Invitation renewed", tone: "success" },
  preapproved: { label: "Added directly", tone: "success" },
  promoted: { label: "Added now", tone: "accent" },
  already_member: { label: "Already has these roles", tone: "neutral" },
  failed: { label: "Not added", tone: "danger" },
};

const MODES: readonly {
  id: TeamInvitationKind;
  label: string;
  hint: string;
}[] = [
  { id: "invite", label: "Send invite link", hint: "They accept first" },
  {
    id: "preapproved",
    label: "Add directly",
    hint: "Roles apply on first sign-in",
  },
];

function SectionLabel({
  htmlFor,
  children,
  aside,
}: {
  htmlFor?: string;
  children: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-(--text)">
        {children}
      </label>
      {aside ? <span className="text-xs text-(--muted)">{aside}</span> : null}
    </div>
  );
}

function sendLabel(kind: TeamInvitationKind, count: number): string {
  if (kind === "preapproved") return count > 0 ? `Add ${count}` : "Add";
  if (count === 0) return "Send invites";
  return `Send ${count} invite${count === 1 ? "" : "s"}`;
}

/** Invite several people at once, then show what happened for each. */
export function InvitePanel({ onClose }: { onClose: () => void }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [kind, setKind] = useState<TeamInvitationKind>("invite");
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateTeamInvitations();
  const roles = useTeamRoles();
  const [results, setResults] =
    useState<CreateTeamInvitationsResponse["results"]>();

  const valid = emails.filter(looksLikeEmail);
  const invalidCount = emails.length - valid.length;
  const tooMany = valid.length > TEAM_INVITATION_MAX_EMAILS;
  const chosenRoles = (roles.data?.roles ?? []).filter((role) =>
    roleIds.includes(role.id),
  );
  const canSend =
    !create.isPending &&
    valid.length > 0 &&
    invalidCount === 0 &&
    !tooMany &&
    roleIds.length > 0;

  const submit = async () => {
    setError(null);
    try {
      const response = await create.mutateAsync({
        emails: valid,
        roleIds,
        kind,
        notify: kind === "invite" ? true : notify,
        message: message.trim() || null,
      });
      setResults(response.results);
    } catch (cause) {
      setError(
        (cause as { message?: string }).message ?? "Something went wrong.",
      );
    }
  };

  return (
    <SlideOverPanel
      label="Invite people"
      title="Invite people"
      onClose={onClose}
      closeLabel="Close"
      headerContent={
        <p className="mt-1 text-xs text-(--muted)">
          They&apos;ll get an email with a link valid for 7 days.
        </p>
      }
    >
      <PanelBody>
        {results ? (
          <ul className="m-0 flex list-none flex-col divide-y divide-(--border) p-0">
            {results.map((result) => {
              const outcome = OUTCOME_LABELS[result.outcome];
              return (
                <li key={result.email} className="flex flex-col gap-1 py-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-(--text)">
                      {result.email}
                    </span>
                    <StatusChip tone={outcome.tone}>{outcome.label}</StatusChip>
                  </span>
                  {result.error ? (
                    <span className="text-xs text-rose-500">
                      {result.error}
                    </span>
                  ) : null}
                  {!result.error &&
                  !result.emailSent &&
                  (result.outcome === "invited" ||
                    result.outcome === "updated") ? (
                    <span className="text-xs text-amber-500">
                      The email did not go out. Resend it from the list.
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <SectionLabel
                htmlFor="invite-emails"
                aside={
                  emails.length > 0 ? (
                    <>
                      {valid.length} added
                      {invalidCount > 0 ? (
                        <span className="text-rose-400">
                          {" "}
                          · {invalidCount} invalid
                        </span>
                      ) : null}
                      {tooMany ? (
                        <span className="text-rose-400">
                          {" "}
                          · at most {TEAM_INVITATION_MAX_EMAILS}
                        </span>
                      ) : null}
                    </>
                  ) : null
                }
              >
                Emails
              </SectionLabel>
              <EmailChipsInput
                id="invite-emails"
                emails={emails}
                onChange={setEmails}
                autoFocus
              />
            </div>

            <div>
              <SectionLabel>How they join</SectionLabel>
              <div
                role="radiogroup"
                aria-label="How they join"
                className="grid grid-cols-2 gap-1 rounded-xl border border-(--border) bg-(--card-surface) p-1"
              >
                {MODES.map((mode) => {
                  const active = kind === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setKind(mode.id)}
                      className={`cursor-pointer rounded-lg px-3 py-2 text-left transition-colors ${active ? "bg-[color-mix(in_srgb,var(--text)_9%,transparent)]" : "hover:bg-(--hover)"}`}
                    >
                      <span
                        className={`block text-sm font-semibold ${active ? "text-(--accent)" : "text-(--muted)"}`}
                      >
                        {mode.label}
                      </span>
                      <span className="block text-xs text-(--muted)">
                        {mode.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              {kind === "preapproved" ? (
                <div className="mt-3">
                  <Checkbox
                    id="invite-notify"
                    checked={notify}
                    onCheckedChange={setNotify}
                    label="Email them to say they were added"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <SectionLabel aside="Pick one or more">Roles</SectionLabel>
              <RolePicker
                selected={roleIds}
                onChange={setRoleIds}
                idPrefix="invite-role"
              />
            </div>

            <div>
              <SectionLabel htmlFor="invite-message" aside="Optional">
                Personal note
              </SectionLabel>
              <textarea
                id="invite-message"
                className={`${inputClassName} h-auto min-h-20 rounded-xl py-2`}
                value={message}
                maxLength={TEAM_INVITATION_MESSAGE_MAX_LENGTH}
                placeholder="Shown in the invite email"
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-rose-500">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </PanelBody>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-(--border) p-4 sm:px-6">
        {results ? (
          <>
            <span />
            <Button elevation="flat" motion="static" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <p className="min-w-0 truncate text-xs text-(--muted)">
              {valid.length > 0 ? (
                <>
                  <strong className="text-(--text)">
                    {valid.length} {valid.length === 1 ? "person" : "people"}
                  </strong>
                  {chosenRoles.length > 0 ? (
                    <>
                      {" as "}
                      <strong className="text-(--text)">
                        {chosenRoles
                          .map((role) => roleLabel(role.name))
                          .join(" + ")}
                      </strong>
                    </>
                  ) : null}
                </>
              ) : (
                "Add at least one email"
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
                elevation="flat"
                motion="static"
                disabled={!canSend}
                onClick={() => void submit()}
              >
                {create.isPending ? "Sending…" : sendLabel(kind, valid.length)}
              </Button>
            </div>
          </>
        )}
      </div>
    </SlideOverPanel>
  );
}
