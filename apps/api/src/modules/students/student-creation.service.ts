import type {
  StudentCreateRequest,
  StudentCreateResponse,
} from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";

import { AppError } from "../../lib/errors.ts";
import type { AuthService } from "../auth/index.ts";
import { normalizePhoneIdentifier } from "../auth/shared/auth.utils.ts";

/** What adding a student needs from the rest of the API. */
export interface StudentCreationDependencies {
  auth: Pick<
    AuthService,
    | "findUserByIdentifierIncludingDeleted"
    | "generateUniqueUsername"
    | "createUser"
  >;
  /** Opens a course for the new account, inside its transaction. */
  grantCourse: (
    transaction: DatabaseExecutor,
    input: { userId: string; courseId: string; validUntil: Date | null },
  ) => Promise<unknown>;
  /** Published, not deleted courses among the ids. */
  listGrantableCourses: (
    courseIds: readonly string[],
  ) => Promise<{ id: string; title: string }[]>;
  /** Whether the actor may open courses for students. */
  canGrantCourses: (actorId: string) => Promise<boolean>;
  sendWelcome: (input: {
    to: string;
    addedByUserId: string;
    courseTitles: readonly string[];
  }) => Promise<boolean>;
}

const emailTaken = () =>
  new AppError(
    409,
    "EMAIL_TAKEN",
    "An account with this email already exists. Find it in the Students list.",
  );
const phoneTaken = () =>
  new AppError(
    409,
    "PHONE_TAKEN",
    "This phone number is already used by another account.",
  );

/** The constraint a unique violation names, or null for any other error. */
function uniqueViolation(error: unknown): string | null {
  const { code, constraint } = error as {
    code?: unknown;
    constraint?: unknown;
  };
  return code === "23505" ? String(constraint ?? "") : null;
}

export function createStudentCreationService(
  dependencies: StudentCreationDependencies,
) {
  const { auth } = dependencies;

  /**
   * Staff create a student account from a name and an email (and a number,
   * if they have one). The account is saved unverified: whoever signs in
   * with the email's code proves it. Courses asked for are opened in the
   * same transaction, so a refused course leaves no account behind. The
   * welcome email follows the commit.
   */
  async function createStudent(
    input: StudentCreateRequest,
    actor: { id: string },
  ): Promise<StudentCreateResponse> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    const phoneNo = input.phoneNo?.trim()
      ? normalizePhoneIdentifier(input.phoneNo)
      : null;
    if (phoneNo !== null && phoneNo.length < 8) {
      throw new AppError(
        400,
        "INVALID_PHONE_NUMBER",
        "Enter a valid mobile number.",
      );
    }

    const courseIds = [...new Set(input.courseIds ?? [])];
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && validUntil.getTime() <= Date.now()) {
      throw new AppError(
        400,
        "INVALID_VALID_UNTIL",
        "The access end date must be in the future.",
      );
    }

    if (
      courseIds.length > 0 &&
      !(await dependencies.canGrantCourses(actor.id))
    ) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "You can add students, but not give them course access.",
      );
    }

    const courses = await dependencies.listGrantableCourses(courseIds);
    if (courses.length !== courseIds.length) {
      throw new AppError(
        400,
        "COURSE_NOT_GRANTABLE",
        "Only published courses can be given to a student.",
      );
    }

    // Deactivated accounts keep their email and number (both are unique
    // columns), so they count as taken too.
    if (await auth.findUserByIdentifierIncludingDeleted(email, "email")) {
      throw emailTaken();
    }
    if (
      phoneNo !== null &&
      (await auth.findUserByIdentifierIncludingDeleted(phoneNo, "phone"))
    ) {
      throw phoneTaken();
    }

    const username = await auth.generateUniqueUsername(
      email.split("@")[0] || "student",
    );

    let userId: string;
    try {
      userId = await auth.createUser(
        {
          email,
          phoneNo,
          username,
          displayName,
          emailVerified: false,
          phoneVerified: false,
        },
        async (transaction, newUserId) => {
          for (const course of courses) {
            await dependencies.grantCourse(transaction, {
              userId: newUserId,
              courseId: course.id,
              validUntil,
            });
          }
        },
      );
    } catch (error) {
      // Another account took the email, number or username between the
      // checks above and this write.
      const constraint = uniqueViolation(error);
      if (constraint === null) throw error;
      if (constraint.includes("phone")) throw phoneTaken();
      if (constraint.includes("email")) throw emailTaken();
      throw new AppError(
        409,
        "USERNAME_TAKEN",
        "Could not save the student just now. Please try again.",
      );
    }

    const welcomeEmailSent = await dependencies.sendWelcome({
      to: email,
      addedByUserId: actor.id,
      courseTitles: courses.map((course) => course.title),
    });

    return {
      id: userId,
      username,
      displayName,
      email,
      phoneNo,
      grantedCourseIds: courses.map((course) => course.id),
      welcomeEmailSent,
    };
  }

  return { createStudent };
}

export type StudentCreationService = ReturnType<
  typeof createStudentCreationService
>;
