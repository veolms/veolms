import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const testCurrentUser = {
  id: "user-123",
  displayName: "Ashi Singh",
  avatarDataUrl: "/assets/sofia-avatar-160.webp",
};

const notesMocks = vi.hoisted(() => ({
  useUserNotes: vi.fn(),
  useCreateNote: vi.fn(),
  useUpdateNote: vi.fn(),
  useDeleteNote: vi.fn(),
}));

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: () => ({
    data: testCurrentUser,
  }),
}));

vi.mock("../../src/services/learning-interactions", () => ({
  useUserNotes: (...args: any[]) => notesMocks.useUserNotes(...args),
  useCreateNote: (...args: any[]) => notesMocks.useCreateNote(...args),
  useUpdateNote: (...args: any[]) => notesMocks.useUpdateNote(...args),
  useDeleteNote: (...args: any[]) => notesMocks.useDeleteNote(...args),
}));

describe("Learning Space Interaction Settings Gating", () => {
  beforeEach(() => {
    notesMocks.useUserNotes.mockImplementation(() => ({
      data: { notes: [], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    notesMocks.useCreateNote.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
    notesMocks.useUpdateNote.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
    notesMocks.useDeleteNote.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
  });
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

describe("Learning Space Notes Cleanup and Temporary Guard", () => {
  it("does not render any demo notes initially and shows empty state when Notes tab is selected", () => {
    render(
      <Discussion
        persistenceKey="test-notes-empty"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Initial feed does not contain Ashi Singh's demo note
    expect(
      screen.queryByText(/Here’s a quick note on user empathy/i),
    ).not.toBeInTheDocument();

    // Click Notes filter tab
    const notesTab = screen.getByRole("button", { name: "Notes" });
    fireEvent.click(notesTab);

    // Shows empty state for notes
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
    expect(
      screen.getByText("Choose All to return to the full lesson discussion."),
    ).toBeInTheDocument();
  });

  it("sanitizes and ignores stale notes in sessionStorage while preserving Comments and Q&A", async () => {
    const key =
      "veolms-learning-test-stale-storage-discussion-markdown-entries-v1";
    const initialStored: Comment[] = [
      {
        id: 991,
        name: "Learner One",
        time: "10 mins ago",
        avatar: "/avatar.png",
        text: "Persisted learner comment",
        entryKind: "comment",
        likes: 1,
      },
      {
        id: 992,
        name: "Learner Two",
        time: "5 mins ago",
        avatar: "/avatar.png",
        text: "Stale offline note that should be purged",
        entryKind: "note",
        likes: 0,
      },
      {
        id: 993,
        name: "Learner Three",
        time: "1 min ago",
        avatar: "/avatar.png",
        text: "Persisted learner question",
        entryKind: "question",
        likes: 2,
        isQuestion: true,
      },
    ];

    window.sessionStorage.setItem(key, JSON.stringify(initialStored));

    render(
      <Discussion
        persistenceKey="test-stale-storage"
        interactionCapabilities={{
          allowComments: true,
          allowNotes: true,
          allowQa: true,
        }}
      />,
    );

    // Comments and Q&As from storage render
    await waitFor(() => {
      expect(
        screen.getByText("Persisted learner comment"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Persisted learner question"),
      ).toBeInTheDocument();
    });

    // Stale note does NOT render
    expect(
      screen.queryByText("Stale offline note that should be purged"),
    ).not.toBeInTheDocument();

    // SessionStorage has been sanitized
    await waitFor(() => {
      const storedAfter = JSON.parse(
        window.sessionStorage.getItem(key) ?? "[]",
      ) as Comment[];
      expect(
        storedAfter.some((entry) => entry.entryKind === "note"),
      ).toBe(false);
      expect(
        storedAfter.some(
          (entry) => entry.text === "Persisted learner comment",
        ),
      ).toBe(true);
      expect(
        storedAfter.some(
          (entry) => entry.text === "Persisted learner question",
        ),
      ).toBe(true);
    });
  });

  describe("Learning Space Notes Frontend API Integration", () => {
    const sampleNote = {
      id: "note-uuid-1234",
      userId: "user-123",
      courseId: "course-uuid-1",
      lessonId: "lesson-uuid-1",
      content: "This is a real backend note about design patterns",
      plainText: "This is a real backend note about design patterns",
      visibility: "private" as const,
      timestampSeconds: null,
      createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    };

    it("fetches notes with courseId and lessonId and renders them in Notes tab and All feed", () => {
      notesMocks.useUserNotes.mockImplementation((query?: any, options?: any) => {
        expect(query).toEqual({
          courseId: "course-uuid-1",
          lessonId: "lesson-uuid-1",
          limit: 50,
        });
        expect(options?.enabled).toBe(true);
        return {
          data: { notes: [sampleNote], nextCursor: null },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      });

      render(
        <Discussion
          persistenceKey="test-notes-api-feed"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: true,
            allowNotes: true,
            allowQa: true,
          }}
        />,
      );

      // Rendered in unified All feed alongside comments/questions
      expect(
        screen.getByText("This is a real backend note about design patterns"),
      ).toBeInTheDocument();

      // Click "Notes" tab
      fireEvent.click(screen.getByRole("button", { name: "Notes" }));
      expect(
        screen.getByText("This is a real backend note about design patterns"),
      ).toBeInTheDocument();
      // Tag shows "Note"
      expect(screen.getByText("1 Note")).toBeInTheDocument();
    });

    it("disables Notes query when allowNotes is false or IDs are missing", () => {
      notesMocks.useUserNotes.mockImplementation((_query?: any, options?: any) => {
        expect(options?.enabled).toBe(false);
        return {
          data: { notes: [], nextCursor: null },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        };
      });

      render(
        <Discussion
          persistenceKey="test-notes-api-disabled"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: true,
            allowNotes: false,
            allowQa: true,
          }}
        />,
      );

      expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    });

    it("does NOT expose Like, Reply, View replies, Share, or Report on Note cards", () => {
      notesMocks.useUserNotes.mockReturnValue({
        data: { notes: [sampleNote], nextCursor: null },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      const { container } = render(
        <Discussion
          persistenceKey="test-note-card-actions"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: false,
            allowNotes: true,
            allowQa: false,
          }}
        />,
      );

      const noteCard = container.querySelector(
        `#discussion-entry-${sampleNote.id}`,
      );
      expect(noteCard).toBeInTheDocument();

      // Engagement bar is not rendered
      expect(
        noteCard?.querySelector("[data-comment-engagement]"),
      ).not.toBeInTheDocument();
      // No like button
      expect(
        noteCard?.querySelector('button[aria-label="Like"]'),
      ).not.toBeInTheDocument();
      // No reply button
      expect(
        noteCard?.querySelector('button[aria-label="Reply"]'),
      ).not.toBeInTheDocument();

      // Card action menu has ONLY Edit note and Delete note
      const moreBtn = screen.getByRole("button", {
        name: `More actions for ${testCurrentUser.displayName}`,
      });
      fireEvent.click(moreBtn);

      expect(screen.getByRole("menuitem", { name: "Edit note" })).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Delete note" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Share" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Report" }),
      ).not.toBeInTheDocument();
    });

    it("shows Public, Unlisted, and Private options for Notes and does not silently reset to private", async () => {
      // Seed draft
      sessionStorage.setItem(
        "veolms-learning-test-note-visibility-options-discussion-markdown-draft-v1",
        JSON.stringify({
          format: "markdown",
          markdown: "Note visibility test",
          plainText: "Note visibility test",
        }),
      );

      render(
        <Discussion
          persistenceKey="test-note-visibility-options"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: true,
            allowNotes: true,
            allowQa: true,
          }}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Open discussion composer" }),
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Next: choose publishing options" }),
      );

      // Select Note
      fireEvent.click(screen.getByRole("radio", { name: "Note" }));

      // Verify all three options exist in DOM
      expect(screen.getByRole("radio", { name: "Public" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Unlisted" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Private" })).toBeInTheDocument();

      // Default visibility was public, so selecting Note should keep Public (not reset to private)
      expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();

      // Switch to Private
      fireEvent.click(screen.getByRole("radio", { name: "Private" }));
      expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();

      // Switch back to Comment -> Private is not allowed for comments, so it resets to Public
      fireEvent.click(screen.getByRole("radio", { name: "Comment" }));
      expect(screen.getByRole("radio", { name: "Public" })).toBeChecked();
      expect(screen.queryByRole("radio", { name: "Private" })).not.toBeInTheDocument();
    });

    it("allows selecting Public and posting Note with visibility: public", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      notesMocks.useCreateNote.mockReturnValue({
        mutateAsync,
        isPending: false,
      });

      sessionStorage.setItem(
        "veolms-learning-test-note-public-discussion-markdown-draft-v1",
        JSON.stringify({
          format: "markdown",
          markdown: "Public note insight",
          plainText: "Public note insight",
        }),
      );

      render(
        <Discussion
          persistenceKey="test-note-public"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: true,
            allowNotes: true,
            allowQa: true,
          }}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Open discussion composer" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Next: choose publishing options" }),
      );
      fireEvent.click(screen.getByRole("radio", { name: "Note" }));
      fireEvent.click(screen.getByRole("radio", { name: "Public" }));

      const postBtn = screen.getByRole("button", { name: "Post note" });
      fireEvent.click(postBtn);

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          courseId: "course-uuid-1",
          lessonId: "lesson-uuid-1",
          content: "Public note insight",
          visibility: "public",
        });
      });
    });

    it("allows selecting Unlisted and posting Note with visibility: unlisted", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      notesMocks.useCreateNote.mockReturnValue({
        mutateAsync,
        isPending: false,
      });

      sessionStorage.setItem(
        "veolms-learning-test-note-unlisted-discussion-markdown-draft-v1",
        JSON.stringify({
          format: "markdown",
          markdown: "Unlisted note insight",
          plainText: "Unlisted note insight",
        }),
      );

      render(
        <Discussion
          persistenceKey="test-note-unlisted"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: true,
            allowNotes: true,
            allowQa: true,
          }}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Open discussion composer" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Next: choose publishing options" }),
      );
      fireEvent.click(screen.getByRole("radio", { name: "Note" }));
      fireEvent.click(screen.getByRole("radio", { name: "Unlisted" }));

      const postBtn = screen.getByRole("button", { name: "Post note" });
      fireEvent.click(postBtn);

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          courseId: "course-uuid-1",
          lessonId: "lesson-uuid-1",
          content: "Unlisted note insight",
          visibility: "unlisted",
        });
      });
    });

    it("allows selecting Private and posting Note with visibility: private", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      notesMocks.useCreateNote.mockReturnValue({
        mutateAsync,
        isPending: false,
      });

      sessionStorage.setItem(
        "veolms-learning-test-note-private-discussion-markdown-draft-v1",
        JSON.stringify({
          format: "markdown",
          markdown: "Private note insight",
          plainText: "Private note insight",
        }),
      );

      render(
        <Discussion
          persistenceKey="test-note-private"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: true,
            allowNotes: true,
            allowQa: true,
          }}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Open discussion composer" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Next: choose publishing options" }),
      );
      fireEvent.click(screen.getByRole("radio", { name: "Note" }));
      fireEvent.click(screen.getByRole("radio", { name: "Private" }));

      const postBtn = screen.getByRole("button", { name: "Post note" });
      fireEvent.click(postBtn);

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalledWith({
          courseId: "course-uuid-1",
          lessonId: "lesson-uuid-1",
          content: "Private note insight",
          visibility: "private",
        });
      });
    });

    it("retains draft on create failure and displays error notice", async () => {
      const mutateAsync = vi.fn().mockRejectedValue(new Error("Network error"));
      notesMocks.useCreateNote.mockReturnValue({
        mutateAsync,
        isPending: false,
      });

      sessionStorage.setItem(
        "veolms-learning-test-note-failure-draft-discussion-markdown-draft-v1",
        JSON.stringify({
          format: "markdown",
          markdown: "Draft that should not be lost",
          plainText: "Draft that should not be lost",
        }),
      );

      render(
        <Discussion
          persistenceKey="test-note-failure-draft"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: false,
            allowNotes: true,
            allowQa: false,
          }}
        />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Open discussion composer" }),
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Next: choose publishing options" }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Post note" }));

      await waitFor(() => {
        expect(mutateAsync).toHaveBeenCalled();
      });

      // Error status announced
      expect(
        screen.getByText("Failed to save note. Please try again."),
      ).toBeInTheDocument();
    });

    it("calls deleteNote mutation when deleting a note and leaves Comments/Q&A sessionStorage untouched", async () => {
      vi.useFakeTimers();
      try {
        const deleteAsync = vi.fn().mockResolvedValue({});
        notesMocks.useDeleteNote.mockReturnValue({
          mutateAsync: deleteAsync,
          isPending: false,
        });
        notesMocks.useUserNotes.mockReturnValue({
          data: { notes: [sampleNote], nextCursor: null },
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        });

        render(
          <Discussion
            persistenceKey="test-delete-note"
            courseId="course-uuid-1"
            lessonId="lesson-uuid-1"
            interactionCapabilities={{
              allowComments: false,
              allowNotes: true,
              allowQa: false,
            }}
          />,
        );

        const moreBtn = screen.getByRole("button", {
          name: `More actions for ${testCurrentUser.displayName}`,
        });
        fireEvent.click(moreBtn);
        fireEvent.click(screen.getByRole("menuitem", { name: "Delete note" }));

        // Fast-forward past undo window
        await vi.advanceTimersByTimeAsync(11_000);

        expect(deleteAsync).toHaveBeenCalledWith(sampleNote.id);
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows loading and error states for notes", () => {
      notesMocks.useUserNotes.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      });

      const { rerender } = render(
        <Discussion
          persistenceKey="test-notes-loading-state"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: false,
            allowNotes: true,
            allowQa: false,
          }}
        />,
      );

      expect(screen.getByTestId("learning-notes-loading")).toBeInTheDocument();
      expect(screen.getByText("Loading notes…")).toBeInTheDocument();

      // Rerender in error state
      const refetch = vi.fn();
      notesMocks.useUserNotes.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        refetch,
      });

      rerender(
        <Discussion
          persistenceKey="test-notes-loading-state"
          courseId="course-uuid-1"
          lessonId="lesson-uuid-1"
          interactionCapabilities={{
            allowComments: false,
            allowNotes: true,
            allowQa: false,
          }}
        />,
      );

      expect(screen.getByTestId("learning-notes-error")).toBeInTheDocument();
      expect(screen.getByText("Failed to load notes")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });
  });
});

