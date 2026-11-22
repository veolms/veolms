import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { TEAM_TITLE_MAX_LENGTH } from "@veolms/contracts";
import { useState } from "react";
import { getApiError } from "../lib/api-error";
import { useCapabilities } from "../services/authorization";
import { useSetTeamMemberTitle } from "../services/team";
import { useAuthStore } from "../store/auth.store";
import { TEAM_DEFAULT_BADGE } from "../team/teamBadge";

/** Team roles a title can be given to (learners and helpers carry none). */
const TITLED_ROLES = new Set(["admin", "instructor", "staff"]);

/**
 * Admins and instructors (and whoever may assign team roles) may set
 * anyone's title, their own included. The API checks the same.
 */
export function useCanSetTitles(): boolean {
  const roles = useAuthStore((state) => state.user?.roles);
  const { can } = useCapabilities();
  return (
    Boolean(
      roles?.some((role) =>
        ["admin", "instructor"].includes(role.toLowerCase()),
      ),
    ) || can("role.assign")
  );
}

/**
 * "Edit title" under a team member's badge in their chat card: their badge
 * in chat, discussions and profile. Empty shows the default badge again.
 */
export function PersonTitleEditor({
  userId,
  role,
  title,
  onSaved,
  onToast,
}: {
  userId: string;
  role: string | undefined;
  title: string | null;
  onSaved: (title: string | null) => void;
  onToast: (message: string) => void;
}) {
  const allowed = useCanSetTitles();
  const save = useSetTeamMemberTitle();
  const [draft, setDraft] = useState<string | null>(null);
  if (!allowed || !role || !TITLED_ROLES.has(role)) return null;

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(title ?? "")}
        className="mt-1.5 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[0.74rem] font-medium text-(--accent-ink) hover:underline"
      >
        <PencilSimple size={12} aria-hidden="true" />
        {title ? "Edit title" : "Add title"}
      </button>
    );
  }

  const submit = () => {
    save.mutate(
      { userId, title: draft.trim() },
      {
        onSuccess: (saved) => {
          onSaved(saved.title);
          setDraft(null);
          onToast(saved.title ? "Title saved" : "Title removed");
        },
        onError: (error) => onToast(getApiError(error).message),
      },
    );
  };

  return (
    <form
      className="mt-2 flex w-full flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        type="text"
        value={draft}
        maxLength={TEAM_TITLE_MAX_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Escape leaves the field, not the card.
          if (event.key === "Escape") {
            event.stopPropagation();
            setDraft(null);
          }
        }}
        placeholder={`e.g. Lead Engineer (empty: ${TEAM_DEFAULT_BADGE})`}
        aria-label="Title"
        className="h-9 w-full min-w-0 rounded-lg border border-solid border-(--chat-line) bg-transparent px-3 text-[0.84rem] text-(--text) placeholder-(--muted) outline-none focus:border-(--accent)"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-1.5 text-[0.78rem] font-medium text-(--muted) hover:bg-(--chat-hover)"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={save.isPending || draft.trim() === (title ?? "").trim()}
          className="cursor-pointer rounded-lg border-0 bg-(--accent) px-3 py-1.5 text-[0.78rem] font-semibold text-(--on-accent) hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
