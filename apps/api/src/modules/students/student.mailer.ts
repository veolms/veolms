import type { Database } from "@veolms/database";
import { studentAddedEmail, type EmailService } from "@veolms/services/email";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import { config } from "../../config.ts";
import { createAcademyBrandService } from "../academy/academy-brand.service.ts";
import { listUserDisplayNamesByIds } from "../auth/authentication/authentication.repository.ts";

/**
 * The welcome email of a student added by hand goes out after the account
 * has committed. A failed send is logged and never fails the request: the
 * account already exists, and the student can sign in without the email.
 */
export function createStudentMailer({
  database,
  email,
  log,
}: {
  database: Kysely<Database>;
  email: EmailService;
  log: FastifyBaseLogger;
}) {
  const brandService = createAcademyBrandService({ database });

  return {
    studentAdded: async (input: {
      to: string;
      addedByUserId: string;
      courseTitles: readonly string[];
    }): Promise<boolean> => {
      try {
        const [brand, [sender]] = await Promise.all([
          brandService.getBrand(),
          listUserDisplayNamesByIds(database, [input.addedByUserId]),
        ]);
        const result = await email.send(
          input.to,
          studentAddedEmail({
            academyName: brand.name,
            logoUrl: brand.logoUrl,
            addedByName: sender?.display_name ?? null,
            email: input.to,
            courseTitles: input.courseTitles,
            signInUrl: new URL("/login", config.WEB_URL).toString(),
          }),
        );
        return result.status !== "failed";
      } catch (error) {
        log.warn({ err: error }, "Student welcome email was not sent");
        return false;
      }
    },
  };
}

export type StudentMailer = ReturnType<typeof createStudentMailer>;
