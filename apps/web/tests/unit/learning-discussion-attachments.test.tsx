import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  DiscussionAttachmentsList,
  AttachmentComposerPreview,
  formatFileSize,
  getAttachmentCategory,
  getAttachmentAspectRatioStyle,
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
      width: 1920,
      height: 1080,
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

  it.each([
    [1080, 1920, "1080 / 1920", "min(100%, 13.5rem)"],
    [1920, 1080, "1920 / 1080", "min(100%, 35.55555555555556rem)"],
    [1080, 1080, "1080 / 1080", "min(100%, 20rem)"],
    [3840, 2160, "3840 / 2160", "min(100%, 35.55555555555556rem)"],
    [100, 1000, "100 / 1000", "min(100%, 2.4000000000000004rem)"],
  ])(
    "preserves the bounded geometry for %sx%s metadata",
    (width, height, aspectRatio, boundedWidth) => {
      expect(getAttachmentAspectRatioStyle({ width, height })).toEqual({
        aspectRatio,
        width: boundedWidth,
      });
    },
  );

  it.each([
    [undefined, undefined],
    [null, null],
    [0, 1080],
    [-1080, 1920],
    [1080.5, 1920],
    [1080, undefined],
  ])("uses the 16:9 fallback for invalid metadata %s×%s", (width, height) => {
    expect(getAttachmentAspectRatioStyle({ width, height })).toEqual({
      aspectRatio: "16 / 9",
      width: "min(100%, 35.55555555555556rem)",
    });
  });

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
    expect(img).toHaveClass("object-cover");
    expect(img).toHaveAttribute("src", "/api/v1/discussion-uploads/att-1.png");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");

    const imageSurface = screen.getByRole("button", {
      name: "View image diagram.png",
    });
    expect(item).toHaveStyle({
      width: "min(100%, 35.55555555555556rem)",
    });
    expect(imageSurface).toHaveStyle({ aspectRatio: "16 / 9" });
    expect(screen.getByTestId("discussion-image-placeholder")).toBeVisible();
    fireEvent.load(img);
    expect(
      screen.queryByTestId("discussion-image-placeholder"),
    ).toBeNull();
    expect(item).toHaveStyle({
      width: "min(100%, 35.55555555555556rem)",
    });
    expect(imageSurface).toHaveStyle({ aspectRatio: "16 / 9" });

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

  it.each([
    ["portrait", 1080, 1920, "min(100%, 13.5rem)", "1080 / 1920"],
    ["square", 1080, 1080, "min(100%, 20rem)", "1080 / 1080"],
    [
      "landscape",
      1920,
      1080,
      "min(100%, 35.55555555555556rem)",
      "1920 / 1080",
    ],
  ])(
    "keeps %s image shell geometry stable before and after load",
    (_label, width, height, boundedWidth, aspectRatio) => {
      render(
        <DiscussionAttachmentsList
          attachments={[
            {
              ...sampleAttachments[0]!,
              width,
              height,
            },
          ]}
        />,
      );

      const item = screen.getByTestId("discussion-attachment-item");
      const imageSurface = screen.getByRole("button", {
        name: "View image diagram.png",
      });
      const image = screen.getByRole("img", { name: "diagram.png" });

      expect(item).toHaveStyle({ width: boundedWidth });
      expect(imageSurface).toHaveStyle({ aspectRatio });
      expect(screen.getByTestId("discussion-image-placeholder")).toBeVisible();

      fireEvent.load(image);

      expect(
        screen.queryByTestId("discussion-image-placeholder"),
      ).toBeNull();
      expect(item).toHaveStyle({ width: boundedWidth });
      expect(imageSurface).toHaveStyle({ aspectRatio });
    },
  );

  it("opens images in the in-app viewer rather than a new browser tab", () => {
    render(<DiscussionAttachmentsList attachments={[sampleAttachments[0]!]} />);

    const imageButton = screen.getByRole("button", {
      name: "View image diagram.png",
    });
    expect(imageButton.closest("a")).toBeNull();
    fireEvent.click(imageButton);
    expect(screen.getByTestId("discussion-image-viewer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
    expect(screen.queryByRole("button", { name: "Close image preview" })).toBeNull();
  });

  it("closes the image viewer on the native Escape/cancel event", () => {
    render(<DiscussionAttachmentsList attachments={[sampleAttachments[0]!]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "View image diagram.png" }),
    );
    fireEvent.cancel(screen.getByTestId("discussion-image-viewer"));
    expect(screen.queryByRole("button", { name: "Close image preview" })).toBeNull();
  });

  it("uses the attachment surface for upload progress without a numeric bar", () => {
    render(
      <DiscussionAttachmentsList
        attachments={[
          {
            ...sampleAttachments[0]!,
            id: "client-image",
            clientId: "client-image",
            localPreviewUrl: "blob:preview",
            uploadState: "uploading",
            uploadProgress: 0.4,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("attachment-upload-treatment")).toHaveStyle({
      width: "60%",
    });
    expect(screen.queryByText("40%")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders persisted videos as unloaded placeholders until play", () => {
    render(<DiscussionAttachmentsList attachments={[sampleAttachments[1]!]} />);

    const item = screen.getByTestId("discussion-attachment-item");
    expect(item).toHaveAttribute("data-attachment-type", "video");

    expect(item.querySelector("video")).toBeNull();
    const placeholder = screen.getByTestId("thumbnail-placeholder-background");
    expect(placeholder).toHaveClass(
      "bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--surface-strong)_85%,transparent)_0%,color-mix(in_srgb,var(--track)_95%,var(--canvas))_100%)]",
    );
    expect(placeholder.firstElementChild).toHaveClass("dark:opacity-[0.07]");
    expect(placeholder.firstElementChild).toHaveStyle({
      backgroundSize: "24px 24px",
    });
    expect(placeholder.querySelector("svg")).toBeNull();
    const playButton = screen.getByRole("button", {
      name: "Play video lecture-clip.mp4",
    });
    expect(playButton).toHaveClass("gap-2.5");
    expect(playButton.querySelector("span")).toHaveClass("size-14");
    expect(playButton.querySelector("svg")).toHaveAttribute("width", "28");
    expect(screen.getByText("Play video")).toHaveClass("font-semibold");
    const mediaSurface = playButton.parentElement;
    expect(item).toHaveStyle({
      width: "min(100%, 35.55555555555556rem)",
    });
    expect(mediaSurface).toHaveStyle({
      aspectRatio: "1920 / 1080",
    });
    fireEvent.click(playButton);

    const video = item.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video?.parentElement).toBe(mediaSurface);
    expect(video).toHaveAttribute("src", "/api/v1/discussion-uploads/att-2.mp4");

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

  it("uses a bounded 16:9 placeholder when video dimensions are unavailable", () => {
    render(
      <DiscussionAttachmentsList
        attachments={[{ ...sampleAttachments[1]!, width: null, height: null }]}
      />,
    );

    const playButton = screen.getByRole("button", {
      name: "Play video lecture-clip.mp4",
    });
    expect(screen.getByTestId("discussion-attachment-item")).toHaveStyle({
      width: "min(100%, 35.55555555555556rem)",
    });
    expect(playButton.parentElement).toHaveStyle({
      aspectRatio: "16 / 9",
    });
    expect(playButton.parentElement?.querySelector("video")).toBeNull();
  });

  it.each([
    ["portrait", 1080, 1920, "min(100%, 13.5rem)", "1080 / 1920"],
    ["square", 1080, 1080, "min(100%, 20rem)", "1080 / 1080"],
    ["landscape", 1920, 1080, "min(100%, 35.55555555555556rem)", "1920 / 1080"],
  ])(
    "uses one bounded shell for %s video geometry",
    (_label, width, height, boundedWidth, aspectRatio) => {
      render(
        <DiscussionAttachmentsList
          attachments={[{ ...sampleAttachments[1]!, width, height }]}
        />,
      );

      const item = screen.getByTestId("discussion-attachment-item");
      const playButton = screen.getByRole("button", {
        name: "Play video lecture-clip.mp4",
      });
      expect(item).toHaveStyle({ width: boundedWidth });
      expect(item.style.marginInline).toBe("");
      expect(playButton.parentElement).toHaveStyle({ aspectRatio });
      expect(item.querySelector("video")).toBeNull();
    },
  );

  it("constrains long portrait filenames without widening the shell", () => {
    render(
      <DiscussionAttachmentsList
        attachments={[
          {
            ...sampleAttachments[1]!,
            fileName: "a-very-long-portrait-video-filename-that-must-truncate.mp4",
            width: 1080,
            height: 1920,
          },
        ]}
      />,
    );

    const item = screen.getByTestId("discussion-attachment-item");
    expect(item).toHaveStyle({
      width: "min(100%, 13.5rem)",
    });
    expect(item.style.marginInline).toBe("");
    expect(screen.getByText("a-very-long-portrait-video-filename-that-must-truncate.mp4"))
      .toHaveClass("truncate");
    expect(screen.getByRole("link", { name: /Download .*portrait-video/ }))
      .toBeInTheDocument();
  });

  it("activates only the selected persisted video and supports keyboard play", () => {
    const videos = [
      { ...sampleAttachments[1]!, id: "video-a", fileName: "a.mp4" },
      { ...sampleAttachments[1]!, id: "video-b", fileName: "b.mp4" },
    ];
    render(<DiscussionAttachmentsList attachments={videos} />);

    const firstPlay = screen.getByRole("button", { name: "Play video a.mp4" });
    fireEvent.keyDown(firstPlay, { key: "Enter", code: "Enter" });

    const items = screen.getAllByTestId("discussion-attachment-item");
    expect(items[0]?.querySelector("video")).toBeInTheDocument();
    expect(items[1]?.querySelector("video")).toBeNull();
  });

  it("keeps a reconciled remote video unloaded until explicit activation", () => {
    const { rerender } = render(
      <DiscussionAttachmentsList
        attachments={[
          {
            ...sampleAttachments[1]!,
            id: "client-video",
            clientId: "client-video",
            localPreviewUrl: "blob:optimistic-video",
            uploadState: "uploading",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("discussion-attachment-item").querySelector("video"))
      .toBeInTheDocument();

    rerender(
      <DiscussionAttachmentsList
        attachments={[
          {
            ...sampleAttachments[1]!,
            id: "client-video",
            clientId: "client-video",
            serverId: "server-video",
            localPreviewUrl: undefined,
            uploadState: "confirmed",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("discussion-attachment-item").querySelector("video"))
      .toBeNull();
  });

  it("keeps the attachment card usable when activated video playback fails", () => {
    render(<DiscussionAttachmentsList attachments={[sampleAttachments[1]!]} />);
    fireEvent.click(screen.getByRole("button", { name: "Play video lecture-clip.mp4" }));
    fireEvent.error(
      screen.getByLabelText("Video attachment: lecture-clip.mp4"),
    );

    expect(screen.getByText("Unable to load video. Retry")).toBeInTheDocument();
    expect(screen.getByText("lecture-clip.mp4")).toBeInTheDocument();
  });

  it("keeps local video previews active without activating remote playback", () => {
    render(
      <DiscussionAttachmentsList
        attachments={[
          {
            ...sampleAttachments[1]!,
            id: "local-video",
            localPreviewUrl: "blob:local-video",
            uploadState: "uploading",
          },
        ]}
      />,
    );

    expect(screen.getByTestId("discussion-attachment-item").querySelector("video"))
      .toHaveAttribute("src", "blob:local-video");
    expect(
      screen.queryByRole("button", { name: "Play video lecture-clip.mp4" }),
    ).toBeNull();
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

  it("does not render a separate upload notice in the composer", () => {
    render(
      <AttachmentComposerPreview
        attachments={[]}
        onRemove={() => {}}
      />,
    );

    expect(screen.queryByTestId("composer-uploading-indicator")).toBeNull();
    expect(screen.queryByText("Uploading attachment…")).toBeNull();
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
