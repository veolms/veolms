import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStudentsService } from "./students.service.ts";
import { AppError } from "../../lib/errors.ts";

describe("Students Service", () => {
  it("computes cursor pagination and metrics correctly when students exist", async () => {
    const mockUsers = [
      {
        id: "user-1",
        username: "learner_one",
        display_name: "Learner One",
        email: "learner1@example.com",
        avatar_data_url: null,
        bio: "Bio 1",
        created_at: new Date("2026-03-01T10:00:00Z"),
        updated_at: new Date("2026-03-01T10:00:00Z"),
      },
    ];

    // Mock database with minimal query handler
    const mockDatabase: any = {
      selectFrom: (table: string) => {
        if (table === "users as u") {
          const builder: any = {
            select: () => builder,
            where: () => builder,
            orderBy: () => builder,
            limit: () => builder,
            execute: async () => mockUsers,
            executeTakeFirst: async () => ({ total: 1 }),
          };
          return builder;
        }
        if (table === "enrollments as e") {
          const builder: any = {
            innerJoin: () => builder,
            select: () => builder,
            where: () => builder,
            orderBy: () => builder,
            execute: async () => [
              {
                user_id: "user-1",
                enrollment_id: "enr-1",
                course_id: "course-1",
                enrollment_status: "active",
                enrollment_source: "direct_purchase",
                enrolled_at: new Date("2026-03-01T10:00:00Z"),
                access_expires_at: null,
                course_slug: "course-slug-1",
                course_title: "Course 1",
                course_description: "Description 1",
                course_thumbnail_url: null,
                difficulty: "beginner",
              },
            ],
          };
          return builder;
        }
        if (table === "learning_progress as lp") {
          const builder: any = {
            select: () => builder,
            where: () => builder,
            execute: async () => [
              {
                user_id: "user-1",
                course_id: "course-1",
                lesson_id: "les-1",
                progress_percent: 100,
                updated_at: new Date("2026-03-02T10:00:00Z"),
              },
            ],
          };
          return builder;
        }
        if (table === "course_lessons as cl") {
          const builder: any = {
            select: () => builder,
            where: () => builder,
            groupBy: () => builder,
            execute: async () => [{ course_id: "course-1", cnt: 1 }],
          };
          return builder;
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const service = createStudentsService({ database: mockDatabase });
    const response = await service.listStudents({ limit: 30 });

    assert.equal(response.students.length, 1);
    assert.equal(response.students[0]!.username, "learner_one");
    assert.equal(response.students[0]!.enrolledCoursesCount, 1);
    assert.equal(response.students[0]!.completedCoursesCount, 1);
    assert.equal(response.students[0]!.averageProgressPercent, 100);
    assert.equal(response.nextCursor, null);
    assert.equal(response.totalCount, 1);
  });

  it("throws 404 AppError when student is not found by username", async () => {
    const mockDatabase: any = {
      selectFrom: () => {
        const builder: any = {
          selectAll: () => builder,
          where: () => builder,
          executeTakeFirst: async () => undefined,
        };
        return builder;
      },
    };

    const service = createStudentsService({ database: mockDatabase });

    await assert.rejects(
      async () => {
        await service.getStudentByUsername("non_existent_user");
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "STUDENT_NOT_FOUND");
        return true;
      },
    );
  });
});
