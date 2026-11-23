import { getApiError } from "../lib/api-error";
import { useBlockedPeople, useBlockUser } from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Settings › Privacy › Blocked people (WhatsApp's "Blocked contacts"):
 * everyone you blocked, each with Unblock. Blocking is in a person's chat
 * menu or profile.
 */
export function BlockedPeople({
  onToast,
}: {
  onToast: (message: string) => void;
}) {
  const blocked = useBlockedPeople();
  const block = useBlockUser();
  const people = blocked.data?.blocked ?? [];

  if (blocked.isLoading) {
    return (
      <p className="m-0 px-4 py-4 text-[0.85rem] text-(--muted)">Loading…</p>
    );
  }
  if (blocked.isError) {
    return (
      <p className="m-0 px-4 py-4 text-[0.85rem] text-(--muted)">
        {getApiError(blocked.error).message}
      </p>
    );
  }
  return (
    <>
      {people.length === 0 ? (
        <p className="m-0 px-4 py-4 text-[0.88rem] text-(--muted)">
          You haven’t blocked anyone.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {people.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5"
            >
              <ChatAvatar name={person.name} url={person.avatarUrl} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.95rem] text-(--text)">
                  {person.name}
                </span>
                <span className="block text-[0.78rem] text-(--muted)">
                  Blocked {dateFormat.format(new Date(person.blockedAt))}
                </span>
              </span>
              <button
                type="button"
                disabled={block.isPending}
                onClick={() =>
                  block.mutate(
                    { userId: person.id, blocked: false },
                    {
                      onSuccess: () => onToast(`${person.name} unblocked`),
                      onError: (error) => onToast(getApiError(error).message),
                    },
                  )
                }
                className="h-8 shrink-0 cursor-pointer rounded-full border border-solid border-(--chat-line-strong) bg-transparent px-3.5 text-[0.82rem] font-semibold text-(--accent-ink) hover:bg-(--chat-hover) disabled:opacity-55"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 px-4 pt-3 text-[0.8rem] leading-snug text-(--muted)">
        Blocked people can’t send you private messages. Block someone from their
        chat’s menu or their profile.
      </p>
    </>
  );
}
