import { TEAM_INVITATION_TTL_DAYS } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import {
  teamInvitationEmail,
  teamMemberAddedEmail,
  teamPreapprovedEmail,
  type EmailContent,
  type EmailService,
} from "@veolms/services/email";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import { config } from "../../../config.ts";
import { createAcademyBrandService } from "../../academy/academy-brand.service.ts";
import { findUserDisplayName } from "../members/members.repository.ts";

export function invitationUrl(token: string): string {
  return new URL(
    `/invite/${encodeURIComponent(token)}`,
    config.WEB_URL,
  ).toString();
}

/**
 * Team emails go out after the change has committed. A failed send is
 * logged and never fails the request: the change already applies, and an
 * invitation can be resent.
 */
export function createTeamMailer({
  database,
  email,
  log,
}: {
  database: Kysely<Database>;
  email: EmailService;
  log: FastifyBaseLogger;
}) {
  const brandService = createAcademyBrandService({ database });

  async function deliver(
    to: string,
    senderUserId: string | null,
    render: (context: {
      academyName: string;
      logoUrl: string | null;
      senderName: string | null;
    }) => EmailContent,
  ): Promise<boolean> {
    try {
      const [brand, senderName] = await Promise.all([
        brandService.getBrand(),
        senderUserId
          ? findUserDisplayName(database, senderUserId)
          : Promise.resolve(null),
      ]);
      const result = await email.send(
        to,
        render({
          academyName: brand.name,
          logoUrl: brand.logoUrl,
          senderName,
        }),
      );
      return result.status !== "failed";
    } catch (error) {
      log.warn({ err: error }, "Team email was not sent");
      return false;
    }
  }

  return {
    memberAdded: (input: {
      to: string;
      addedByUserId: string;
      roleNames: readonly string[];
    }) =>
      deliver(input.to, input.addedByUserId, (brand) =>
        teamMemberAddedEmail({
          academyName: brand.academyName,
          logoUrl: brand.logoUrl,
          addedByName: brand.senderName,
          roleNames: input.roleNames,
          openUrl: config.WEB_URL,
        }),
      ),

    invitation: (input: {
      to: string;
      invitedByUserId: string | null;
      roleNames: readonly string[];
      message: string | null;
      token: string;
    }) =>
      deliver(input.to, input.invitedByUserId, (brand) =>
        teamInvitationEmail({
          academyName: brand.academyName,
          logoUrl: brand.logoUrl,
          invitedByName: brand.senderName,
          roleNames: input.roleNames,
          message: input.message,
          acceptUrl: invitationUrl(input.token),
          expiresInDays: TEAM_INVITATION_TTL_DAYS,
        }),
      ),

    preapproved: (input: {
      to: string;
      addedByUserId: string | null;
      roleNames: readonly string[];
      message: string | null;
    }) =>
      deliver(input.to, input.addedByUserId, (brand) =>
        teamPreapprovedEmail({
          academyName: brand.academyName,
          logoUrl: brand.logoUrl,
          addedByName: brand.senderName,
          roleNames: input.roleNames,
          message: input.message,
          signInUrl: config.WEB_URL,
          email: input.to,
          expiresInDays: TEAM_INVITATION_TTL_DAYS,
        }),
      ),
  };
}

export type TeamMailer = ReturnType<typeof createTeamMailer>;
