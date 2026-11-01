import type { ReactNode } from "react";
import { ProfileLink } from "../../profiles/ProfileLink";
import { usePublicProfile } from "../../services/auth";

/**
 * An "@name" in a post. Only a member who exists is marked (and opens their
 * profile); any other "@word" reads as the plain text it is. Each name is
 * looked up once and kept for a few minutes (usePublicProfile), and until
 * the answer comes the text stays plain.
 */
export function MentionLink({ username }: { username: string }) {
  const profile = usePublicProfile(username);
  if (!profile.data) return <>@{username}</>;
  return (
    <ProfileLink
      username={username}
      variant="name"
      className="font-medium text-(--accent-ink,var(--accent)) no-underline hover:underline"
    >
      <span data-mention={username}>@{username}</span>
    </ProfileLink>
  );
}

const MENTION_PATTERN =
  /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})(?=[^A-Za-z0-9_]|$)/g;

export function renderContentWithMentions(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] ?? "";
    const username = match[2];
    const matchStart = match.index;
    const mentionStart = matchStart + prefix.length;
    const matchEnd = match.index + match[0].length;

    if (mentionStart > lastIndex) {
      parts.push(text.slice(lastIndex, mentionStart));
    }

    parts.push(
      <MentionLink
        key={`mention-${mentionStart}-${username}`}
        username={username!}
      />,
    );

    lastIndex = matchEnd;
  }

  if (lastIndex === 0) {
    return text;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
