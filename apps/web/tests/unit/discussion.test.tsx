import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(like).toHaveClass("is-liked");
    expect(onLike).toHaveBeenLastCalledWith(7, true);

    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(onLike).toHaveBeenLastCalledWith(7, false);
  });
});

describe("Discussion", () => {
  it("rejects a blank comment and posts a trimmed valid comment", () => {
    render(<Discussion persistenceKey="discussion-post-test" />);

    const post = screen.getByRole("button", { name: "Post comment" });
    fireEvent.click(post);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Write a comment before sending.",
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Add a comment" }), {
      target: { value: "  A useful new observation.  " },
    });
    fireEvent.click(post);

    expect(screen.getByRole("status")).toHaveTextContent("Comment posted.");
    expect(screen.getByText("A useful new observation.")).toBeInTheDocument();
  });

  it("filters comments and resets search when changing tabs", () => {
    render(<Discussion persistenceKey="discussion-filter-test" />);

    const [search] = screen.getAllByRole("searchbox", {
      name: "Search comments",
    });
    expect(search).toBeDefined();
    if (!search) throw new Error("Expected the comments searchbox");
    fireEvent.change(search, { target: { value: "Maya Rodriguez" } });

    expect(
      screen.getByRole("heading", { name: "Maya Rodriguez" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Ethan Park" }),
    ).not.toBeInTheDocument();

    const notes = screen.getByRole("tab", { name: "Notes" });
    fireEvent.click(notes);

    expect(notes).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { name: "Your lesson notes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveValue(
      "",
    );
  });
});
