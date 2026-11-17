import { siteSettings } from "@veolms/config";
import type { MarketingDesign } from "@veolms/contracts";
import type { DatabaseExecutor } from "@veolms/database";
import { marketingEmail, type EmailContent } from "@veolms/services/email";

import { config } from "../../config.ts";
import { createAcademyBrandService } from "../academy/academy-brand.service.ts";
import { firstNameOf } from "../commerce/orders/order-confirmation.service.ts";
import { clickUrl, openPixelUrl } from "./marketing-tracking.ts";

/**
 * One marketing email for one person: the editor's preview, the test email
 * and each real send all come through here, so they look the same.
 */

export function siteUrl(): string {
  return siteSettings(config).webUrl.replace(/\/+$/u, "");
}

export function courseUrl(slug: string): string {
  return `${siteUrl()}/courses/${encodeURIComponent(slug)}/overview`;
}

export async function renderMarketingEmail(
  database: DatabaseExecutor,
  input: {
    subject: string;
    preheader: string;
    blocks: readonly unknown[];
    design?: MarketingDesign;
    person: { displayName: string | null };
    course: { title: string; slug: string } | null;
    /** A real send: links and the open are tracked, with an unsubscribe link. */
    tracking?: {
      emailId: string;
      userId: string;
      unsubscribeUrl: string;
    } | null;
  },
): Promise<EmailContent> {
  const brand = await createAcademyBrandService({ database }).getBrand();
  const tracking = input.tracking ?? null;
  const fullName = input.person.displayName?.trim() || null;
  return marketingEmail({
    academyName: brand.name,
    logoUrl: brand.logoUrl,
    subject: input.subject,
    preheader: input.preheader,
    blocks: input.blocks,
    ...(input.design ? { design: input.design } : {}),
    recipient: {
      firstName:
        firstNameOf({ display_name: fullName, username: null }) || null,
      fullName,
    },
    course: input.course
      ? { title: input.course.title, url: courseUrl(input.course.slug) }
      : null,
    ...(tracking
      ? {
          linkFor: (linkNumber: number) =>
            clickUrl(tracking.emailId, tracking.userId, linkNumber),
          openPixelUrl: openPixelUrl(tracking.emailId, tracking.userId),
          unsubscribeUrl: tracking.unsubscribeUrl,
        }
      : {}),
    reason: `You're getting this email because you're a student of ${brand.name}.`,
  });
}
