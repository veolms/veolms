import type { LessonDiscussionCountsResponse } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";
import { findSettingsByCourseId } from "../../../courses/configuration/configuration.repository.ts";
import {
  createDiscussionAccess,
  type DiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import { resolveAcademyId } from "../shared/discussion.utils.ts";
import {
  createLessonDiscussionCountsRepository,
  type LessonDiscussionCountsRepository,
} from "./counts.repository.ts";

export interface LessonDiscussionCountsService {
  getCounts(
    db: DatabaseExecutor,
    input: {
      courseId: string;
      lessonId: string;
      actor: DiscussionActor;
    },
  ): Promise<LessonDiscussionCountsResponse>;
}

export function createLessonDiscussionCountsService(options?: {
  access?: DiscussionAccess;
  repository?: LessonDiscussionCountsRepository;
}): LessonDiscussionCountsService {
  const access = options?.access ?? createDiscussionAccess();
  const repository =
    options?.repository ?? createLessonDiscussionCountsRepository();

  return {
    async getCounts(db, { courseId, lessonId, actor }) {
      await access.assertCanAccessCourse(db, actor, courseId);

      const settings = await findSettingsByCourseId(db, courseId);
      const capabilities = {
        allowComments: settings?.allow_comments !== false,
        allowQa: settings?.allow_qa !== false,
        allowNotes: settings?.allow_notes !== false,
      };
      if (
        !capabilities.allowComments &&
        !capabilities.allowQa &&
        !capabilities.allowNotes
      ) {
        return { comments: 0, questions: 0, notes: 0, total: 0 };
      }

      const counts = await repository.countLessonInteractions(db, {
        academyId: await resolveAcademyId(db),
        courseId,
        lessonId,
        userId: actor.userId,
        ...capabilities,
      });

      return {
        ...counts,
        total: counts.comments + counts.questions + counts.notes,
      };
    },
  };
}
