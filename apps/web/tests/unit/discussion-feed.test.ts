import { describe, expect, it } from "vitest";
import type { Comment } from "../../src/learning/CommentCard";
import {
  applyDiscussionFeed,
  getDiscussionFeedCountLabel,
} from "../../src/learning/discussionFeed";

const entries: Comment[] = [
  {
    id: 4,
    name: "Rohit Sharma",
    time: "2 hours ago",
    avatar: "/rohit.jpg",
    text: "Great explanation!",
    entryKind: "comment",
    likes: 24,
  },
  {
    id: 3,
    name: "Neha Patel",
    time: "3 hours ago",
    avatar: "/neha.jpg",
    text: "Can you share examples?",
    entryKind: "question",
    likes: 18,
    isQuestion: true,
  },
  {
    id: 2,
    name: "Ashi Singh",
    time: "1 day ago",
    avatar: "/ashi.jpg",
    text: "User empathy notes",
    entryKind: "note",
    likes: 8,
  },
  {
    id: 1,
    name: "Vivek Nair",
    time: "1 day ago",
    avatar: "/vivek.jpg",
    text: "How many interviews?",
    entryKind: "question",
    likes: 11,
    isQuestion: true,
  },
];

describe("getDiscussionFeedCountLabel", () => {
  it("names the count after the selected discussion tab", () => {
    expect(getDiscussionFeedCountLabel("all", 4)).toBe("4\u00A0\u00A0Discussions");
    expect(getDiscussionFeedCountLabel("all", 1)).toBe("1\u00A0\u00A0Discussion");
    expect(getDiscussionFeedCountLabel("note", 1)).toBe("1\u00A0\u00A0Note");
    expect(getDiscussionFeedCountLabel("comment", 2)).toBe("2\u00A0\u00A0Comments");
    expect(getDiscussionFeedCountLabel("question", 2)).toBe("2\u00A0\u00A0Q&As");
  });
});

describe("applyDiscussionFeed", () => {
  it("keeps newest entries first by default", () => {
    expect(
      applyDiscussionFeed({
        currentUserName: "Ashi Singh",
        entries,
        filter: "all",
        sort: "newest",
      }).map((entry) => entry.id),
    ).toEqual([4, 3, 2, 1]);
  });

  it("orders by likes for Top", () => {
    expect(
      applyDiscussionFeed({
        currentUserName: "Ashi Singh",
        entries,
        filter: "all",
        sort: "top",
      }).map((entry) => entry.name),
    ).toEqual([
      "Rohit Sharma",
      "Neha Patel",
      "Vivek Nair",
      "Ashi Singh",
    ]);
  });

  it("keeps only the current person's entries for Mine", () => {
    expect(
      applyDiscussionFeed({
        currentUserName: "Ashi Singh",
        entries,
        filter: "all",
        sort: "mine",
      }).map((entry) => entry.id),
    ).toEqual([2]);
  });

  it("applies Mine after the selected entry type", () => {
    expect(
      applyDiscussionFeed({
        currentUserName: "Ashi Singh",
        entries,
        filter: "comment",
        sort: "mine",
      }),
    ).toEqual([]);
    expect(
      applyDiscussionFeed({
        currentUserName: "Ashi Singh",
        entries,
        filter: "note",
        sort: "mine",
      }).map((entry) => entry.entryKind),
    ).toEqual(["note"]);
  });
});
