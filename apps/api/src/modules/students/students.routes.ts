import {
  studentContactUpdateRequestSchema,
  studentContactUpdateResponseSchema,
  studentDetailResponseSchema,
  studentListQuerySchema,
  studentListResponseSchema,
  studentUsernameParamsSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthContext } from "../auth/shared/auth.context.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createStudentsController } from "./students.controller.ts";
import { createStudentsService } from "./students.service.ts";

const studentsRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const service = createStudentsService({
    database: options.database,
    authService: auth.authService,
  });
  const controller = createStudentsController({ service });

  const { requires } = createPermissionPreHandlers(options.database);
  // Instructors pass with their own-course role; the service then lists
  // only the students of their courses.
  const canReadStudents = requires("student.read", "platform");
  const canUpdateContact = requires("student.contact.update");

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
