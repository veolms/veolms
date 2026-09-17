import type {
  StudentCourseDetail,
  StudentDetailResponse,
  StudentListQuery,
  StudentListResponse,
  StudentSummary,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";

import { AppError } from "../../lib/errors.ts";
import * as studentsRepo from "./students.repository.ts";

export interface StudentsServiceOptions {
  database: Kysely<Database>;
}

export function createStudentsService({ database }: StudentsServiceOptions) {
  async function listStudents(
    query: StudentListQuery,
  ): Promise<StudentListResponse> {
    const limit = query.limit || 30;

    const [rows, totalCount] = await Promise.all([
      studentsRepo.listStudentsPaginated(database, {
        cursor: query.cursor,
        limit,
        search: query.search,
        courseId: query.courseId,
        status: query.status,
        sortBy: query.sortBy,
      }),
      studentsRepo.countTotalStudents(database, {
        search: query.search,
        courseId: query.courseId,
        status: query.status,
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

    const [allEnrollments, allProgress] = await Promise.all([
      studentsRepo.listEnrollmentsForUserIds(database, userIds),
      studentsRepo.listProgressForUserIds(database, userIds),
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

    const students: StudentSummary[] = pageRows.map((user) => {
      const userEnrollments = enrollmentsByUserId.get(user.id) ?? [];
      const userProgress = progressByUserId.get(user.id) ?? [];

      // Group progress by courseId
      const progressByCourse = new Map<string, typeof userProgress>();
      for (const p of userProgress) {
        const list = progressByCourse.get(p.course_id) ?? [];
        list.push(p);
        progressByCourse.set(p.course_id, list);
      }

      let totalProgressSum = 0;
      let completedCoursesCount = 0;
      const enrolledCoursesPreview: NonNullable<
        StudentSummary["enrolledCoursesPreview"]
      > = [];

      for (const enrollment of userEnrollments) {
        const courseLessonsCount =
          lessonCounts.get(enrollment.course_id) ?? 0;
        const cProgressList =
          progressByCourse.get(enrollment.course_id) ?? [];

        let courseProgressPercent = 0;
        if (courseLessonsCount > 0) {
          const completedLessons = cProgressList.filter(
            (p) => p.progress_percent >= 90,
          ).length;
          courseProgressPercent = Math.min(
            100,
            Math.round((completedLessons / courseLessonsCount) * 100),
          );
        } else if (cProgressList.length > 0) {
          const avg =
            cProgressList.reduce((acc, p) => acc + p.progress_percent, 0) /
            cProgressList.length;
          courseProgressPercent = Math.min(100, Math.round(avg));
        }

        if (courseProgressPercent >= 100) {
          completedCoursesCount += 1;
        }

        totalProgressSum += courseProgressPercent;

        if (enrolledCoursesPreview.length < 3) {
          enrolledCoursesPreview.push({
            id: enrollment.course_id,
            title: enrollment.course_title,
            slug: enrollment.course_slug,
            progressPercent: courseProgressPercent,
          });
        }
      }

      const enrolledCoursesCount = userEnrollments.length;
      const averageProgressPercent =
        enrolledCoursesCount > 0
          ? Math.round(totalProgressSum / enrolledCoursesCount)
          : 0;

      // Determine last active timestamp
      let latestActive: Date | null = null;
      for (const p of userProgress) {
        const date = new Date(p.updated_at);
        if (!latestActive || date > latestActive) {
          latestActive = date;
        }
      }
      if (!latestActive && userEnrollments.length > 0) {
        latestActive = new Date(userEnrollments[0]!.enrolled_at);
      }

      return {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        avatarUrl: user.avatar_data_url,
        bio: user.bio,
        joinedAt: user.created_at.toISOString(),
        enrolledCoursesCount,
        completedCoursesCount,
        averageProgressPercent,
        lastActiveAt: latestActive?.toISOString() ?? null,
        enrolledCoursesPreview,
      };
    });

    const lastStudent = pageRows[pageRows.length - 1]!;
    const nextCursor = hasNextPage
      ? lastStudent.created_at.toISOString()
      : null;

    return {
      students,
      nextCursor,
      totalCount,
    };
  }

  async function getStudentByUsername(
    username: string,
  ): Promise<StudentDetailResponse> {
    const user = await studentsRepo.findStudentByUsername(database, username);
    if (!user) {
      throw new AppError(
        404,
        "STUDENT_NOT_FOUND",
        `Student with username '${username}' was not found.`,
      );
    }

    const [enrolledCourses, userProgress] = await Promise.all([
      studentsRepo.getStudentEnrolledCourses(database, user.id),
      studentsRepo.listProgressForUserIds(database, [user.id]),
    ]);

    const courseIds = enrolledCourses.map((c) => c.course_id);
    const lessonCounts = await studentsRepo.listCourseLessonCounts(
      database,
      courseIds,
    );

    // Group user progress by courseId
    const progressByCourse = new Map<string, typeof userProgress>();
    for (const p of userProgress) {
      const list = progressByCourse.get(p.course_id) ?? [];
      list.push(p);
      progressByCourse.set(p.course_id, list);
    }

    let completedCoursesCount = 0;
    let inProgressCoursesCount = 0;
    let totalProgressSum = 0;
    let totalLessonsCompleted = 0;
    let latestActive: Date | null = null;

    for (const p of userProgress) {
      if (p.progress_percent >= 90) {
        totalLessonsCompleted += 1;
      }
      const date = new Date(p.updated_at);
      if (!latestActive || date > latestActive) {
        latestActive = date;
      }
    }

    const courses: StudentCourseDetail[] = enrolledCourses.map((c) => {
      const totalLessonsCount = lessonCounts.get(c.course_id) ?? 0;
      const courseProgressList = progressByCourse.get(c.course_id) ?? [];

      const completedLessonsCount = courseProgressList.filter(
        (p) => p.progress_percent >= 90,
      ).length;

      let progressPercent = 0;
      if (totalLessonsCount > 0) {
        progressPercent = Math.min(
          100,
          Math.round((completedLessonsCount / totalLessonsCount) * 100),
        );
      } else if (courseProgressList.length > 0) {
        const avg =
          courseProgressList.reduce(
            (acc, p) => acc + p.progress_percent,
            0,
          ) / courseProgressList.length;
        progressPercent = Math.min(100, Math.round(avg));
      }

      if (progressPercent >= 100) {
        completedCoursesCount += 1;
      } else if (progressPercent > 0) {
        inProgressCoursesCount += 1;
      }

      totalProgressSum += progressPercent;

      let lastAccessedAt: string | null = null;
      for (const p of courseProgressList) {
        const pDate = new Date(p.updated_at);
        if (!lastAccessedAt || pDate > new Date(lastAccessedAt)) {
          lastAccessedAt = pDate.toISOString();
        }
      }

      return {
        courseId: c.course_id,
        courseTitle: c.course_title,
        courseSlug: c.course_slug,
        courseDescription: c.course_description,
        courseThumbnailUrl: c.course_thumbnail_url,
        difficulty: c.difficulty,
        enrolledAt: c.enrolled_at.toISOString(),
        enrollmentStatus: c.enrollment_status,
        enrollmentSource: c.enrollment_source,
        accessExpiresAt: c.access_expires_at?.toISOString() ?? null,
        progressPercent,
        completedLessonsCount,
        totalLessonsCount,
        lastAccessedAt,
      };
    });

    const enrolledCoursesCount = courses.length;
    const averageProgressPercent =
      enrolledCoursesCount > 0
        ? Math.round(totalProgressSum / enrolledCoursesCount)
        : 0;

    return {
      student: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email,
        phoneNo: user.phone_no,
        avatarUrl: user.avatar_data_url,
        bio: user.bio,
        joinedAt: user.created_at.toISOString(),
        socials: {
          githubUrl: user.github_url,
          linkedinUrl: user.linkedin_url,
          websiteUrl: user.website_url,
        },
      },
      metrics: {
        enrolledCoursesCount,
        completedCoursesCount,
        inProgressCoursesCount,
        averageProgressPercent,
        totalLessonsCompleted,
        lastActiveAt: latestActive?.toISOString() ?? null,
      },
      courses,
    };
  }

  return {
    listStudents,
    getStudentByUsername,
  };
}

export type StudentsService = ReturnType<typeof createStudentsService>;
