import assert from "node:assert/strict";
import { test } from "node:test";
import type { StudentCreateRequest } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";

import {
  createStudentCreationService,
  type StudentCreationDependencies,
} from "./student-creation.service.ts";

const ADMIN = { id: "00000000-0000-4000-8000-00000000000a" };
const NEW_USER = "00000000-0000-4000-8000-0000000000aa";
const COURSE_A = "11111111-1111-4111-8111-111111111111";
const COURSE_B = "22222222-2222-4222-8222-222222222222";
const TRANSACTION = { isTransaction: true } as unknown as DatabaseExecutor;

const published: Record<string, string> = {
  [COURSE_A]: "Course A",
  [COURSE_B]: "Course B",
};

/** Fakes that record what the service asked of them. */
function setup(
  options: {
    existing?: { email?: string; phone?: string };
    canGrant?: boolean;
    welcomeSent?: boolean;
    createUserError?: unknown;
  } = {},
) {
  const calls = {
    createUser: [] as unknown[],
    grants: [] as {
      userId: string;
      courseId: string;
      validUntil: Date | null;
    }[],
    grantExecutors: [] as unknown[],
    welcome: [] as unknown[],
  };
  const dependencies: StudentCreationDependencies = {
    auth: {
      findUserByIdentifierIncludingDeleted: (identifier, type) =>
        Promise.resolve(
          (type === "email" && identifier === options.existing?.email) ||
            (type === "phone" && identifier === options.existing?.phone)
            ? ({ id: "someone-else" } as never)
            : undefined,
        ),
      generateUniqueUsername: (base) => Promise.resolve(`${base}_1`),
      createUser: async (input, withinTransaction) => {
        calls.createUser.push(input);
        if (options.createUserError) throw options.createUserError;
        await withinTransaction?.(TRANSACTION, NEW_USER);
        return NEW_USER;
      },
    },
    grantCourse: (executor, input) => {
      calls.grantExecutors.push(executor);
      calls.grants.push(input);
      return Promise.resolve();
    },
    listGrantableCourses: (ids) =>
      Promise.resolve(
        ids
          .filter((id) => published[id])
          .map((id) => ({ id, title: published[id]! })),
      ),
    canGrantCourses: () => Promise.resolve(options.canGrant ?? true),
    sendWelcome: (input) => {
      calls.welcome.push(input);
      return Promise.resolve(options.welcomeSent ?? true);
    },
  };
  return { service: createStudentCreationService(dependencies), calls };
}

const request = (
  overrides: Partial<StudentCreateRequest> = {},
): StudentCreateRequest => ({
  displayName: "  Ada Lovelace ",
  email: " Ada@Example.com ",
  ...overrides,
});

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: { code?: string }) => {
    assert.equal(error.code, code);
    return true;
  });
}

await test("creates an unverified student account and sends the welcome email", async () => {
  const { service, calls } = setup();
  const result = await service.createStudent(request(), ADMIN);

  assert.deepEqual(calls.createUser, [
    {
      email: "ada@example.com",
      phoneNo: null,
      username: "ada_1",
      displayName: "Ada Lovelace",
      emailVerified: false,
      phoneVerified: false,
    },
  ]);
  assert.deepEqual(calls.welcome, [
    { to: "ada@example.com", addedByUserId: ADMIN.id, courseTitles: [] },
  ]);
  assert.deepEqual(result, {
    id: NEW_USER,
    username: "ada_1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    phoneNo: null,
    grantedCourseIds: [],
    welcomeEmailSent: true,
  });
});

await test("opens the chosen courses inside the account's transaction", async () => {
  const { service, calls } = setup();
  const validUntil = new Date(Date.now() + 86_400_000).toISOString();
  const result = await service.createStudent(
    request({ courseIds: [COURSE_A, COURSE_B, COURSE_A], validUntil }),
    ADMIN,
  );

  assert.deepEqual(
    calls.grants,
    [COURSE_A, COURSE_B].map((courseId) => ({
      userId: NEW_USER,
      courseId,
      validUntil: new Date(validUntil),
    })),
  );
  assert.ok(calls.grantExecutors.every((executor) => executor === TRANSACTION));
  assert.deepEqual(result.grantedCourseIds, [COURSE_A, COURSE_B]);
  assert.deepEqual(calls.welcome, [
    {
      to: "ada@example.com",
      addedByUserId: ADMIN.id,
      courseTitles: ["Course A", "Course B"],
    },
  ]);
});

await test("a course that is not published refuses the whole request", async () => {
  const { service, calls } = setup();
  await rejectsWith(
    service.createStudent(
      request({
        courseIds: [COURSE_A, "33333333-3333-4333-8333-333333333333"],
      }),
      ADMIN,
    ),
    "COURSE_NOT_GRANTABLE",
  );
  assert.equal(calls.createUser.length, 0);
  assert.equal(calls.welcome.length, 0);
});

await test("courses need the course-access permission", async () => {
  const { service, calls } = setup({ canGrant: false });
  await rejectsWith(
    service.createStudent(request({ courseIds: [COURSE_A] }), ADMIN),
    "FORBIDDEN",
  );
  assert.equal(calls.createUser.length, 0);
});

await test("an email or number already in use is refused", async () => {
  await rejectsWith(
    setup({ existing: { email: "ada@example.com" } }).service.createStudent(
      request(),
      ADMIN,
    ),
    "EMAIL_TAKEN",
  );
  await rejectsWith(
    setup({ existing: { phone: "+919876543210" } }).service.createStudent(
      request({ phoneNo: "98765 43210" }),
      ADMIN,
    ),
    "PHONE_TAKEN",
  );
});

await test("an end date in the past is refused", async () => {
  const { service } = setup();
  await rejectsWith(
    service.createStudent(
      request({
        courseIds: [COURSE_A],
        validUntil: new Date(Date.now() - 1000).toISOString(),
      }),
      ADMIN,
    ),
    "INVALID_VALID_UNTIL",
  );
});

await test("an email taken while saving answers 409, not a server error", async () => {
  const { service } = setup({
    createUserError: Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "users_email_key",
    }),
  });
  await rejectsWith(service.createStudent(request(), ADMIN), "EMAIL_TAKEN");
});

await test("a welcome email that fails leaves the account standing", async () => {
  const { service } = setup({ welcomeSent: false });
  const result = await service.createStudent(request(), ADMIN);
  assert.equal(result.welcomeEmailSent, false);
  assert.equal(result.id, NEW_USER);
});
