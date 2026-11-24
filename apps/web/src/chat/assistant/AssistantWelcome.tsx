import { ChatAvatar } from "../ChatAvatar";

const JOB_TYPES = [
  {
    prefix: "fix:",
    label: "Fix a bug",
    hint: "with screenshots, a recording or a log",
  },
  {
    prefix: "build:",
    label: "Build something",
    hint: "Claude posts a plan first",
  },
  {
    prefix: "research:",
    label: "Research",
    hint: "a written report back here",
  },
  {
    prefix: "ask:",
    label: "Ask a question",
    hint: "about our code or product",
  },
  {
    prefix: "review:",
    label: "Review a pull request",
    hint: "give its number or link",
  },
] as const;

/**
 * What an empty assistant chat shows: what Claude can do, with each job
 * type one tap away (it starts the message with that word).
 */
export function AssistantWelcome({
  name,
  online,
  onPick,
}: {
  name: string;
  online: boolean;
  onPick: (prefix: string) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-8 text-center">
      <ChatAvatar name={name} assistant size="xl" />
      <h2 className="m-0 text-[1.1rem] font-semibold text-(--text)">{name}</h2>
      <p className="m-0 text-[0.88rem] text-(--muted)">
        Tell {name} what you need. Start with one of these, attach files if they
        help, and follow its progress card here.
        {online
          ? ""
          : " It is offline right now: your message waits until it is back."}
      </p>
      <ul
        className="m-0 flex w-full list-none flex-col gap-1.5 p-0"
        aria-label="What you can ask"
      >
        {JOB_TYPES.map((type) => (
          <li key={type.prefix}>
            <button
              type="button"
              onClick={() => onPick(type.prefix)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-(--chat-line) bg-(--chat-in) px-3 py-2.5 text-left hover:bg-(--chat-hover)"
            >
              <code className="rounded-md bg-(--accent-soft) px-1.5 py-0.5 text-[0.8rem] font-semibold text-(--accent-ink)">
                {type.prefix}
              </code>
              <span className="min-w-0">
                <span className="block text-[0.9rem] text-(--text)">
                  {type.label}
                </span>
                <span className="block text-[0.78rem] text-(--muted)">
                  {type.hint}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
