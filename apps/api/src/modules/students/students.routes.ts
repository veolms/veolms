import {
  studentContactUpdateRequestSchema,
  studentContactUpdateResponseSchema,
  studentCreateRequestSchema,
  studentCreateResponseSchema,
  studentDetailResponseSchema,
  studentListQuerySchema,
  studentListResponseSchema,
  studentUsernameParamsSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import { createAccessService } from "../access/access.service.ts";
import {
  createPermissionPreHandlers,
  hasAcademyPermission,
} from "../authorization/index.ts";
import { createStudentCreationService } from "./student-creation.service.ts";
import { createStudentMailer } from "./student.mailer.ts";
import { createStudentsController } from "./students.controller.ts";
import { listGrantableCourses } from "./students.repository.ts";
import { createStudentsService } from "./students.service.ts";

const studentsRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const service = createStudentsService({
    database: options.database,
    authService: auth.authService,
  });
  const accessService = createAccessService();
  const mailer = createStudentMailer({
    database: options.database,
    email: options.services.email,
    log: app.log,
  });
  const creationService = createStudentCreationService({
    auth: auth.authService,
    grantCourse: (transaction, input) =>
      accessService.grantManualAccess(transaction, input),
    listGrantableCourses: (courseIds) =>
      listGrantableCourses(options.database, courseIds),
    canGrantCourses: (actorId) =>
      hasAcademyPermission(options.database, actorId, "student.access.manage"),
    sendWelcome: mailer.studentAdded,
  });
  const controller = createStudentsController({ service, creationService });

  const { requires } = createPermissionPreHandlers(options.database);
  // Instructors pass with their own-course role; the service then lists
  // only the students of their courses.
  const canReadStudents = requires("student.read", "platform");
  const canUpdateContact = requires("student.contact.update");
  const canCreate = requires("student.create");

  app.post(
    "/students",
    {
      preHandler: canCreate,
      // Every student added sends a welcome email to an address the caller
      // chose, so a stolen staff session must not be able to mail people
      // without limit in the academy's name.
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
      schema: {
        operationId: "createStudent",
        tags: ["Students"],
        summary:
          "Add a student by name and email, optionally with published courses",
        description:
          "Creates the account at once with the student role. The student signs in later with this email and a one-time code, with no registration step. A welcome email is sent once the account is saved.",
        body: studentCreateRequestSchema,
        response: {
          201: jsonResponse(
            "The student as created",
            studentCreateResponseSchema,
          ),
          400: errorResponse(
            "Invalid phone number or end date, or a course that is not published",
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Forbidden"),
          409: errorResponse("Email or phone number already in use"),
          429: errorResponse("Too many students added in a short time"),
        },
      },
    },
    controller.create,
  );

  app.get(
    "/students",
    {
      preHandler: canReadStudents,
      schema: {
        operationId: "listStudents",
        tags: ["Students"],
        summary:
          "List academy students with cursor-based pagination and filters",
        querystring: studentListQuerySchema,
        response: {
          200: jsonResponse(
            "List of students with cursor pagination",
            studentListResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.list,
  );

  app.get(
    "/students/:username",
    {
      preHandler: canReadStudents,
      schema: {
        operationId: "getStudentByUsername",
        tags: ["Students"],
        summary: "Get detailed profile and course progress of a student",
        params: studentUsernameParamsSchema,
        response: {
          200: jsonResponse(
            "Student profile and enrolled courses",
            studentDetailResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Student not found"),
        },
      },
    },
    controller.getByUsername,
  );

  app.patch(
    "/students/:username/contact",
    {
      preHandler: canUpdateContact,
      schema: {
        operationId: "updateStudentContact",
        tags: ["Students"],
        summary: "Change a student's email or phone number (admins only)",
        params: studentUsernameParamsSchema,
        body: studentContactUpdateRequestSchema,
        response: {
          200: jsonResponse(
            "The student's contact details as saved",
            studentContactUpdateResponseSchema,
          ),
          400: errorResponse("Invalid email or phone number"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Student not found"),
          409: errorResponse("Email or phone number already in use"),
        },
      },
    },
    controller.updateContact,
  );
};

export default studentsRoutes;
