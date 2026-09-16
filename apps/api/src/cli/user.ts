import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import { createEmailService, otpVerificationEmail } from "../services/email/index.ts";
import {
  ADMIN_ROLE,
  INSTRUCTOR_ROLE,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
} from "../modules/auth/shared/auth.constants.ts";
import { hashToken } from "../modules/auth/shared/auth.utils.ts";

// ANSI color helpers
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const dummyLogger = {
  child: () => dummyLogger,
  info: () => {},
  warn: () => {},
  error: (obj: unknown, msg?: string) => console.error(red(msg ?? String(obj))),
  debug: () => {},
  trace: () => {},
  fatal: () => {},
};

type TargetRole = "instructor" | "admin";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseRole(value?: string | null): TargetRole | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  if (lower === "admin" || lower === "administrator" || lower === "2") return "admin";
  if (lower === "instructor" || lower === "1") return "instructor";
  return null;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const rl = readline.createInterface({ input: stdin, output: stdout });

  // Extract flag-based role (e.g. --role=admin or --role admin)
  let selectedRole: TargetRole | null = null;
  const positionalArgs: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]!;
    if (arg.startsWith("--role=")) {
      selectedRole = parseRole(arg.split("=")[1]);
    } else if (arg === "--role" && rawArgs[i + 1]) {
      selectedRole = parseRole(rawArgs[++i]);
    } else {
      positionalArgs.push(arg);
    }
  }

  // Parse positional arguments: <email> [otp/code] [role]
  let rawEmail = positionalArgs[0];
  let directCode = positionalArgs[1];

  if (!selectedRole && positionalArgs[2]) {
    selectedRole = parseRole(positionalArgs[2]);
  } else if (!selectedRole && positionalArgs[1] && parseRole(positionalArgs[1])) {
    selectedRole = parseRole(positionalArgs[1]);
    directCode = undefined;
  }

  // If email was not passed, prompt interactively
  if (!rawEmail) {
    rawEmail = await rl.question(`${cyan("? ")}${bold("Enter user email: ")}`);
  }

  const email = rawEmail.trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    console.error(`\n${red("✘ Invalid email address:")} "${rawEmail}"\n`);
    rl.close();
    process.exit(1);
  }

  // If role was not passed, prompt interactively with choices
  if (!selectedRole) {
    console.log(`\n${cyan("? ")}${bold("Select role to assign:")}`);
    console.log(`  ${dim("1)")} Instructor     ${dim("(Course author and instructor)")}`);
    console.log(`  ${dim("2)")} Administrator  ${dim("(Full platform access)")}`);

    const roleChoice = await rl.question(`${cyan("➜ ")}${bold("Enter choice [1/2] (default 1): ")}`);
    selectedRole = parseRole(roleChoice) || "instructor";
  }

  const isAdministrator = selectedRole === "admin";
  const roleDisplayName = isAdministrator ? "Administrator" : "Instructor";

  const database = createDatabase(config.DATABASE_URL);
  const emailService = createEmailService({
    logger: dummyLogger as never,
    config: {
      transport: config.EMAIL_TRANSPORT,
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      from: config.EMAIL_FROM,
    },
  });

  try {
    // 1. Ensure target role exists in database
    let targetRoleRecord = await database
      .selectFrom("roles")
      .selectAll()
      .where((eb) =>
        isAdministrator
          ? eb.or([
              eb("name", "=", ADMIN_ROLE),
              eb("name", "=", "Administrator"),
              eb("role_key", "=", ADMIN_ROLE),
              eb("id", "=", "00000000-0000-4000-8000-000000000000"),
            ])
          : eb.or([
              eb("name", "=", INSTRUCTOR_ROLE),
              eb("name", "=", "Instructor"),
              eb("role_key", "=", INSTRUCTOR_ROLE),
              eb("id", "=", "00000000-0000-4000-8000-000000000001"),
            ]),
      )
      .executeTakeFirst();

    if (!targetRoleRecord) {
      const defaultRoleId = isAdministrator
        ? "00000000-0000-4000-8000-000000000000"
        : "00000000-0000-4000-8000-000000000001";
      const defaultRoleName = isAdministrator ? ADMIN_ROLE : INSTRUCTOR_ROLE;
      const defaultRoleDescription = isAdministrator
        ? "System administrator with full platform access"
        : "Course instructor and author";

      await database
        .insertInto("roles")
        .values({
          id: defaultRoleId,
          name: defaultRoleName,
          role_key: defaultRoleName,
          description: defaultRoleDescription,
          is_system: true,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();

      targetRoleRecord = await database
        .selectFrom("roles")
        .selectAll()
        .where("id", "=", defaultRoleId)
        .executeTakeFirst();

      if (!targetRoleRecord) {
        throw new Error(`Failed to initialize ${roleDisplayName} role in database.`);
      }
    }

    // 2. Generate and store OTP code
    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const now = new Date();
    const purpose = "email_verification";

    // Invalidate outstanding OTPs for this email
    await database
      .updateTable("otp_codes")
      .set({ consumed_at: now })
      .where("identifier", "=", email)
      .where("identifier_type", "=", "email")
      .where("consumed_at", "is", null)
      .execute();

    // Insert new OTP record
    await database
      .insertInto("otp_codes")
      .values({
        id: crypto.randomUUID(),
        identifier: email,
        identifier_type: "email",
        purpose,
        code_hash: hashToken(code),
        attempts: 0,
        expires_at: new Date(now.getTime() + OTP_TTL_MS),
        consumed_at: null,
      })
      .execute();

    // 3. Send OTP email
    const emailResult = await emailService.send(
      email,
      otpVerificationEmail({
        code,
        academyName: config.RP_NAME,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    );

    const loginUrl = `${config.WEB_URL}/login`;

    console.log(`\n${green("✓")} OTP dispatched to ${bold(email)}`);
    console.log(`${cyan("➜")} Web Login Link: ${bold(cyan(loginUrl))}`);

    // If email was logged (e.g. console transport in development), show code for convenience
    if (emailResult.status === "logged" || config.NODE_ENV !== "production") {
      console.log(`${dim(`[Dev] Generated OTP code: ${bold(code)} (expires in ${OTP_TTL_MINUTES}m)`)}`);
    }

    // 4. Prompt for OTP code if not provided via CLI argument
    let enteredCode = directCode;
    if (!enteredCode) {
      enteredCode = await rl.question(`\n${cyan("? ")}${bold("Enter the 6-digit OTP: ")}`);
    }

    enteredCode = enteredCode.trim();

    if (!enteredCode || enteredCode.length !== 6) {
      console.error(`\n${red("✘ Invalid OTP:")} Code must be 6 digits.\n`);
      process.exitCode = 1;
      return;
    }

    // 5. Verify OTP
    const matchingOtp = await database
      .selectFrom("otp_codes")
      .selectAll()
      .where("identifier", "=", email)
      .where("identifier_type", "=", "email")
      .where("code_hash", "=", hashToken(enteredCode))
      .where("consumed_at", "is", null)
      .where("expires_at", ">", new Date())
      .executeTakeFirst();

    if (!matchingOtp) {
      console.error(`\n${red("✘ Verification failed:")} Code is invalid, expired, or already used.\n`);
      process.exitCode = 1;
      return;
    }

    // Mark OTP consumed
    await database
      .updateTable("otp_codes")
      .set({ consumed_at: new Date() })
      .where("id", "=", matchingOtp.id)
      .execute();

    // 6. Create or update user
    const existingUser = await database
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email)
      .executeTakeFirst();

    let userId: string;
    let username: string;
    let displayName: string;

    if (existingUser) {
      userId = existingUser.id;
      username = existingUser.username;
      displayName = existingUser.display_name;

      // Ensure user is marked verified and active
      if (!existingUser.email_verified_at || existingUser.is_deleted) {
        await database
          .updateTable("users")
          .set({ email_verified_at: new Date(), is_deleted: false, updated_at: new Date() })
          .where("id", "=", userId)
          .execute();
      }

      // Assign role in user_roles
      await database
        .insertInto("user_roles")
        .values({
          user_id: userId,
          role_id: targetRoleRecord.id,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();

      // For Administrator, also ensure platform-scoped role_assignment exists
      if (isAdministrator) {
        const existingAssignment = await database
          .selectFrom("role_assignments")
          .select("id")
          .where("user_id", "=", userId)
          .where("role_id", "=", targetRoleRecord.id)
          .where("scope_type", "=", "platform")
          .executeTakeFirst();

        if (!existingAssignment) {
          await database
            .insertInto("role_assignments")
            .values({
              id: crypto.randomUUID(),
              user_id: userId,
              role_id: targetRoleRecord.id,
              scope_type: "platform",
              course_id: null,
            })
            .execute();
        }
      }

      console.log(`\n${green("✓ OTP verified successfully!")}`);
      console.log(`${green(`✓ User upgraded to ${roleDisplayName}:`)}`);
    } else {
      userId = crypto.randomUUID();

      // Derive unique username from email
      const baseUsername = email
        .split("@")[0]!
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .slice(0, 30) || selectedRole;

      username = baseUsername;
      let suffix = 1;
      while (
        await database
          .selectFrom("users")
          .select("id")
          .where("username", "=", username)
          .executeTakeFirst()
      ) {
        username = `${baseUsername}_${suffix++}`;
      }

      displayName = username
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Create new user with verified email
      await database
        .insertInto("users")
        .values({
          id: userId,
          email,
          phone_no: null,
          username,
          display_name: displayName,
          email_verified_at: new Date(),
          phone_verified_at: null,
          mfa_mandatory: false,
        })
        .execute();

      // Assign role in user_roles
      await database
        .insertInto("user_roles")
        .values({
          user_id: userId,
          role_id: targetRoleRecord.id,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();

      // For Administrator, assign platform-scoped role_assignment
      if (isAdministrator) {
        await database
          .insertInto("role_assignments")
          .values({
            id: crypto.randomUUID(),
            user_id: userId,
            role_id: targetRoleRecord.id,
            scope_type: "platform",
            course_id: null,
          })
          .execute();
      }

      console.log(`\n${green("✓ OTP verified successfully!")}`);
      console.log(`${green(`✓ ${roleDisplayName} account created:`)}`);
    }

    console.log(`  ${dim("•")} User ID:      ${cyan(userId)}`);
    console.log(`  ${dim("•")} Email:        ${cyan(email)}`);
    console.log(`  ${dim("•")} Username:     ${cyan(username)}`);
    console.log(`  ${dim("•")} Display Name: ${cyan(displayName)}`);
    console.log(`  ${dim("•")} Role:         ${cyan(targetRoleRecord.name)}`);
    console.log(`\n${green("✓ You can now log in at:")} ${bold(cyan(loginUrl))}\n`);
  } catch (error) {
    console.error(`\n${red("✘ Error:")}`, error instanceof Error ? error.message : error, "\n");
    process.exitCode = 1;
  } finally {
    rl.close();
    await emailService.close();
    await database.destroy();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
