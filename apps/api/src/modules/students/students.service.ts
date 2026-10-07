import type {
  StudentCourseDetail,
  StudentDetailResponse,
  StudentListItem,
  StudentListQuery,
  StudentListResponse,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import { ADMIN_ROLE } from "../auth/index.ts";
import * as studentsRepo from "./students.repository.ts";

export interface StudentsServiceOptions {
  database: Kysely<Database>;
}

/** The staff member asking for student data. */
export interface StudentsActor {
  id: string;
  roles: readonly string[];
}

/**
 * Admins see every student. Anyone else is limited to learners enrolled in
 * courses they created, and to those courses' enrollments and progress — the
 * returned id is that restriction; undefined means unrestricted.
 */
function resolveCreatorScope(actor: StudentsActor): string | undefined {
  return actor.roles.includes(ADMIN_ROLE) ? undefined : actor.id;
}

/**
 * A learner's progress through one course: completed lessons over published
 * lessons, or — for a course with no published lessons left — the average of
 * whatever progress rows remain.
 */
function resolveCourseProgressPercent(
  publishedLessonsCount: number,
  summary:
    | { completed_lessons: number; progress_rows: number; avg_progress: number }
    | undefined,
): number {
  if (publishedLessonsCount > 0) {
    return Math.min(
      100,
      Math.round(
        ((summary?.completed_lessons ?? 0) / publishedLessonsCount) * 100,
      ),
    );
  }
  if (summary && summary.progress_rows > 0) {
    return Math.min(100, Math.round(summary.avg_progress));
  }
  return 0;
}

export function resolveStudentAvatar(
  userAvatarDataUrl: string | null | undefined,
  avatars: {
    source: string;
    avatar_data_url: string;
    created_at?: Date | string;
    last_used_at?: Date | string;
  }[] = [],
): string | null {
  if (avatars && avatars.length > 0) {
    // Priority 1: Google provider photo
    const googleAvatar = avatars.find(
      (a) =>
        a.source === "google" &&
        typeof a.avatar_data_url === "string" &&
        a.avatar_data_url.trim().length > 0,
    );
    if (googleAvatar) {
      return googleAvatar.avatar_data_url;
    }

    // Priority 1b: User's avatar_data_url if it is a Google photo
    if (
      userAvatarDataUrl &&
      (userAvatarDataUrl.includes("googleusercontent.com") ||
        userAvatarDataUrl.includes("google.com/"))
    ) {
      return userAvatarDataUrl;
    }

    // Priority 2: Other provider photo (e.g. GitHub)
    const providerAvatar = avatars.find(
      (a) =>
        a.source !== "upload" &&
        typeof a.avatar_data_url === "string" &&
        a.avatar_data_url.trim().length > 0,
    );
    if (providerAvatar) {
      return providerAvatar.avatar_data_url;
    }

    // Priority 3: Uploaded avatar in user_avatars
    const uploadedAvatar = avatars.find(
      (a) =>
        typeof a.avatar_data_url === "string" &&
        a.avatar_data_url.trim().length > 0,
    );
    if (uploadedAvatar) {
      return uploadedAvatar.avatar_data_url;
    }
  }

  // Priority 4: Active avatar on user table
  if (
    userAvatarDataUrl &&
    typeof userAvatarDataUrl === "string" &&
    userAvatarDataUrl.trim().length > 0
  ) {
    return userAvatarDataUrl;
  }

  return null;
}

export function createStudentsService({ database }: StudentsServiceOptions) {
  async function resolveStudentAvatars(
    users: readonly {
      id: string;
      avatarDataUrl: string | null;
    }[],
  ): Promise<Map<string, string | null>> {
    const uniqueUsers = Array.from(
      new Map(users.map((user) => [user.id, user])).values(),
    );
    const allAvatars = await studentsRepo.listAvatarsForUserIds(
      database,
      uniqueUsers.map((user) => user.id),
    );
    const avatarsByUserId = new Map<string, typeof allAvatars>();

    for (const avatar of allAvatars) {
      const list = avatarsByUserId.get(avatar.user_id) ?? [];
      list.push(avatar);
      avatarsByUserId.set(avatar.user_id, list);
    }

    return new Map(
      uniqueUsers.map((user) => [
        user.id,
        resolveStudentAvatar(
          user.avatarDataUrl,
          avatarsByUserId.get(user.id) ?? [],
        ),
      ]),
    );
  }

  async function listStudents(
    query: StudentListQuery,
    actor: StudentsActor,
  ): Promise<StudentListResponse> {
    const limit = query.limit || 50;
    const creatorId = resolveCreatorScope(actor);

    // The total describes the whole filtered population, so only the first
    // page carries it; later pages would recount the same rows.
    const [rows, totalCount] = await Promise.all([
      studentsRepo.listStudentsPaginated(database, {
        cursor: query.cursor,
        limit,
        search: query.search,
        courseId: query.courseId,
        status: query.status,
        sortBy: query.sortBy,
        creatorId,
      }),
      query.cursor
        ? undefined
        : studentsRepo.countTotalStudents(database, {
            search: query.search,
            courseId: query.courseId,
            status: query.status,
            creatorId,
          }),
    ]);

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

    if (pageRows.length === 0) {
      return {
        students: [],
        nextCursor: null,
        totalCount,
      };
    }

    const userIds = pageRows.map((u) => u.id);

    const [allEnrollments, allProgress, allAvatars] = await Promise.all([
      studentsRepo.listEnrollmentsForUserIds(database, userIds, creatorId),
      // Aggregated per (user, course) in SQL: the raw-row variant shipped
      // thousands of progress rows per page and page throughput was bound
      // by Node parsing them (measured ~21 req/s at 25 connections while
      // every individual query finished in tens of milliseconds).
      studentsRepo.listProgressSummariesForUserIds(
        database,
        userIds,
        creatorId,
      ),
      studentsRepo.listAvatarsForUserIds(database, userIds),
    ]);

    // Distinct course IDs across all returned students
    const courseIds = Array.from(
      new Set(allEnrollments.map((e) => e.course_id)),
    );
    const lessonCounts = await studentsRepo.listCourseLessonCounts(
      database,
      courseIds,
    );

    // Group enrollments and progress by userId
    const enrollmentsByUserId = new Map<string, typeof allEnrollments>();
    for (const e of allEnrollments) {
      const list = enrollmentsByUserId.get(e.user_id) ?? [];
      list.push(e);
      enrollmentsByUserId.set(e.user_id, list);
    }

    const progressByUserId = new Map<string, typeof allProgress>();
    for (const p of allProgress) {
      const list = progressByUserId.get(p.user_id) ?? [];
      list.push(p);
      progressByUserId.set(p.user_id, list);
    }

    const avatarsByUserId = new Map<string, typeof allAvatars>();
    for (const a of allAvatars) {
      const list = avatarsByUserId.get(a.user_id) ?? [];
      list.push(a);
      avatarsByUserId.set(a.user_id, list);
    }

    const students: StudentListItem[] = pageRows.map((user) => {
      const userEnrollments = enrollmentsByUserId.get(user.id) ?? [];
      const userProgress = progressByUserId.get(user.id) ?? [];
      const userAvatars = avatarsByUserId.get(user.id) ?? [];
      const avatarUrl = resolveStudentAvatar(user.avatar_data_url, userAvatars);

      // Progress summaries are pre-aggregated per (user, course) in SQL.
      const progressByCourse = new Map(
        userProgress.map((p) => [p.course_id, p]),
      );

      let totalProgressSum = 0;
      let completedCoursesCount = 0;

      for (const enrollment of userEnrollments) {
        const courseProgressPercent = resolveCourseProgressPercent(
          lessonCounts.get(enrollment.course_id) ?? 0,
          progressByCourse.get(enrollment.course_id),
        );

        if (courseProgressPercent >= 100) {
          completedCoursesCount += 1;
        }

        totalProgressSum += courseProgressPercent;
      }

      const enrolledCoursesCount = userEnrollments.length;
      const averageProgressPercent =
        enrolledCoursesCount > 0
          ? Math.round(totalProgressSum / enrolledCoursesCount)
          : 0;

      return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        avatarUrl,
        joinedAt: user.created_at.toISOString(),
        enrolledCoursesCount,
        completedCoursesCount,
        averageProgressPercent,
      };
    });

    const lastStudent = pageRows[pageRows.length - 1]!;
    const sortBy = query.sortBy ?? "recent";
    const nextCursor = hasNextPage
      ? studentsRepo.encodeStudentListCursor(
          sortBy === "recent"
            ? {
                sortBy,
                createdAt: lastStudent.created_at.toISOString(),
                id: lastStudent.id,
              }
            : sortBy === "name"
              ? {
                  sortBy,
                  name: lastStudent.display_name,
                  id: lastStudent.id,
                }
              : sortBy === "courses"
                ? {
                    sortBy,
                    courses: (enrollmentsByUserId.get(lastStudent.id) ?? [])
                      .length,
                    id: lastStudent.id,
                  }
                : {
                    sortBy,
                    progress: (() => {
                      // Reconstructs avg(progress_percent) over every one of
                      // the user's progress rows from the per-course
                      // summaries (weighted by row count) — identical to the
                      // repository's progressSort expression.
                      const summaries =
                        progressByUserId.get(lastStudent.id) ?? [];
                      const totalRows = summaries.reduce(
                        (sum, row) => sum + row.progress_rows,
                        0,
                      );
                      return totalRows > 0
                        ? summaries.reduce(
                            (sum, row) =>
                              sum + row.avg_progress * row.progress_rows,
                            0,
                          ) / totalRows
                        : 0;
                    })(),
                    id: lastStudent.id,
                  },
        )
      : null;

    return {
      students,
      nextCursor,
      totalCount,
    };
  }

  async function getActiveLearnerCount(filters: {
    courseId?: string | string[];
    from?: Date;
    to?: Date;
  }) {
    return await studentsRepo.getActiveLearnerCount(database, filters);
  }

  async function getStudentPopulationCounts(filters: {
    courseId?: string | string[];
    createdFrom: Date;
    createdTo: Date;
  }) {
    const [total, newThisMonth] = await Promise.all([
      studentsRepo.countTotalStudents(database, {
        courseId: filters.courseId,
      }),
      studentsRepo.countStudentsCreatedBetween(database, {
        courseId: filters.courseId,
        from: filters.createdFrom,
        to: filters.createdTo,
      }),
    ]);

    return { total, newThisMonth };
  }

  async function getStudentByUsername(
    username: string,
    actor: StudentsActor,
  ): Promise<StudentDetailResponse> {
    const creatorId = resolveCreatorScope(actor);
    // Out-of-scope accounts answer exactly like unknown usernames, so the
    // endpoint cannot be used to probe who exists or studies elsewhere.
    const user = await studentsRepo.findStudentByUsername(
      database,
      username,
      creatorId,
    );
    if (!user) {
      throw new AppError(
        404,
        "STUDENT_NOT_FOUND",
        `Student with username '${username}' was not found.`,
      );
    }

    const [enrolledCourses, progressSummaries, userAvatars] = await Promise.all(
      [
        studentsRepo.getStudentEnrolledCourses(database, user.id, creatorId),
        studentsRepo.listProgressSummariesForUserIds(
          database,
          [user.id],
          creatorId,
        ),
        studentsRepo.listAvatarsForUserIds(database, [user.id]),
      ],
    );

    const courseIds = enrolledCourses.map((c) => c.course_id);
    const lessonCounts = await studentsRepo.listCourseLessonCounts(
      database,
      courseIds,
    );

    const progressByCourse = new Map(
      progressSummaries.map((summary) => [summary.course_id, summary]),
    );
    const totalLessonsCompleted = progressSummaries.reduce(
      (sum, summary) => sum + summary.completed_lessons,
      0,
    );

    let completedCoursesCount = 0;
    let inProgressCoursesCount = 0;
    let totalProgressSum = 0;

    const courses: StudentCourseDetail[] = enrolledCourses.map((c) => {
      const totalLessonsCount = lessonCounts.get(c.course_id) ?? 0;
      const summary = progressByCourse.get(c.course_id);
      const progressPercent = resolveCourseProgressPercent(
        totalLessonsCount,
        summary,
      );

      if (progressPercent >= 100) {
        completedCoursesCount += 1;
      } else if (progressPercent > 0) {
        inProgressCoursesCount += 1;
      }

      totalProgressSum += progressPercent;

      return {
        courseId: c.course_id,
        courseTitle: c.course_title,
        courseSlug: c.course_slug,
        courseDescription: c.course_description,
        courseThumbnailUrl: c.course_thumbnail_url,
        difficulty: c.difficulty,
        enrolledAt: c.enrolled_at.toISOString(),
        enrollmentSource: c.enrollment_source,
        progressPercent,
        completedLessonsCount: summary?.completed_lessons ?? 0,
        totalLessonsCount,
        lastAccessedAt: summary
          ? new Date(summary.last_activity_at).toISOString()
          : null,
      };
    });

    const enrolledCoursesCount = courses.length;
    const averageProgressPercent =
      enrolledCoursesCount > 0
        ? Math.round(totalProgressSum / enrolledCoursesCount)
        : 0;

    // An instructor sees a learner's links only where the learner chose to
    // publish them, exactly as on the public profile. Admins see them all.
    const visibleLink = (url: string | null, isPublic: boolean) =>
      !creatorId || isPublic ? url : null;

    return {
      student: {
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        // Phone numbers are admin-only: an instructor reaches their learners
        // through the platform, not through a personal number.
        phoneNo: creatorId ? null : user.phone_no,
        avatarUrl: resolveStudentAvatar(user.avatar_data_url, userAvatars),
        bio: user.bio,
        joinedAt: user.created_at.toISOString(),
        socials: {
          githubUrl: visibleLink(user.github_url, user.github_public),
          linkedinUrl: visibleLink(user.linkedin_url, user.linkedin_public),
          websiteUrl: visibleLink(user.website_url, user.website_public),
        },
      },
      metrics: {
        enrolledCoursesCount,
        completedCoursesCount,
        inProgressCoursesCount,
        averageProgressPercent,
        totalLessonsCompleted,
      },
      courses,
    };
  }

  return {
    listStudents,
    getStudentByUsername,
    resolveStudentAvatars,
    getActiveLearnerCount,
    getStudentPopulationCounts,
  };
}

export type StudentsService = ReturnType<typeof createStudentsService>;
