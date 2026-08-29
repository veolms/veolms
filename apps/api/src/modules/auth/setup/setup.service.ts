import crypto from "node:crypto";

import type { AcademyRequest, CreatorRegisterRequest } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { z } from "zod";

import { config } from "../../../config.ts";
import { AppError } from "../../../lib/errors.ts";
import { secureCompare } from "../../../lib/secure-compare.ts";
import type { CreateUserInput } from "../authentication/authentication.types.ts";
import * as academyRepository from "./setup.repository.ts";
import type { AuthService } from "../authentication/authentication.service.ts";
import type { SessionService } from "../session/session.service.ts";

const setupSessionSchema = z.object({ exp: z.number() });

export interface SetupServiceOptions {
  database: Kysely<Database>;
  authService: AuthService;
  sessionService: SessionService;
}

export function createSetupService({
  database,
  authService,
  sessionService,
}: SetupServiceOptions) {
  function isValidSetupToken(submitted: string): boolean {
    return secureCompare(submitted, config.SETUP_TOKEN);
  }

  async function assertSetupOpen(): Promise<void> {
    const academy = await academyRepository.findAcademy(database);

    if (academy?.setup_completed) {
      throw new AppError(
        403,
        "SETUP_ALREADY_COMPLETED",
        "The platform setup has already been finalized and locked.",
      );
    }
  }

  function assertValidSetupSession(
    signedCookie: { valid: boolean; value?: string | null } | undefined,
  ): void {
    if (!signedCookie) {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "A valid setup session is required for this action.",
      );
    }

    if (!signedCookie.valid || !signedCookie.value) {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "Setup session is invalid. Please re-verify the setup token.",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(signedCookie.value);
    } catch {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "Setup session is invalid. Please re-verify the setup token.",
      );
    }

    const parsed = setupSessionSchema.safeParse(payload);
    if (!parsed.success || parsed.data.exp < Date.now()) {
      throw new AppError(
        401,
        "SETUP_TOKEN_REQUIRED",
        "Setup session is missing or expired. Please re-verify the setup token.",
      );
    }
  }

  async function verifySetupToken(token: string): Promise<void> {
    await assertSetupOpen();

    if (!isValidSetupToken(token)) {
      throw new AppError(
        401,
        "INVALID_SETUP_TOKEN",
        "The setup token provided is incorrect.",
      );
    }
  }

  async function registerCreator(
    input: CreatorRegisterRequest,
    request: { ip: string; userAgent: string | null },
  ) {
    await assertSetupOpen();

    if (await authService.countUsers()) {
      throw new AppError(
        403,
        "CREATOR_EXISTS",
        "LMS platform has already been initialized. Creator account exists.",
      );
    }

    const username = await authService.generateUniqueUsername(
      input.email.split("@")[0] || "creator",
    );

    const createInput: CreateUserInput = {
      email: input.email,
      phoneNo: input.phoneNo || null,
      username,
      displayName: input.name,
      emailVerified: true,
    };
    const userId = await authService.createUser(createInput);
    const user = await authService.requireUser(userId);
    const session = await sessionService.establishSession(user, request);

    return { user, session };
  }

  async function configureAcademy(input: AcademyRequest) {
    await assertSetupOpen();

    const existing = await academyRepository.findAcademy(database);
    const academyId = existing?.id || crypto.randomUUID();

    await academyRepository.upsertAcademy(database, {
      id: academyId,
      name: input.name,
      logoUrl: input.logoUrl || null,
      customDomain: input.customDomain || null,
      exists: Boolean(existing),
    });

    return {
      id: academyId,
      name: input.name,
      logoUrl: input.logoUrl || null,
      customDomain: input.customDomain || null,
      setupCompleted: false,
    };
  }

  async function finalizeSetup(): Promise<void> {
    await assertSetupOpen();

    const academy = await academyRepository.findAcademy(database);
    if (!academy) {
      throw new AppError(
        400,
        "ACADEMY_NOT_CONFIGURED",
        "Configure academy details first.",
      );
    }

    if (!(await authService.countUsers())) {
      throw new AppError(
        400,
        "CREATOR_NOT_REGISTERED",
        "Register the creator account before finalizing setup.",
      );
    }

    await academyRepository.markSetupCompleted(database, academy.id);
  }

  return {
    assertSetupOpen,
    assertValidSetupSession,
    verifySetupToken,
    registerCreator,
    configureAcademy,
    finalizeSetup,
  };
}

export type SetupService = ReturnType<typeof createSetupService>;
