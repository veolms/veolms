import { loadServerConfig } from "@veolms/config";

import { createDatabase } from "./client.ts";
import type { CourseStatus } from "./schema.ts";

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

export const DEFAULT_SYSTEM_USER_ID = DEFAULT_SEED_USER.id;

const database = createDatabase(config.DATABASE_URL);

try {
  const roles = [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "creator",
      description: "Platform owner and creator",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "student",
      description: "Enrolled student",
    },
  ];

  for (const role of roles) {
    await database
      .insertInto("roles")
      .values(role)
      .onConflict((conflict) =>
        conflict.column("name").doUpdateSet({
          description: role.description,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  // Seed default creator user
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

  // Assign creator role to the default user
  await database
    .insertInto("user_roles")
    .values({
      user_id: DEFAULT_SEED_USER.id,
      role_id: "00000000-0000-4000-8000-000000000001",
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

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

  console.info(
    `Seeded 1 default user, ${roles.length} roles, and ${courses.length} published courses.`,
  );
} finally {
  await database.destroy();
}
