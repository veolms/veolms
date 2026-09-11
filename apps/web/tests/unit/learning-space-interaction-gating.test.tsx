import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { Discussion } from "../../src/learning/Discussion";
import { applyDiscussionFeed } from "../../src/learning/discussionFeed";
import type { Comment } from "../../src/learning/CommentCard";

vi.mock("../../src/services/discussion", () => ({
  discussionService: {
    uploadAttachment: vi.fn(async (file: File) => ({
      url: `/api/v1/dev/discussion-uploads/${encodeURIComponent(file.name)}`,
      fileName: file.name,
      mediaType: "image" as const,
      mimeType: file.type,
      size: file.size,
    })),
  },
}));

describe("Learning Space Interaction Settings Gating", () => {
  it("1. renders All, Comments, Notes, Q&As when all 3 capabilities are enabled", () => {
    render(
      <Discussion
        persistenceKey="test-all-enabled"
        lessonDescription="Introduction to Rust"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Q&As" })).toBeInTheDocument();
    expect(screen.getByText("Write something…")).toBeInTheDocument();
    expect(screen.getByText("Introduction to Rust")).toBeInTheDocument();
  });

  it("2. hides Notes tab and notes from feed when allowNotes is false", () => {
    render(
      <Discussion
        persistenceKey="test-notes-disabled"
        lessonDescription="Introduction to Rust"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comments" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Q&As" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();

    // Verify notes from mock data (e.g. Ashi Singh's note) are completely filtered out
    expect(
      screen.queryByText(/Here’s a quick note on user empathy/i),
    ).not.toBeInTheDocument();
    // But comments and questions remain visible
    expect(
      screen.getByText(/Great explanation! The way you broke down the design process/i),
    ).toBeInTheDocument();
  });

  it("3. renders only Comments tab and omits 'All' when only comments are enabled", () => {
    render(
      <Discussion
        persistenceKey="test-only-comments"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Comments" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Q&As" })).toBeNull();
    expect(screen.getByText("Write a comment…")).toBeInTheDocument();
  });

  it("4. renders only Notes tab and omits 'All' when only notes are enabled", () => {
    render(
      <Discussion
        persistenceKey="test-only-notes"
        interactionCapabilities={{
          allowComments: false,
          allowNotes: true,
          allowQa: false,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Comments" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Q&As" })).toBeNull();
    expect(screen.getByText("Write a note…")).toBeInTheDocument();
  });

  it("5. renders only Q&As tab and omits 'All' when only Q&As are enabled", () => {
    render(
      <Discussion
        persistenceKey="test-only-qa"
        interactionCapabilities={{
          allowComments: false,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Q&As" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Comments" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    expect(screen.getByText("Ask a question…")).toBeInTheDocument();
  });

  it("6. renders learner interactions disabled message and hides tabs/composer when all 3 are disabled", () => {
    render(
      <Discussion
        persistenceKey="test-all-disabled"
        lessonDescription="Introduction to Rust"
        interactionCapabilities={{
          allowComments: false,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    expect(screen.getByText("Introduction to Rust")).toBeInTheDocument();
    expect(
      screen.getByText("Learner interactions are disabled for this course."),
    ).toBeInTheDocument();

    // Verify all tabs, composer, and toolbar are hidden
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Comments" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Q&As" })).toBeNull();
    expect(screen.queryByText(/Write something/i)).toBeNull();
    expect(screen.queryByText(/Write a comment/i)).toBeNull();
  });

  it("7. renders loading state skeleton without exposing tabs when isInteractionCapabilitiesLoading is true", () => {
    render(
      <Discussion
        persistenceKey="test-loading"
        lessonDescription="Introduction to Rust"
        isInteractionCapabilitiesLoading={true}
        interactionCapabilities={{
          allowComments: false,
          allowNotes: false,
          allowQa: false,
        }}
      />,
    );

    expect(screen.getByText("Introduction to Rust")).toBeInTheDocument();
    expect(
      screen.getByTestId("learner-interactions-loading"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.queryByText(/Write something/i)).toBeNull();
    expect(
      screen.queryByText("Learner interactions are disabled for this course."),
    ).toBeNull();
  });

  it("8. automatically heals invalid active tab to 'All' when currently selected tab becomes disabled", async () => {
    const { rerender } = render(
      <Discussion
        persistenceKey="test-healing"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Select Notes tab
    const notesTab = screen.getByRole("button", { name: "Notes" });
    fireEvent.click(notesTab);
    expect(notesTab).toHaveAttribute("aria-pressed", "true");

    // Re-render with allowNotes = false
    rerender(
      <Discussion
        persistenceKey="test-healing"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: false,
          allowQa: true,
        }}
      />,
    );

    // Active tab must self-heal to 'All'
    await waitFor(() => {
      const allTab = screen.getByRole("button", { name: "All" });
      expect(allTab).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
  });
});

describe("applyDiscussionFeed capability filtering", () => {
  const sampleEntries: Comment[] = [
    {
      id: 1,
      name: "User A",
      time: "1h ago",
      avatar: "/a.jpg",
      text: "A comment",
      entryKind: "comment",
      likes: 5,
    },
    {
      id: 2,
      name: "User B",
      time: "2h ago",
      avatar: "/b.jpg",
      text: "A note",
      entryKind: "note",
      likes: 2,
    },
    {
      id: 3,
      name: "User C",
      time: "3h ago",
      avatar: "/c.jpg",
      text: "A question",
      entryKind: "question",
      likes: 8,
    },
  ];

  it("filters out disabled kinds completely even when filter is 'all'", () => {
    const result = applyDiscussionFeed({
      currentUserName: "Test User",
      entries: sampleEntries,
      filter: "all",
      sort: "newest",
      capabilities: {
        allowComments: true,
        allowNotes: false,
        allowQa: true,
      },
    });

    expect(result.map((r) => r.id)).toEqual([3, 1]);
    expect(result.find((r) => r.entryKind === "note")).toBeUndefined();
  });

  it("returns empty array when all capabilities are false", () => {
    const result = applyDiscussionFeed({
      currentUserName: "Test User",
      entries: sampleEntries,
      filter: "all",
      sort: "newest",
      capabilities: {
        allowComments: false,
        allowNotes: false,
        allowQa: false,
      },
    });

    expect(result).toHaveLength(0);
  });
});
