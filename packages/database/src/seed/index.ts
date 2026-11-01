import { createHash } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
import { loadServerConfig } from "@veolms/config";
import { buildDicebearSvgUrl, DEFAULT_AVATAR_STYLE } from "@veolms/contracts";

import { createDatabase } from "../client.ts";
import type { Database } from "../schema.ts";
import { ROLES, seedRolesAndPermissions } from "./rbac.ts";
import { demoThumbnailIds, demoVideoPaths } from "./media.ts";
import { parseOptions } from "./options.ts";

const options = parseOptions(process.argv.slice(2));
if (process.env.NODE_ENV !== "development")
  throw new Error("Seed data requires NODE_ENV=development.");
const config = loadServerConfig(process.env);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(config.DATABASE_URL).hostname,
  )
) {
  throw new Error("Seed data requires a local PostgreSQL database.");
}
const playlists = demoVideoPaths;
const db = createDatabase(config.DATABASE_URL);

// Deterministic IDs make repeated runs and increasing counts additive.
function id(name: string): string {
  const h = createHash("sha256")
    .update(`veolms-local-seed:${name}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const academyId = id("academy");
const adminId = id("admin");
const studentId = (i: number) => id(`student:${i}`);
const date = new Date("2026-01-01T00:00:00.000Z");
const titles = [
  "Git and GitHub Essentials",
  "Web Development Foundations",
  "JavaScript in Practice",
  "TypeScript Fundamentals",
  "Accessible Web Design",
  "Backend API Basics",
  "Databases for Developers",
  "Testing Software",
  "Building Learning Habits",
  "Complete Developer Workshop",
];
const coursePrices = [
  { type: "free" as const, price: 0, salePrice: 0, badge: false },
  { type: "paid" as const, price: 499, salePrice: 499, badge: false },
  { type: "free" as const, price: 0, salePrice: 0, badge: false },
  { type: "paid" as const, price: 999, salePrice: 799, badge: true },
  { type: "free" as const, price: 0, salePrice: 0, badge: false },
  { type: "paid" as const, price: 1499, salePrice: 1499, badge: false },
  { type: "free" as const, price: 0, salePrice: 0, badge: false },
  { type: "paid" as const, price: 1999, salePrice: 1999, badge: false },
  { type: "free" as const, price: 0, salePrice: 0, badge: false },
  { type: "paid" as const, price: 2999, salePrice: 2499, badge: true },
];
const topics = [
  "Getting started",
  "Core concepts",
  "A practical example",
  "Common questions",
  "Putting it into practice",
  "Review and next steps",
];

// Limit insert size for PostgreSQL's parameter limit.
async function insertRows<T extends keyof Database>(
  database: Kysely<Database>,
  table: T,
  rows: Insertable<Database[T]>[],
) {
  for (let i = 0; i < rows.length; i += 200) {
    await database
      .insertInto(table)
      .values(rows.slice(i, i + 200) as never)
      .onConflict((c) => c.doNothing())
      .execute();
  }
}

try {
  const otherAcademy = await db
    .selectFrom("academy")
    .select("id")
    .where("id", "!=", academyId)
    .executeTakeFirst();
  const otherUsers = await db
    .selectFrom("users")
    .select("id")
    .where("id", "!=", adminId)
    .executeTakeFirst();
  const alreadySeeded = await db
    .selectFrom("academy")
    .select("id")
    .where("id", "=", academyId)
    .executeTakeFirst();
  if (otherAcademy || (!alreadySeeded && otherUsers))
    throw new Error(
      "Use a fresh local development database; this seed will not initialize an existing academy.",
    );

  await db.transaction().execute(async (tx) => {
    await seedRolesAndPermissions(tx);
    await tx
      .insertInto("academy")
      .values({
        id: academyId,
        name: "VeoLMS Demo Academy",
        logo_url: null,
        custom_domain: null,
        setup_completed: true,
      })
      .onConflict((c) => c.doNothing())
      .execute();
    const users: Insertable<Database["users"]>[] = [
      {
        id: adminId,
        email: "admin@veolms.org",
        username: "demo_admin",
        display_name: "Demo Administrator",
        email_verified_at: date,
      },
    ];
    for (let i = 1; i <= options.students; i++)
      users.push({
        id: studentId(i),
        email: `student${i}@demo.veolms.test`,
        username: `demo_student_${i}`,
        display_name: `Demo Student ${i}`,
        avatar_data_url: buildDicebearSvgUrl(
          DEFAULT_AVATAR_STYLE,
          `veolms-student-${i}`,
        ),
        email_verified_at: date,
      });
    await insertRows(tx, "users", users);
    for (let i = 1; i <= options.students; i++) {
      await tx
        .updateTable("users")
        .set({
          avatar_data_url: buildDicebearSvgUrl(
            DEFAULT_AVATAR_STYLE,
            `veolms-student-${i}`,
          ),
        })
        .where("id", "=", studentId(i))
        .where("avatar_data_url", "is", null)
        .execute();
    }
    const roleRows = users.map((user, i) => ({
      id: id(`role:${i}`),
      user_id: user.id,
      role_id: i === 0 ? ROLES.admin.id : ROLES.student.id,
      scope_type: "platform" as const,
      course_id: null,
    }));
    await insertRows(tx, "role_assignments", roleRows);
    await insertRows(
      tx,
      "user_roles",
      roleRows.map((r) => ({ user_id: r.user_id, role_id: r.role_id })),
    );

    await insertRows(
      tx,
      "media_assets",
      playlists.map((path, i) => ({
        id: id(`media:${i}`),
        owner_id: adminId,
        type: "video",
        storage_provider: "s3",
        storage_key: path,
        original_filename: `demo-video-${i + 1}.mp4`,
        mime_type: "video/mp4",
        size_bytes: 0,
        width: null,
        height: null,
        duration_seconds: null,
        metadata: JSON.stringify({}),
        status: "ready",
        upload_id: null,
        upload_part_size: null,
      })),
    );
    await insertRows(
      tx,
      "video_outputs",
      playlists.map((path, i) => ({
        id: id(`output:${i}`),
        video_id: id(`media:${i}`),
        master_playlist_path: path,
      })),
    );

    await insertRows(
      tx,
      "media_assets",
      demoThumbnailIds.map((sourceId, i) => {
        const prefix = `public/thumbnails/${sourceId}`;
        const original = `${prefix}/original.webp`;
        const variant = `${prefix}/960.webp`;
        return {
          id: id(`thumbnail:${i}`),
          owner_id: adminId,
          type: "image",
          storage_provider: "s3",
          storage_key: original,
          original_filename: `demo-thumbnail-${i + 1}.webp`,
          mime_type: "image/webp",
          size_bytes: 0,
          width: 960,
          height: 540,
          duration_seconds: null,
          metadata: JSON.stringify({
            full: { key: original },
            variants: [{ key: variant, width: 960, height: 540 }],
          }),
          status: "ready",
          upload_id: null,
          upload_part_size: null,
        };
      }),
    );

    for (let courseIndex = 0; courseIndex < options.courses; courseIndex++) {
      const courseId = id(`course:${courseIndex}`);
      const title =
        titles[courseIndex] ?? `Developer Learning Course ${courseIndex + 1}`;
      const sectionCount =
        courseIndex === 0
          ? 20
          : courseIndex === 1
            ? 5
            : courseIndex === 9
              ? 500
              : 6 + courseIndex;
      const thumbnailSourceId =
        demoThumbnailIds[courseIndex % demoThumbnailIds.length];
      const thumbnailMediaId = id(
        `thumbnail:${courseIndex % demoThumbnailIds.length}`,
      );
      const thumbnailUrl = `${config.CDN_URL.replace(/\/+$/, "")}/public/thumbnails/${thumbnailSourceId}/original.webp`;
      await insertRows(tx, "courses", [
        {
          id: courseId,
          slug: `demo-course-${courseIndex + 1}`,
          title,
          thumbnail_media_id: thumbnailMediaId,
          thumbnail_url: thumbnailUrl,
          short_description: `Explore ${title.toLowerCase()} through practical lessons.`,
          description: `A synthetic course for exploring VeoLMS and practicing ${title.toLowerCase()}.`,
          creator_id: adminId,
          status: "published",
          difficulty: "beginner",
          published_at: date,
        },
      ]);
      await tx
        .updateTable("courses")
        .set({
          thumbnail_media_id: thumbnailMediaId,
          thumbnail_url: thumbnailUrl,
        })
        .where("id", "=", courseId)
        .execute();
      const pricingConfig = coursePrices[courseIndex % coursePrices.length]!;
      await insertRows(tx, "course_pricing", [
        {
          id: id(`pricing:${courseIndex}`),
          course_id: courseId,
          pricing_type: pricingConfig.type,
          price: pricingConfig.price,
          sale_price: pricingConfig.salePrice,
          currency: "INR",
          show_discount_badge: pricingConfig.badge,
          linked_only: false,
        },
      ]);
      await tx
        .updateTable("course_pricing")
        .set({
          pricing_type: pricingConfig.type,
          price: pricingConfig.price,
          sale_price: pricingConfig.salePrice,
          currency: "INR",
          show_discount_badge: pricingConfig.badge,
          linked_only: false,
        })
        .where("course_id", "=", courseId)
        .execute();
      await insertRows(tx, "course_access_rules", [
        {
          id: id(`access:${courseIndex}`),
          course_id: courseId,
          access_type: "everyone",
          duration_type: "lifetime",
          duration_days: null,
        },
      ]);
      await insertRows(tx, "course_settings", [
        {
          id: id(`settings:${courseIndex}`),
          course_id: courseId,
          estimated_duration: null,
        },
      ]);
      const sections: Insertable<Database["course_sections"]>[] = [];
      const lessons: Insertable<Database["course_lessons"]>[] = [];
      const threads: Insertable<Database["learning_threads"]>[] = [];
      const replies: Insertable<Database["learning_replies"]>[] = [];
      for (let s = 0; s < sectionCount; s++) {
        const sectionId = id(`section:${courseIndex}:${s}`);
        sections.push({
          id: sectionId,
          course_id: courseId,
          title: `Section ${s + 1}: ${topics[(courseIndex + s) % topics.length]}`,
          position: s + 1,
        });
        for (let l = 0; l < options.lessons; l++) {
          const key = `${courseIndex}:${s}:${l}`;
          const lessonId = id(`lesson:${key}`);
          const topic = topics[(courseIndex * 7 + s * 3 + l) % topics.length]!;
          lessons.push({
            id: lessonId,
            course_id: courseId,
            section_id: sectionId,
            title: `${topic} ${l + 1}`,
            description: `Practice ${topic.toLowerCase()} and discuss what you learned.`,
            content_type: "video",
            content_media_id: id(
              `media:${(courseIndex * 19 + s * 7 + l * 3) % playlists.length}`,
            ),
            position: l + 1,
            is_preview: s === 0 && l === 0,
            is_published: true,
          });
          for (const [kind, count] of [
            ["comment", options.comments],
            ["question", options.questions],
          ] as const) {
            for (let n = 0; n < count; n++) {
              const threadId = id(`thread:${key}:${kind}:${n}`);
              const body =
                kind === "comment"
                  ? `This lesson helped me understand ${topic.toLowerCase()}.`
                  : `How can I practice ${topic.toLowerCase()} on my own?`;
              threads.push({
                id: threadId,
                academy_id: academyId,
                course_id: courseId,
                lesson_id: lessonId,
                user_id: studentId(((s + l + n) % options.students) + 1),
                kind,
                title:
                  kind === "question"
                    ? `Question about ${topic.toLowerCase()}`
                    : null,
                content: body,
                plain_text: body,
                visibility: "public",
                replies_count: 1,
              });
              const answer =
                kind === "question"
                  ? "Try the idea in a small project and review the result."
                  : "Thanks for sharing your progress!";
              replies.push({
                id: id(`reply:${key}:${kind}:${n}`),
                thread_id: threadId,
                user_id: adminId,
                content: answer,
                plain_text: answer,
              });
            }
          }
        }
      }
      await insertRows(tx, "course_sections", sections);
      await insertRows(tx, "course_lessons", lessons);
      await insertRows(tx, "learning_threads", threads);
      await insertRows(tx, "learning_replies", replies);
      await insertRows(
        tx,
        "enrollments",
        Array.from({ length: options.students }, (_, i) => ({
          id: id(`enrollment:${courseIndex}:${i + 1}`),
          user_id: studentId(i + 1),
          course_id: courseId,
          order_id: null,
          status: "active" as const,
          source: "free_grant" as const,
          access_expires_at: null,
        })),
      );
      await insertRows(
        tx,
        "access_grants",
        Array.from({ length: options.students }, (_, i) => ({
          id: id(`grant:${courseIndex}:${i + 1}`),
          user_id: studentId(i + 1),
          course_id: courseId,
          order_id: null,
          status: "active" as const,
          source: "free_grant" as const,
          valid_until: null,
        })),
      );
      console.info(
        `Prepared course ${courseIndex + 1}/${options.courses}: ${sectionCount} sections, ${lessons.length} lessons.`,
      );
    }

    if (options.orders > 0 && options.students > 0 && options.courses > 0) {
      const orders: Insertable<Database["orders"]>[] = [];
      const orderItems: Insertable<Database["order_items"]>[] = [];
      const orderItemCourses: Insertable<Database["order_item_courses"]>[] = [];
      const payments: Insertable<Database["payments"]>[] = [];
      const refunds: Insertable<Database["refunds"]>[] = [];
      const paidOrderLinks: Array<{
        userId: string;
        courseId: string;
        orderId: string;
        status: "active" | "revoked";
      }> = [];

      const paidCourseIndices = coursePrices
        .map((p, idx) => ({ ...p, idx }))
        .filter((p) => p.idx < options.courses && p.type === "paid")
        .map((p) => p.idx);
      const eligibleCourseIndices =
        paidCourseIndices.length > 0
          ? paidCourseIndices
          : Array.from({ length: options.courses }, (_, i) => i);

      for (let orderIndex = 0; orderIndex < options.orders; orderIndex++) {
        const studentNum = (orderIndex % options.students) + 1;
        const buyerId = studentId(studentNum);
        const courseIdx =
          eligibleCourseIndices[orderIndex % eligibleCourseIndices.length]!;
        const courseId = id(`course:${courseIdx}`);
        const courseTitle =
          titles[courseIdx] ?? `Developer Learning Course ${courseIdx + 1}`;
        const pricing = coursePrices[courseIdx % coursePrices.length]!;
        const priceMajor = pricing.salePrice || pricing.price || 499;
        const amountPaise = priceMajor * 100;

        const isRefunded = orderIndex === 3;
        const isPending = orderIndex === 7;
        const status = isRefunded
          ? ("refunded" as const)
          : isPending
            ? ("pending" as const)
            : ("paid" as const);

        const orderId = id(`order:${orderIndex}`);
        const orderNumber = `ORD-2026-${String(orderIndex + 1).padStart(4, "0")}`;
        const invoiceNumber =
          status === "paid" || status === "refunded"
            ? `INV/2026/${String(orderIndex + 1).padStart(5, "0")}`
            : null;

        const orderDate = new Date(
          date.getTime() + (orderIndex * 2 + 1) * 24 * 60 * 60 * 1000,
        );
        const paidAt =
          status === "paid" || status === "refunded"
            ? new Date(orderDate.getTime() + 15 * 60 * 1000)
            : null;
        const expiresAt = new Date(
          orderDate.getTime() + 30 * 24 * 60 * 60 * 1000,
        );

        orders.push({
          id: orderId,
          order_number: orderNumber,
          user_id: buyerId,
          status,
          currency: "INR",
          subtotal_amount: amountPaise,
          discount_amount: 0,
          tax_amount: 0,
          total_amount: amountPaise,
          after_commission_amount: null,
          coupon_id: null,
          idempotency_key: null,
          expires_at: expiresAt,
          paid_at: paidAt,
          invoice_number: invoiceNumber,
          invoice_pdf_key: null,
          created_at: orderDate,
          updated_at: paidAt ?? orderDate,
        });

        const orderItemId = id(`order_item:${orderIndex}`);
        orderItems.push({
          id: orderItemId,
          order_id: orderId,
          item_type: "course",
          course_id: courseId,
          bundle_id: null,
          quiz_pricing_id: null,
          title_snapshot: courseTitle,
          unit_price: amountPaise,
          discount_amount: 0,
          tax_amount: 0,
          final_amount: amountPaise,
          created_at: orderDate,
        });

        if (status === "paid" || status === "refunded") {
          orderItemCourses.push({
            id: id(`order_item_course:${orderIndex}`),
            order_item_id: orderItemId,
            order_id: orderId,
            user_id: buyerId,
            course_id: courseId,
            granted_at: paidAt!,
          });

          const paymentId = id(`payment:${orderIndex}`);
          payments.push({
            id: paymentId,
            order_id: orderId,
            gateway_provider: "razorpay",
            gateway_order_id: `order_seed_${orderIndex + 1}`,
            gateway_payment_id: `pay_seed_${orderIndex + 1}`,
            gateway_key_id: null,
            amount: amountPaise,
            currency: "INR",
            status: "captured",
            payment_method: JSON.stringify(
              orderIndex % 2 === 0
                ? { method: "upi", vpa: `student${studentNum}@okhdfcbank` }
                : { method: "card", cardNetwork: "visa", cardLast4: "4242" },
            ),
            error_code: null,
            error_description: null,
            created_at: paidAt!,
            updated_at: paidAt!,
          });

          if (isRefunded) {
            refunds.push({
              id: id(`refund:${orderIndex}`),
              order_id: orderId,
              order_item_id: orderItemId,
              payment_id: paymentId,
              gateway_refund_id: `rfnd_seed_${orderIndex + 1}`,
              amount: amountPaise,
              currency: "INR",
              reason: "Accidental purchase",
              status: "processed",
              created_by: adminId,
              idempotency_key: null,
              preserve_access: false,
              created_at: new Date(paidAt!.getTime() + 2 * 24 * 60 * 60 * 1000),
              updated_at: new Date(paidAt!.getTime() + 2 * 24 * 60 * 60 * 1000),
            });
          }

          paidOrderLinks.push({
            userId: buyerId,
            courseId,
            orderId,
            status: isRefunded ? "revoked" : "active",
          });
        }
      }

      await insertRows(tx, "orders", orders);
      await insertRows(tx, "order_items", orderItems);
      await insertRows(tx, "order_item_courses", orderItemCourses);
      await insertRows(tx, "payments", payments);
      if (refunds.length > 0) {
        await insertRows(tx, "refunds", refunds);
      }

      for (const link of paidOrderLinks) {
        await tx
          .updateTable("enrollments")
          .set({
            order_id: link.orderId,
            source: "direct_purchase",
            status: link.status,
          })
          .where("user_id", "=", link.userId)
          .where("course_id", "=", link.courseId)
          .execute();

        await tx
          .updateTable("access_grants")
          .set({
            order_id: link.orderId,
            source: "purchase",
            status: link.status,
          })
          .where("user_id", "=", link.userId)
          .where("course_id", "=", link.courseId)
          .execute();
      }
    }
  });
  console.info(
    `Seeded ${options.courses} courses, ${options.students} students, and ${options.orders} orders. Admin: admin@veolms.org.`,
  );
} finally {
  await db.destroy();
}
