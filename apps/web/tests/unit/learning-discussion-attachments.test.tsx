import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  DiscussionAttachmentsList,
  AttachmentComposerPreview,
  formatFileSize,
  getAttachmentCategory,
  type DiscussionAttachmentItem,
} from "../../src/learning/discussion-attachments";
import { CommentCard, type Comment } from "../../src/learning/CommentCard";
import { adaptLearningThreadToComment } from "../../src/learning/learning-threads.adapter";
import { adaptLearningReplyToCommentReply } from "../../src/learning/learning-replies.adapter";
import { adaptLearningNoteToComment } from "../../src/learning/learning-notes.adapter";
import type {
  LearningThread,
  LearningReply,
  LearningNote,
} from "@veolms/contracts";

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: () => ({
    data: { id: "user-1", displayName: "Jane Doe" },
  }),
}));

vi.mock("../../src/services/learning-interactions", () => ({
  useToggleLike: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateReply: () => ({ mutateAsync: vi.fn() }),
  useDeleteReply: () => ({ mutateAsync: vi.fn() }),
  useThreadReplies: () => ({
    data: { replies: [] },
    isLoading: false,
    isError: false,
  }),
}));

describe("Discussion Attachments Utilities", () => {
  it("formats file size accurately across units", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(15 * 1024 * 1024)).toBe("15 MB");
  });

  it("categorizes MIME types and kinds correctly", () => {
    expect(getAttachmentCategory("image/png")).toBe("image");
    expect(getAttachmentCategory("image/jpeg")).toBe("image");
    expect(getAttachmentCategory("image/webp")).toBe("image");
    expect(getAttachmentCategory("video/mp4")).toBe("video");
    expect(getAttachmentCategory("video/webm")).toBe("video");
    expect(getAttachmentCategory("application/json")).toBe("code");
    expect(getAttachmentCategory("text/plain", "code")).toBe("code");
    expect(getAttachmentCategory("application/pdf")).toBe("document");
    expect(
      getAttachmentCategory(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("document");
  });
});

describe("DiscussionAttachmentsList Component", () => {
  const sampleAttachments: DiscussionAttachmentItem[] = [
    {
      id: "att-1",
      fileName: "diagram.png",
      fileUrl: "/api/v1/discussion-uploads/att-1.png",
      mimeType: "image/png",
      fileSize: 204800,
      kind: "image",
    },
    {
      id: "att-2",
      fileName: "lecture-clip.mp4",
      fileUrl: "/api/v1/discussion-uploads/att-2.mp4",
      mimeType: "video/mp4",
      fileSize: 5242880,
      kind: "document",
      mediaType: "video",
    },
    {
      id: "att-3",
      fileName: "syllabus.pdf",
      fileUrl: "/api/v1/discussion-uploads/att-3.pdf",
      mimeType: "application/pdf",
      fileSize: 1048576,
      kind: "document",
    },
    {
      id: "att-4",
      fileName: "algorithm.json",
      fileUrl: "/api/v1/discussion-uploads/att-4.json",
      mimeType: "application/json",
      fileSize: 4096,
      kind: "code",
    },
  ];

  it("returns null when attachments list is empty or undefined", () => {
    const { container: c1 } = render(<DiscussionAttachmentsList />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <DiscussionAttachmentsList attachments={[]} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("renders images with preview, file name, formatted size, and download link", () => {
    render(<DiscussionAttachmentsList attachments={[sampleAttachments[0]!]} />);

    expect(
      screen.getByTestId("discussion-attachments-list"),
    ).toBeInTheDocument();
    const item = screen.getByTestId("discussion-attachment-item");
    expect(item).toHaveAttribute("data-attachment-type", "image");

    const img = screen.getByRole("img", { name: "diagram.png" });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/api/v1/discussion-uploads/att-1.png");

    expect(screen.getByText("diagram.png")).toBeInTheDocument();
    expect(screen.getByText("200 KB")).toBeInTheDocument();

    const downloadLink = screen.getByRole("link", {
      name: "Download diagram.png",
    });
    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/v1/discussion-uploads/att-1.png",
    );
    expect(downloadLink).toHaveAttribute("download", "diagram.png");
  });

  it("renders videos with video element and download link", () => {
    render(<DiscussionAttachmentsList attachments={[sampleAttachments[1]!]} />);

    const item = screen.getByTestId("discussion-attachment-item");
    expect(item).toHaveAttribute("data-attachment-type", "video");

    const video = item.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute(
      "src",
      "/api/v1/discussion-uploads/att-2.mp4",
    );

    expect(screen.getByText("lecture-clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("5.0 MB")).toBeInTheDocument();

    const downloadLink = screen.getByRole("link", {
      name: "Download lecture-clip.mp4",
    });
    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/v1/discussion-uploads/att-2.mp4",
    );
  });

  it("renders documents and code files with icon, size, and download link", () => {
    render(
      <DiscussionAttachmentsList
        attachments={[sampleAttachments[2]!, sampleAttachments[3]!]}
      />,
    );

    expect(screen.getByText("syllabus.pdf")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument();
    const pdfDownload = screen.getByRole("link", {
      name: "Download syllabus.pdf",
    });
    expect(pdfDownload).toHaveAttribute(
      "href",
      "/api/v1/discussion-uploads/att-3.pdf",
    );
    expect(pdfDownload).toHaveAttribute("download", "syllabus.pdf");

    expect(screen.getByText("algorithm.json")).toBeInTheDocument();
    expect(screen.getByText("4.0 KB")).toBeInTheDocument();
    const codeDownload = screen.getByRole("link", {
      name: "Download algorithm.json",
    });
    expect(codeDownload).toHaveAttribute(
      "href",
      "/api/v1/discussion-uploads/att-4.json",
    );
    expect(codeDownload).toHaveAttribute("download", "algorithm.json");
  });
});

describe("AttachmentComposerPreview Component", () => {
  const items: DiscussionAttachmentItem[] = [
    {
      id: "a-1",
      fileName: "notes.pdf",
      fileUrl: "/api/v1/discussion-uploads/notes.pdf",
      mimeType: "application/pdf",
      fileSize: 10240,
    },
    {
      id: "a-2",
      fileName: "photo.jpg",
      fileUrl: "/api/v1/discussion-uploads/photo.jpg",
      mimeType: "image/jpeg",
      fileSize: 51200,
    },
  ];

  it("returns null when empty and not uploading", () => {
    const { container } = render(
      <AttachmentComposerPreview attachments={[]} onRemove={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders pending attachments and triggers onRemove when button clicked", () => {
    const onRemove = vi.fn();
    render(
      <AttachmentComposerPreview attachments={items} onRemove={onRemove} />,
    );

    expect(
      screen.getByTestId("attachment-composer-preview"),
    ).toBeInTheDocument();
    expect(screen.getByText("notes.pdf")).toBeInTheDocument();
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", {
      name: /Remove/i,
    });
    expect(removeButtons).toHaveLength(2);

    fireEvent.click(removeButtons[0]!);
    expect(onRemove).toHaveBeenCalledWith("a-1");
  });

  it("shows uploading spinner when isUploading is true", () => {
    render(
      <AttachmentComposerPreview
        attachments={[]}
        onRemove={() => {}}
        isUploading={true}
      />,
    );

    expect(
      screen.getByTestId("composer-uploading-indicator"),
    ).toBeInTheDocument();
    expect(screen.getByText("Uploading attachment…")).toBeInTheDocument();
  });
});

describe("Adapters & CommentCard Integration", () => {
  const mockThread: LearningThread = {
    id: "th-1",
    academyId: "acad-1",
    courseId: "course-1",
    lessonId: "lesson-1",
    userId: "user-1",
    author: {
      id: "user-1",
      displayName: "Jane Doe",
      username: "janedoe",
      avatarUrl: null,
      role: "Student",
    },
    kind: "comment",
    title: null,
    content: "Check this attachment out",
    plainText: "Check this attachment out",
    visibility: "public",
    status: "active",
    isLocked: false,
    acceptedAnswerId: null,
    likesCount: 0,
    repliesCount: 0,
    attachments: [
      {
        id: "att-th-1",
        kind: "document",
        fileName: "handout.pdf",
        fileUrl: "/api/v1/discussion-uploads/att-th-1.pdf",
        mimeType: "application/pdf",
        fileSize: 1048576,
      },
    ],
    isLiked: false,
    isBookmarked: false,
    isFollowing: false,
    isOwn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("adapts LearningThread with attachments to Comment", () => {
    const comment = adaptLearningThreadToComment(mockThread, "user-1");
    expect(comment.attachments).toHaveLength(1);
    expect(comment.attachments?.[0]?.fileName).toBe("handout.pdf");
  });

  it("adapts LearningReply with attachments to CommentReply", () => {
    const mockReply: LearningReply = {
      id: "rep-1",
      threadId: "th-1",
      parentReplyId: null,
      replyToReplyId: null,
      replyToUserId: null,
      userId: "user-2",
      author: {
        id: "user-2",
        displayName: "Teacher",
        username: "teacher",
        avatarUrl: null,
        role: "Instructor",
      },
      content: "Here is the code solution",
      plainText: "Here is the code solution",
      isAccepted: false,
      status: "active",
      likesCount: 2,
      attachments: [
        {
          id: "att-rep-1",
          kind: "code",
          fileName: "solution.json",
          fileUrl: "/api/v1/discussion-uploads/solution.json",
          mimeType: "application/json",
          fileSize: 1024,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const reply = adaptLearningReplyToCommentReply(mockReply, "user-1");
    expect(reply.attachments).toHaveLength(1);
    expect(reply.attachments?.[0]?.fileName).toBe("solution.json");
  });

  it("adapts LearningNote with attachments to Comment", () => {
    const mockNote: LearningNote = {
      id: "note-1",
      courseId: "course-1",
      lessonId: "lesson-1",
      userId: "user-1",
      title: "My Note",
      content: "Note with screenshot",
      plainText: "Note with screenshot",
      visibility: "private",
      tags: [],
      likesCount: 0,
      timestampSeconds: null,
      attachments: [
        {
          id: "att-note-1",
          kind: "screenshot",
          fileName: "screenshot.png",
          fileUrl: "/api/v1/discussion-uploads/screenshot.png",
          mimeType: "image/png",
          fileSize: 150000,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const noteComment = adaptLearningNoteToComment(
      mockNote,
      "Jane Doe",
      "/avatar.png",
    );
    expect(noteComment.attachments).toHaveLength(1);
    expect(noteComment.attachments?.[0]?.fileName).toBe("screenshot.png");
  });

  it("renders attachments inside CommentCard for thread and notes", () => {
    const comment: Comment = adaptLearningThreadToComment(mockThread, "user-1");

    render(
      <CommentCard
        comment={comment}
        onLike={() => {}}
        onOpenThread={() => {}}
      />,
    );

    expect(
      screen.getByTestId("discussion-attachments-list"),
    ).toBeInTheDocument();
    expect(screen.getByText("handout.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download handout.pdf" }),
    ).toHaveAttribute("download", "handout.pdf");
  });
});
