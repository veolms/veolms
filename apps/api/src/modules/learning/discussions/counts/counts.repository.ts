import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";
import type { LessonDiscussionCountsResponse } from "@veolms/contracts";
import { discussionVisibilityPredicate } from "../shared/discussion.visibility.ts";

export interface LessonDiscussionCountsRepositoryInput {
  academyId: string;
  courseId: string;
  lessonId: string;
  userId: string;
  allowComments: boolean;
  allowQa: boolean;
  allowNotes: boolean;
}

export interface LessonDiscussionCountsRepository {
  countLessonInteractions(
    db: DatabaseExecutor,
    input: LessonDiscussionCountsRepositoryInput,
  ): Promise<LessonDiscussionCountsResponse>;
}

export function createLessonDiscussionCountsRepository(): LessonDiscussionCountsRepository {
  return {
    async countLessonInteractions(db, input) {
      const sources = [];

      const threadKinds = [
        ...(input.allowComments ? ["comment" as const] : []),
        ...(input.allowQa ? ["question" as const] : []),
      ];
      if (threadKinds.length > 0) {
        sources.push(sql`
          select t.kind::text as kind
          from learning_threads as t
          where t.academy_id = ${input.academyId}
            and t.course_id = ${input.courseId}
            and t.lesson_id = ${input.lessonId}
            and t.status = 'active'
            and t.kind in (${sql.join(
              threadKinds.map((kind) => sql`${kind}`),
              sql`, `,
            )})
            and ${discussionVisibilityPredicate("t", input.userId, false)}
        `);
      }

      if (input.allowNotes) {
        sources.push(sql`
          select 'note'::text as kind
          from learning_notes as n
          where n.academy_id = ${input.academyId}
            and n.course_id = ${input.courseId}
            and n.lesson_id = ${input.lessonId}
            and ${discussionVisibilityPredicate("n", input.userId, false)}
        `);
      }

      if (sources.length === 0) {
        return { comments: 0, questions: 0, notes: 0, total: 0 };
      }

      const result = await sql<{
        comments: number | string;
        questions: number | string;
        notes: number | string;
        total: number | string;
      }>`
        select
          count(*) filter (where kind = 'comment')::int as comments,
          count(*) filter (where kind = 'question')::int as questions,
          count(*) filter (where kind = 'note')::int as notes,
          count(*)::int as total
        from (${sql.join(sources, sql` union all `)}) as interactions
      `.execute(db);
      const row = result.rows[0];

      return {
        comments: Number(row?.comments ?? 0),
        questions: Number(row?.questions ?? 0),
        notes: Number(row?.notes ?? 0),
        total: Number(row?.total ?? 0),
      };
    },
  };
}
