import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { AccessService } from "../../access/access.service.ts";
import type { AuthService } from "../../auth/index.ts";
import type { CourseService } from "../../courses/course/course.service.ts";

export interface QuizServiceOptions {
  database: Kysely<Database>;
  getAcademyId: () => Promise<string | null>;
  authService: AuthService;
  courseService: CourseService;
  accessService: AccessService;
}

export interface QuizActor {
  id: string;
  roles: readonly string[];
}
export const isAdmin = (actor: QuizActor) =>
  actor.roles.some((role) => role.toLowerCase() === "admin");
