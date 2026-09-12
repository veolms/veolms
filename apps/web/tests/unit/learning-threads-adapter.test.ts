import { describe, expect, it } from "vitest";
import type { LearningThread } from "@veolms/contracts";
import {
  adaptLearningThreadToComment,
  isCommentOrQaThread,
} from "../../src/learning/learning-threads.adapter";

describe("learning-threads.adapter", () => {
  const mockBaseThread: LearningThread = {
    id: "thread-uuid-1",
    academyId: "academy-uuid-1",
    courseId: "course-uuid-1",
    lessonId: "lesson-uuid-1",
    userId: "user-uuid-1",
    author: {
      id: "user-uuid-1",
      displayName: "Jane Doe",
      username: "janedoe",
      avatarUrl: "https://example.com/avatar.jpg",
      role: "Instructor",
    },
    kind: "comment",
    title: "Great lesson",
    content: "This is a markdown content string",
    plainText: "This is a markdown content string",
    timestampSeconds: 42,
    visibility: "public",
    status: "active",
    isLocked: false,
    likesCount: 15,
    repliesCount: 3,
    isLiked: true,
    isOwn: true,
    createdAt: "2026-03-01T12:00:00.000Z",
    updatedAt: "2026-03-01T12:00:00.000Z",
  };

  describe("isCommentOrQaThread", () => {
    it("returns true for kind === 'comment'", () => {
      expect(isCommentOrQaThread({ ...mockBaseThread, kind: "comment" })).toBe(true);
    });

    it("returns true for kind === 'question'", () => {
      expect(isCommentOrQaThread({ ...mockBaseThread, kind: "question" })).toBe(true);
    });

    it("returns true for kind === 'qna'", () => {
      expect(isCommentOrQaThread({ ...mockBaseThread, kind: "qna" })).toBe(true);
    });

    it("returns false for kind === 'note' (notes must come from Notes API)", () => {
      expect(isCommentOrQaThread({ ...mockBaseThread, kind: "note" })).toBe(false);
    });
  });

  describe("adaptLearningThreadToComment", () => {
    it("adapts a comment thread accurately", () => {
      const adapted = adaptLearningThreadToComment(mockBaseThread, "user-uuid-1");

      expect(adapted.id).toBe("thread-uuid-1");
      expect(adapted.name).toBe("Jane Doe");
      expect(adapted.avatar).toBe("https://example.com/avatar.jpg");
      expect(adapted.text).toBe("This is a markdown content string");
      expect(adapted.content?.markdown).toBe("This is a markdown content string");
      expect(adapted.visibility).toBe("public");
      expect(adapted.likes).toBe(15);
      expect(adapted.liked).toBe(true);
      expect(adapted.replies).toBe(3);
      expect(adapted.thread).toEqual([]);
      expect(adapted.isQuestion).toBe(false);
      expect(adapted.entryKind).toBe("comment");
      expect(adapted.role).toBe("Instructor");
      expect(adapted.isOwn).toBe(true);
      expect(adapted.timestampSeconds).toBe(42);
    });

    it("maps author role without fabrication", () => {
      const studentThread: LearningThread = {
        ...mockBaseThread,
        author: {
          ...mockBaseThread.author,
          role: "Student",
        },
      };
      expect(adaptLearningThreadToComment(studentThread).role).toBe("Student");

      const adminThread: LearningThread = {
        ...mockBaseThread,
        author: {
          ...mockBaseThread.author,
          role: "Admin",
        },
      };
      expect(adaptLearningThreadToComment(adminThread).role).toBe("Admin");
    });

    it("adapts question thread with isQuestion = true and entryKind = question", () => {
      const questionThread: LearningThread = {
        ...mockBaseThread,
        kind: "question",
      };
      const adapted = adaptLearningThreadToComment(questionThread);
      expect(adapted.isQuestion).toBe(true);
      expect(adapted.entryKind).toBe("question");
    });

    it("adapts qna thread with isQuestion = true and entryKind = question", () => {
      const qnaThread: LearningThread = {
        ...mockBaseThread,
        kind: "qna",
      };
      const adapted = adaptLearningThreadToComment(qnaThread);
      expect(adapted.isQuestion).toBe(true);
      expect(adapted.entryKind).toBe("question");
    });

    it("adapts attachment summary when present", () => {
      const threadWithAttachment: LearningThread = {
        ...mockBaseThread,
        attachments: [
          {
            id: "att-1",
            kind: "image",
            fileName: "screenshot.png",
            fileUrl: "https://example.com/screenshot.png",
            mimeType: "image/png",
            fileSize: 204800,
          },
        ],
      };
      const adapted = adaptLearningThreadToComment(threadWithAttachment);
      expect(adapted.attachment).toEqual({
        name: "screenshot.png",
        meta: "image/png · 200 KB",
      });
    });

    it("falls back to author username or 'Learner' if displayName is missing", () => {
      const noDisplayName: LearningThread = {
        ...mockBaseThread,
        author: {
          ...mockBaseThread.author,
          displayName: "",
          username: "jdoe",
        },
      };
      expect(adaptLearningThreadToComment(noDisplayName).name).toBe("jdoe");
    });
  });
});
