import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CommentCard } from "../../src/learning/CommentCard.tsx";
import { Discussion } from "../../src/learning/Discussion.tsx";

describe("CommentCard", () => {
  it("tracks its pressed state and delegates like changes", () => {
    const onLike = vi.fn();
    render(
      <CommentCard
        comment={{
          id: 7,
          name: "Alex Morgan",
          time: "Just now",
          avatar: "/alex.jpg",
          text: "Clear explanation.",
          likes: 3,
          replies: 2,
        }}
        onLike={onLike}
      />,
    );

    const like = screen.getByRole("button", { name: "Like" });
    expect(like).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(onLike).toHaveBeenLastCalledWith(7, true);

    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(onLike).toHaveBeenLastCalledWith(7, false);
  });
});

describe("Discussion", () => {
  it("renders only the entry-type filters without a sort control", () => {
    render(<Discussion persistenceKey="discussion-filter-controls-test" />);

    const filters = screen.getByRole("group", {
      name: "Filter discussion entries",
    });
    expect(
      within(filters)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["All", "Notes", "Comments", "Q&As"]);
    expect(
      screen.queryByRole("button", { name: /Sort discussion/i }),
    ).not.toBeInTheDocument();
  });

  it("filters the unified feed by entry type", () => {
    const { container } = render(
      <Discussion persistenceKey="discussion-entry-filter-test" />,
    );
    const visibleKinds = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-discussion-entry]"),
      ).map((entry) => entry.dataset.discussionEntry);

    expect(visibleKinds()).toEqual([
      "comment",
      "question",
      "note",
      "question",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(visibleKinds()).toEqual(["note"]);

    fireEvent.click(screen.getByRole("button", { name: "Q&As" }));
    expect(visibleKinds()).toEqual(["question", "question"]);
  });

  it("opens the rich discussion composer from its compact state", async () => {
    render(<Discussion persistenceKey="discussion-composer-open-test" />);

    const [openComposer] = screen.getAllByRole("button", {
      name: "Open discussion composer",
    });
    if (!openComposer) throw new Error("Expected the compact composer trigger");
    fireEvent.click(openComposer);

    expect(
      await screen.findByRole("textbox", { name: "Write a comment" }),
    ).toBeInTheDocument();
  });
});
