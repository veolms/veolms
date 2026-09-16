import { loadServerConfig } from "@veolms/config";

import { createDatabase } from "./client.ts";
import type { CourseStatus } from "./schema.ts";
import { seedRolesAndPermissions } from "./seed-rbac.ts";

const courses = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "complete-backend-development-with-nodejs",
    title: "Complete Backend Development with Node.js",
    short_description:
      "Build reliable backend applications with Node.js, APIs, and PostgreSQL.",
    description:
      "Learn how to design and build production-minded backend applications with Node.js. The course covers HTTP APIs, validation, PostgreSQL data access, error handling, and the practical decisions that keep a service maintainable as it grows.",
    status: "published" satisfies CourseStatus,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "ultimate-typescript-course",
    title: "The Ultimate TypeScript Course",
    short_description:
      "Master TypeScript from fundamentals to advanced concepts.",
    description:
      "Develop a strong mental model for TypeScript, from everyday type annotations and narrowing to generics, structural typing, and safe API boundaries. Practical exercises focus on writing code that stays understandable and correct.",
    status: "published" satisfies CourseStatus,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    slug: "building-procodrr-idea-to-production",
    title: "Building ProCodrr: Idea to Production",
    short_description:
      "Follow the practical journey of shaping and shipping a modern LMS.",
    description:
      "See how a product idea becomes a production-shaped learning platform. This course explores scope, architecture, incremental delivery, operational trade-offs, and the discipline of building only what a real product needs next.",
    status: "published" satisfies CourseStatus,
  },
] as const;

const config = loadServerConfig(process.env);
export const DEFAULT_SEED_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "creator@veolms.org",
  username: "creator",
  display_name: "VeoLMS Creator",
  email_verified_at: new Date(),
} as const;

const DEFAULT_SEED_ACADEMY = {
  id: "00000000-0000-4000-8000-000000000100",
  name: "VeoLMS Academy",
  logo_url: null,
  custom_domain: null,
  setup_completed: true,
} as const;

export const DEFAULT_SYSTEM_USER_ID = DEFAULT_SEED_USER.id;

const database = createDatabase(config.DATABASE_URL);

try {
  await seedRolesAndPermissions(database);

  // 1. Seed Academy
  await database
    .insertInto("academy")
    .values(DEFAULT_SEED_ACADEMY)
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  // 2. Seed default user
  await database
    .insertInto("users")
    .values(DEFAULT_SEED_USER)
    .onConflict((conflict) =>
      conflict.column("id").doUpdateSet({
        email: DEFAULT_SEED_USER.email,
        username: DEFAULT_SEED_USER.username,
        display_name: DEFAULT_SEED_USER.display_name,
        updated_at: new Date(),
      }),
    )
    .execute();

  // 3. Seed Scoped Role Assignment (Admin)
  await database
    .insertInto("role_assignments")
    .values({
      id: "00000000-0000-4000-8000-000000000001",
      user_id: DEFAULT_SEED_USER.id,
      role_id: "00000000-0000-4000-8000-000000000000", // Admin
      scope_type: "platform",
      course_id: null,
    })
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  // Assign legacy user_roles for compatibility
  await database
    .insertInto("user_roles")
    .values({
      user_id: DEFAULT_SEED_USER.id,
      role_id: "00000000-0000-4000-8000-000000000000",
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  // 4. Seed courses
  for (const course of courses) {
    await database
      .insertInto("courses")
      .values({
        ...course,
        creator_id: DEFAULT_SEED_USER.id,
      })
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          slug: course.slug,
          title: course.title,
          short_description: course.short_description,
          description: course.description,
          status: course.status,
          creator_id: DEFAULT_SEED_USER.id,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  console.info(`Seeded ${courses.length} published courses with Admin role assignment.`);
} finally {
  await database.destroy();
}
