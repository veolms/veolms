import { siteSettings } from "@veolms/config";
import {
  formatMoney,
  type CourseSummary,
  type SiteCourseCard,
} from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { SiteRenderContext } from "@veolms/site-render";
import type { Kysely } from "kysely";
import type { AppServices } from "../../services/index.ts";
import { config } from "../../config.ts";
import { createAcademyBrandService } from "../academy/academy-brand.service.ts";
import { createCourseService } from "../courses/index.ts";
import * as repository from "./site.repository.ts";

/** How many of the newest courses a "latest" course grid may show. */
const LATEST_COURSES = 12;

/** A catalogue summary as a course card shows it. */
export function toCourseCard(course: CourseSummary): SiteCourseCard {
  const { pricing } = course;
  const money = (amount: number) =>
    formatMoney(amount, { currency: pricing.currency, unit: "major" });
  const onSale =
    pricing.pricingType === "paid" &&
    pricing.salePrice !== null &&
    pricing.salePrice < pricing.price;
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    summary: course.shortDescription,
    imageUrl: course.thumbnailUrl ?? null,
    priceLabel:
      pricing.pricingType === "free" || pricing.price === 0
        ? "Free"
        : money(onSale ? pricing.salePrice! : pricing.price),
    compareAtLabel: onSale ? money(pricing.price) : null,
    lessons: course.totalLessons,
  };
}

/**
 * Builds what the renderer needs from the courses and academy modules'
 * public services (never their tables) and this module's own pages.
 */
export function createSiteRenderContextBuilder({
  database,
  services,
}: {
  database: Kysely<Database>;
  services: AppServices;
}) {
  const courses = createCourseService({ database, services });
  const brand = createAcademyBrandService({ database });

  async function listCourseCards(
    limit: number = LATEST_COURSES,
  ): Promise<SiteCourseCard[]> {
    const summaries = await courses.listPublicCourseSummaries({
      limit,
      order: "recent",
    });
    return summaries.map((summary) => toCourseCard(summary as CourseSummary));
  }

  /** `pickedIds`: courses picked on the pages, beyond the newest ones. */
  async function build(pickedIds: readonly string[] = []) {
    const [latest, academy, pageSlugs] = await Promise.all([
      listCourseCards(),
      brand.getBrand(),
      repository.listPageSlugs(database),
    ]);
    const known = new Set(latest.map((course) => course.id));
    const missing = [...new Set(pickedIds)].filter((id) => !known.has(id));
    const picked =
      missing.length === 0
        ? []
        : (
            await courses.listPublicCourseSummaries({
              limit: missing.length,
              order: "recent",
              courseIds: missing,
            })
          ).map((summary) => toCourseCard(summary as CourseSummary));
    const webUrl = siteSettings(config).webUrl.replace(/\/+$/u, "");
    const context: SiteRenderContext = {
      mode: "live",
      academyName: academy.name,
      year: new Date().getFullYear(),
      courses: new Map(
        [...latest, ...picked].map((course) => [course.id, course]),
      ),
      latestCourses: latest,
      pageSlugs,
      urls: {
        course: (slug) => `${webUrl}/courses/${encodeURIComponent(slug)}`,
        // Pages are served side by side (`…/site/p/<slug>`).
        page: (slug) => `./${encodeURIComponent(slug)}`,
        catalog: `${webUrl}/courses`,
        legal: (slug) => `${webUrl}/${slug}`,
      },
    };
    return context;
  }

  return { build, listCourseCards };
}

export type SiteRenderContextBuilder = ReturnType<
  typeof createSiteRenderContextBuilder
>;
