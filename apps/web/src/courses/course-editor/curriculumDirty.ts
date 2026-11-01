export const checkIsCurriculumDirty = (
  sections: Array<{
    id: string;
    isEditingTitle?: boolean;
    lessons: Array<{
      id: string;
      title: string;
      description?: string;
      contentType: "video" | "document" | "quiz" | "audio" | "image";
      contentMediaId?: string | null;
      durationSeconds?: number;
      isPublished?: boolean;
      isPreview?: boolean;
      isPendingCreation?: boolean;
      initialState?: {
        title: string;
        description: string;
        contentType: "video" | "document" | "quiz" | "audio" | "image";
        contentMediaId?: string | null;
        isPublished?: boolean;
        isPreview?: boolean;
      };
    }>;
  }>,
): boolean => {
  const hasEditingSection = sections.some(
    (s) =>
      s.isEditingTitle &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        s.id,
      ),
  );
  if (hasEditingSection) return true;

  return sections.some((sec) =>
    sec.lessons.some((les) => {
      if (les.isPendingCreation) return false;
      const init = les.initialState || {
        title: les.title,
        description: les.description || "",
        contentType: les.contentType,
        contentMediaId: les.contentMediaId ?? null,
        isPublished: les.isPublished !== undefined ? les.isPublished : true,
        isPreview: les.isPreview !== undefined ? les.isPreview : false,
      };
      const isPub = les.isPublished !== undefined ? les.isPublished : true;
      const isPrev = les.isPreview !== undefined ? les.isPreview : false;
      const initPub = init.isPublished !== undefined ? init.isPublished : true;
      const initPrev = init.isPreview !== undefined ? init.isPreview : false;

      return (
        les.title.trim() !== init.title.trim() ||
        (les.description || "") !== (init.description || "") ||
        les.contentType !== init.contentType ||
        (les.contentMediaId ?? null) !== (init.contentMediaId ?? null) ||
        isPub !== initPub ||
        isPrev !== initPrev
      );
    }),
  );
};
