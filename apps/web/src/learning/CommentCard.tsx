import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import React, { useState } from "react";
import { IconButton } from "./IconButton";

export interface Comment {
  id: number;
  name: string;
  time: string;
  avatar: string;
  text: string;
  likes: number;
  replies?: number;
}

interface CommentCardProps {
  comment: Comment;
  onLike: (id: number, liked: boolean) => void;
}

export function CommentCard({ comment, onLike }: CommentCardProps) {
  const [liked, setLiked] = useState(false);
  return (
    <article className="learning-comment-card">
      <div className="flex gap-3">
        <img
          src={comment.avatar}
          alt=""
          className="learning-comment-card__avatar"
        />
        <div className="min-w-0 flex-1">
          <div className="learning-comment-card__meta flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
            <h2 className="learning-comment-card__name font-semibold">
              {comment.name}
            </h2>
            <span className="learning-comment-card__time text-(--muted)">
              {comment.time}
            </span>
          </div>
          <p className="learning-comment-card__text mt-1 max-w-[72ch] text-(--text-secondary)">
            {comment.text}
          </p>
          <div className="learning-comment-card__actions mt-2 flex items-center gap-5 text-(--muted)">
            <button
              type="button"
              onClick={() => {
                setLiked(!liked);
                onLike(comment.id, !liked);
              }}
              aria-pressed={liked}
              className={`learning-comment-card__like ${liked ? "is-liked" : ""}`}
            >
              <ThumbsUp size={18} weight={liked ? "fill" : "regular"} /> Like
            </button>
            <button
              type="button"
              aria-label={`Show ${comment.replies ?? 0} replies`}
              className="learning-comment-card__replies inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
            >
              <ChatCenteredDots size={17} />
              <span>{comment.replies ?? 0}</span>
            </button>
          </div>
        </div>
        <IconButton
          label={`More actions for ${comment.name}`}
          className="-mr-2 -mt-2 size-9"
        >
          <DotsThreeVertical size={20} />
        </IconButton>
      </div>
    </article>
  );
}
