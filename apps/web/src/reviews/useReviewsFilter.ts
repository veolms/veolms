import { useMemo, useState } from "react";
import {
  initialCourseMeta,
  initialHighlights,
  initialRatingSummary,
  initialReviewsList,
  initialTopReviewers,
  type CourseReviewMeta,
  type HighlightItem,
  type RatingSummaryData,
  type ReviewItem,
  type ReviewTabId,
  type TopReviewer,
} from "./reviewsData";

export type RatingFilterOption = "all" | "5" | "4" | "3" | "2" | "1";
export type SortOption = "recent" | "highest" | "lowest" | "helpful";

export interface UseReviewsFilterReturn {
  courseMeta: CourseReviewMeta;
  ratingSummary: RatingSummaryData;
  highlights: readonly HighlightItem[];
  topReviewers: readonly TopReviewer[];
  reviews: readonly ReviewItem[];
  totalFilteredCount: number;
  activeTab: ReviewTabId;
  setActiveTab: (tab: ReviewTabId) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  ratingFilter: RatingFilterOption;
  setRatingFilter: (filter: RatingFilterOption) => void;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  verifiedOnly: boolean;
  setVerifiedOnly: (verified: boolean | ((prev: boolean) => boolean)) => void;
  isBookmarked: boolean;
  toggleBookmark: () => void;
  isWriteModalOpen: boolean;
  setIsWriteModalOpen: (open: boolean) => void;
  isSupportModalOpen: boolean;
  setIsSupportModalOpen: (open: boolean) => void;
  toggleHelpful: (reviewId: string) => void;
  reportReview: (reviewId: string) => void;
  addReview: (newReview: {
    rating: number;
    title: string;
    content: string;
    recommend: boolean;
  }) => void;
  resetFilters: () => void;
}

export function useReviewsFilter(
  setNotice?: (message: string) => void,
): UseReviewsFilterReturn {
  const [reviewsList, setReviewsList] =
    useState<readonly ReviewItem[]>(initialReviewsList);
  const [activeTab, setActiveTab] = useState<ReviewTabId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<RatingFilterOption>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  const toggleBookmark = () => {
    setIsBookmarked((prev) => {
      const next = !prev;
      setNotice?.(
        next
          ? "Course reviews bookmarked."
          : "Bookmark removed from course reviews.",
      );
      return next;
    });
  };

  const toggleHelpful = (reviewId: string) => {
    setReviewsList((prev) =>
      prev.map((item) => {
        if (item.id !== reviewId) return item;
        const nextState = !item.isHelpfulByUser;
        return {
          ...item,
          isHelpfulByUser: nextState,
          helpfulCount: item.helpfulCount + (nextState ? 1 : -1),
        };
      }),
    );
  };

  const reportReview = (reviewId: string) => {
    setNotice?.("Review has been reported for moderation.");
  };

  const addReview = (newReview: {
    rating: number;
    title: string;
    content: string;
    recommend: boolean;
  }) => {
    const created: ReviewItem = {
      id: `rev-user-${Date.now()}`,
      authorName: "Ashi Singh",
      avatarUrl: "/assets/sofia-avatar-160.webp",
      isVerifiedLearner: true,
      rating: newReview.rating,
      timestamp: "Just now",
      title: newReview.title || "My Review",
      content: newReview.content,
      helpfulCount: 0,
      isHelpfulByUser: false,
      hasComments: Boolean(newReview.content.trim()),
      isCurrentUser: true,
    };
    setReviewsList((prev) => [created, ...prev]);
    setIsWriteModalOpen(false);
    setNotice?.("Your review has been submitted successfully!");
  };

  const resetFilters = () => {
    setActiveTab("all");
    setSearchQuery("");
    setRatingFilter("all");
    setSortBy("recent");
    setVerifiedOnly(false);
  };

  const filteredReviews = useMemo(() => {
    let result = [...reviewsList];

    // Filter by Tab
    if (activeTab === "with-comments") {
      result = result.filter((item) => item.hasComments || Boolean(item.reply));
    } else if (activeTab === "highest-rated") {
      result = result.filter((item) => item.rating >= 4);
    } else if (activeTab === "lowest-rated") {
      result = result.filter((item) => item.rating <= 3);
    } else if (activeTab === "my-review") {
      result = result.filter((item) => item.isCurrentUser);
    }

    // Filter by Verified Learner
    if (verifiedOnly) {
      result = result.filter((item) => item.isVerifiedLearner);
    }

    // Filter by Rating Select
    if (ratingFilter !== "all") {
      const targetRating = parseInt(ratingFilter, 10);
      result = result.filter((item) => item.rating === targetRating);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.authorName.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query) ||
          item.content.toLowerCase().includes(query),
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "highest") return b.rating - a.rating;
      if (sortBy === "lowest") return a.rating - b.rating;
      if (sortBy === "helpful") return b.helpfulCount - a.helpfulCount;
      // Default: "recent" - keep initial/created order
      return 0;
    });

    return result;
  }, [reviewsList, activeTab, verifiedOnly, ratingFilter, searchQuery, sortBy]);

  return {
    courseMeta: initialCourseMeta,
    ratingSummary: initialRatingSummary,
    highlights: initialHighlights,
    topReviewers: initialTopReviewers,
    reviews: filteredReviews,
    totalFilteredCount: filteredReviews.length,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    ratingFilter,
    setRatingFilter,
    sortBy,
    setSortBy,
    verifiedOnly,
    setVerifiedOnly,
    isBookmarked,
    toggleBookmark,
    isWriteModalOpen,
    setIsWriteModalOpen,
    isSupportModalOpen,
    setIsSupportModalOpen,
    toggleHelpful,
    reportReview,
    addReview,
    resetFilters,
  };
}
