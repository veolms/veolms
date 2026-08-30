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
const database = createDatabase(config.DATABASE_URL);

try {
  await seedRolesAndPermissions(database);

  for (const course of courses) {
    await database
      .insertInto("courses")
      .values(course)
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          slug: course.slug,
          title: course.title,
          short_description: course.short_description,
          description: course.description,
          status: course.status,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  console.info(`Seeded ${courses.length} published courses.`);
} finally {
  await database.destroy();
}

