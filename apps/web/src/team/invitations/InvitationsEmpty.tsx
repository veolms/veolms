import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { Button } from "../../components/Button";

const STEPS = [
  { title: "You invite", text: "Paste emails and choose their roles." },
  { title: "They accept", text: "The link stays valid for 7 days." },
  {
    title: "They join",
    text: "They appear under Members with those roles.",
  },
] as const;

/** The Invitations tab before anyone has been invited. */
export function InvitationsEmpty({
  canInvite,
  onInvite,
}: {
  canInvite: boolean;
  onInvite: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <span className="flex size-13 items-center justify-center rounded-2xl bg-(--accent)/15 text-(--accent)">
        <PaperPlaneTilt size={24} />
      </span>
      <h2 className="mt-5 text-xl font-bold text-(--text)">
        No invitations out
      </h2>
      <p className="mt-2 max-w-lg text-sm text-(--muted)">
        Invite instructors, editors or reviewers. They sign in with their email
        and land with the roles you pick.
      </p>

      <ol className="m-0 mt-8 grid w-full max-w-3xl list-none gap-3 p-0 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-xl border border-(--border) bg-(--card-surface) p-4 text-left"
          >
            <span className="font-mono text-xs font-semibold text-(--accent)">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="mt-2 text-sm font-semibold text-(--text)">
              {step.title}
            </p>
            <p className="mt-1 text-xs text-(--muted)">{step.text}</p>
          </li>
        ))}
      </ol>

      {canInvite ? (
        <div className="mt-8">
          <Button elevation="flat" motion="static" onClick={onInvite}>
            Invite people
          </Button>
        </div>
      ) : null}
    </div>
  );
}
