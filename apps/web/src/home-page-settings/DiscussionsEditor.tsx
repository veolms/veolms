import type {
  HomePageDiscussionSection,
  PublicPopularDiscussion,
} from "@veolms/contracts";
import {
  HOME_PAGE_DISCUSSION_COUNT,
  HOME_PAGE_MAX_PINNED_DISCUSSIONS,
} from "@veolms/contracts/home-page-defaults";
import {
  SettingsSection,
  TextField,
  insetRowClass,
} from "./homePageSettingsControls";

type DiscussionPlacement = "automatic" | "pinned" | "hidden";

const placements: readonly [DiscussionPlacement, string][] = [
  ["automatic", "Auto"],
  ["pinned", "Pin"],
  ["hidden", "Hide"],
];

/**
 * The discussion list on the home page. It follows the most active public
 * discussions; the admin can pin some to the top or keep some off the page.
 */
export function DiscussionsEditor({
  section,
  onChange,
  discussions,
  optionsLoading,
}: {
  section: HomePageDiscussionSection;
  onChange: (section: HomePageDiscussionSection) => void;
  /** The most active public discussions, most active first. */
  discussions: readonly PublicPopularDiscussion[];
  optionsLoading: boolean;
}) {
  const pinned = new Set(section.pinnedThreadIds);
  const hidden = new Set(section.hiddenThreadIds);
  const pinLimitReached =
    section.pinnedThreadIds.length >= HOME_PAGE_MAX_PINNED_DISCUSSIONS;

  const place = (threadId: string, placement: DiscussionPlacement) =>
    onChange({
      ...section,
      pinnedThreadIds:
        placement === "pinned"
          ? [
              ...section.pinnedThreadIds.filter((id) => id !== threadId),
              threadId,
            ]
          : section.pinnedThreadIds.filter((id) => id !== threadId),
      hiddenThreadIds:
        placement === "hidden"
          ? [
              ...section.hiddenThreadIds.filter((id) => id !== threadId),
              threadId,
            ]
          : section.hiddenThreadIds.filter((id) => id !== threadId),
    });

  return (
    <SettingsSection
      id="home-page-discussions-heading"
      title="Student comments"
      description={`The comment cards below the courses. They show the most popular public comment from each student, up to ${HOME_PAGE_DISCUSSION_COUNT}.`}
      visible={section.visible}
      onVisibleChange={(visible) => onChange({ ...section, visible })}
    >
      <div className="sm:max-w-md">
        <TextField
          id="home-page-discussions-title"
          label="Heading"
          value={section.title}
          onChange={(title) => onChange({ ...section, title })}
          maxLength={40}
          required
        />
      </div>

      <div className="min-w-0">
        <h3 className="text-[13px] font-medium text-(--text)">
          Pin or hide discussions
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-(--muted)">
          Pinned discussions come first, in the order you pin them (up to{" "}
          {HOME_PAGE_MAX_PINNED_DISCUSSIONS}). Hidden ones never appear on the
          home page. The rest follow by activity.
        </p>

        {discussions.length === 0 ? (
          <p className="mt-3 text-sm text-(--muted)" role="status">
            {optionsLoading
              ? "Loading discussions..."
              : "There are no public discussions yet."}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {discussions.map((discussion) => {
              const placement: DiscussionPlacement = hidden.has(discussion.id)
                ? "hidden"
                : pinned.has(discussion.id)
                  ? "pinned"
                  : "automatic";
              const title = discussion.title?.trim() || discussion.snippet;
              return (
                <li
                  key={discussion.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 p-3 ${insetRowClass} ${
                    placement === "hidden" ? "opacity-60" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate text-sm font-medium text-(--text)">
                      {title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-(--muted)">
                      {discussion.author.displayName} in{" "}
                      {discussion.courseTitle} · {discussion.replyCount}{" "}
                      {discussion.replyCount === 1 ? "reply" : "replies"}
                    </span>
                  </span>
                  <span
                    role="radiogroup"
                    aria-label={`Placement of "${title}"`}
                    className="inline-flex shrink-0 rounded-lg border border-[color-mix(in_srgb,var(--text)_12%,transparent)] p-0.5"
                  >
                    {placements.map(([value, label]) => {
                      const selected = placement === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={
                            value === "pinned" && !selected && pinLimitReached
                          }
                          onClick={() => place(discussion.id, value)}
                          className={`h-8 min-w-13 cursor-pointer rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-40 ${
                            selected
                              ? "bg-(--accent) text-(--on-accent)"
                              : "text-(--muted) hover:text-(--text)"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SettingsSection>
  );
}
