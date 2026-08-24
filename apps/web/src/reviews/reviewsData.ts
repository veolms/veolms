export interface ReviewReply {
  id: string;
  authorName: string;
  authorRole: string;
  avatarUrl: string;
  timestamp: string;
  content: string;
}

export interface ReviewItem {
  id: string;
  authorName: string;
  avatarUrl: string;
  isVerifiedLearner: boolean;
  rating: number; // 1 - 5
  timestamp: string;
  title: string;
  content: string;
  helpfulCount: number;
  isHelpfulByUser?: boolean;
  reply?: ReviewReply;
  hasComments?: boolean;
  isCurrentUser?: boolean;
}

export interface RatingBreakdown {
  stars: number;
  percentage: number;
  count: number;
}

export interface RatingSummaryData {
  averageRating: number;
  totalReviews: number;
  breakdown: readonly RatingBreakdown[];
}

export interface HighlightItem {
  id: string;
  value: string;
  label: string;
  iconType: "recommend" | "verified" | "replies";
}

export interface TopReviewer {
  id: string;
  name: string;
  avatarUrl: string;
  reviewCount: number;
  rating: number;
}

export interface CourseReviewMeta {
  courseId: string;
  courseTitle: string;
  badgeText: string;
  badgeColor: string;
  averageRating: number;
  totalReviews: number;
  lastUpdated: string;
}

export type ReviewTabId =
  | "all"
  | "with-comments"
  | "highest-rated"
  | "lowest-rated"
  | "my-review";

export const initialCourseMeta: CourseReviewMeta = {
  courseId: "typescript-course",
  courseTitle: "The Ultimate TypeScript Course",
  badgeText: "TS",
  badgeColor: "#2563eb",
  averageRating: 4.8,
  totalReviews: 128,
  lastUpdated: "2 days ago",
};

export const initialRatingSummary: RatingSummaryData = {
  averageRating: 4.8,
  totalReviews: 128,
  breakdown: [
    { stars: 5, percentage: 82, count: 105 },
    { stars: 4, percentage: 12, count: 15 },
    { stars: 3, percentage: 4, count: 5 },
    { stars: 2, percentage: 1, count: 2 },
    { stars: 1, percentage: 1, count: 1 },
  ],
};

export const initialHighlights: readonly HighlightItem[] = [
  {
    id: "recommend",
    value: "98%",
    label: "would recommend this course",
    iconType: "recommend",
  },
  {
    id: "verified",
    value: "125",
    label: "verified reviews",
    iconType: "verified",
  },
  {
    id: "replies",
    value: "12",
    label: "reviews with instructor replies",
    iconType: "replies",
  },
];

export const initialTopReviewers: readonly TopReviewer[] = [
  {
    id: "ashi-singh",
    name: "Ashi Singh",
    avatarUrl: "/assets/sofia-avatar-160.webp",
    reviewCount: 12,
    rating: 5.0,
  },
  {
    id: "rahul-sharma",
    name: "Rahul Sharma",
    avatarUrl: "/assets/ethan-avatar-160.webp",
    reviewCount: 7,
    rating: 5.0,
  },
  {
    id: "anurag-singh",
    name: "Anurag Singh",
    avatarUrl: "/assets/ethan-avatar-160.webp",
    reviewCount: 8,
    rating: 4.5,
  },
];

export const initialReviewsList: readonly ReviewItem[] = [
  {
    id: "rev-1",
    authorName: "Ashi Singh",
    avatarUrl: "/assets/sofia-avatar-160.webp",
    isVerifiedLearner: true,
    rating: 5,
    timestamp: "2 days ago",
    title: "Excellent TypeScript course",
    content:
      "The explanations are very clear and the examples helped me understand conditional and mapped types much better.",
    helpfulCount: 12,
    isHelpfulByUser: false,
    hasComments: true,
    isCurrentUser: true,
  },
  {
    id: "rev-2",
    authorName: "Anurag Singh",
    avatarUrl: "/assets/ethan-avatar-160.webp",
    isVerifiedLearner: true,
    rating: 4,
    timestamp: "5 days ago",
    title: "Very useful, but some sections are lengthy",
    content:
      "The content is strong and practical. I especially liked the real-world examples, although a few lectures could be shorter.",
    helpfulCount: 8,
    isHelpfulByUser: false,
    hasComments: true,
    reply: {
      id: "reply-1",
      authorName: "Instructor",
      authorRole: "Instructor",
      avatarUrl: "/assets/ethan-avatar-160.webp",
      timestamp: "4 days ago",
      content:
        "Thanks for the feedback! We'll keep this in mind while creating future content.",
    },
  },
  {
    id: "rev-3",
    authorName: "Rahul Sharma",
    avatarUrl: "/assets/ethan-avatar-160.webp",
    isVerifiedLearner: true,
    rating: 5,
    timestamp: "1 week ago",
    title: "Great course for beginners",
    content:
      "The instructor explains difficult concepts in a simple way. The practical examples made the learning experience much easier.",
    helpfulCount: 15,
    isHelpfulByUser: false,
    hasComments: false,
  },
  {
    id: "rev-4",
    authorName: "Priya Mehta",
    avatarUrl: "/assets/sofia-avatar-160.webp",
    isVerifiedLearner: true,
    rating: 4,
    timestamp: "2 weeks ago",
    title: "Well structured and easy to follow",
    content:
      "I liked the structure and the coding exercises. Some advanced topics could use more practical examples.",
    helpfulCount: 9,
    isHelpfulByUser: false,
    hasComments: false,
  },
  {
    id: "rev-5",
    authorName: "Vikram Malhotra",
    avatarUrl: "/assets/ethan-avatar-160.webp",
    isVerifiedLearner: true,
    rating: 5,
    timestamp: "3 weeks ago",
    title: "Best TypeScript course on the platform",
    content:
      "Covered everything from generics to advanced utility types in depth. Worth every minute spent!",
    helpfulCount: 21,
    isHelpfulByUser: false,
    hasComments: true,
  },
  {
    id: "rev-6",
    authorName: "Sneha Patel",
    avatarUrl: "/assets/sofia-avatar-160.webp",
    isVerifiedLearner: false,
    rating: 3,
    timestamp: "1 month ago",
    title: "Decent overview, needs more backend examples",
    content:
      "Good foundational explanations, but I wanted to see more fullstack Node.js + TypeScript integration examples.",
    helpfulCount: 4,
    isHelpfulByUser: false,
    hasComments: false,
  },
];
