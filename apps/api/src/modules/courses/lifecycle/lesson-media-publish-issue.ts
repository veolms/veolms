/**
 * What stops a course from being published because of one lesson's media:
 * a message for the creator, or `null` when the lesson is fine.
 *
 * A lesson needs no media to be published. One with none attached is an
 * ordinary lesson: learners are shown its title, description and resources
 * and told it has no video. Publishing used to refuse every video or
 * document lesson without media ("does not have media content attached"),
 * so a creator could not publish a course that held such a lesson, nor take
 * a course offline and put it back, without first filling or deleting it.
 *
 * Media that IS attached is still checked: it must exist, belong to the
 * course's creator (an admin may publish with anyone's), and be finished
 * (a video processed, a document uploaded). A quiz lesson holds no media
 * and is not checked.
 */
export function lessonMediaPublishIssue({
  lesson,
  media,
  courseCreatorId,
  actorIsAdmin,
}: {
  lesson: {
    title: string;
    content_type: string;
    content_media_id: string | null;
  };
  /** The asset `content_media_id` names; `undefined` when there is none. */
  media: { owner_id: string; status: string } | undefined;
  courseCreatorId: string | null;
  actorIsAdmin: boolean;
}): string | null {
  if (lesson.content_type === "quiz") return null;
  if (!lesson.content_media_id) return null;

  if (!media || (!actorIsAdmin && media.owner_id !== courseCreatorId)) {
    return `Media for lesson "${lesson.title}" was not found.`;
  }
  if (lesson.content_type === "video" && media.status !== "ready") {
    return `Video for lesson "${lesson.title}" is still processing or failed.`;
  }
  if (
    lesson.content_type === "document" &&
    media.status !== "uploaded" &&
    media.status !== "ready"
  ) {
    return `Document for lesson "${lesson.title}" is not completely uploaded.`;
  }
  return null;
}
