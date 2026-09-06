import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import { createEmailService, otpVerificationEmail } from "../services/email/index.ts";
import {
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const args = process.argv.slice(2);
  const rl = readline.createInterface({ input: stdin, output: stdout });

  let rawEmail = args[0];
  let directCode = args[1];

  // If email was not passed as CLI argument, prompt interactively
  if (!rawEmail) {
    rawEmail = await rl.question(`${cyan("? ")}${bold("Enter instructor email: ")}`);
  }

  const email = rawEmail.trim().toLowerCase();

  if (!email || !isValidEmail(email)) {
    console.error(`\n${red("✘ Invalid email address:")} "${rawEmail}"\n`);
    rl.close();
    process.exit(1);
  }

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
    // 1. Ensure instructor role exists in database
    let instructorRole = await database
      .selectFrom("roles")
      .selectAll()
      .where("name", "=", INSTRUCTOR_ROLE)
      .executeTakeFirst();

    if (!instructorRole) {
      const defaultInstructorRoleId = "00000000-0000-4000-8000-000000000001";
      await database
        .insertInto("roles")
        .values({
          id: defaultInstructorRoleId,
          name: INSTRUCTOR_ROLE,
          description: "Course instructor and author",
        })
        .onConflict((oc) => oc.doNothing())
        .execute();

      instructorRole = await database
        .selectFrom("roles")
        .selectAll()
        .where("name", "=", INSTRUCTOR_ROLE)
        .executeTakeFirst();

      if (!instructorRole) {
        throw new Error(`Failed to initialize ${INSTRUCTOR_ROLE} role in database.`);
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

    // 6. Create or update user as instructor
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

      // Ensure user is marked verified
      if (!existingUser.email_verified_at || existingUser.is_deleted) {
        await database
          .updateTable("users")
          .set({ email_verified_at: new Date(), is_deleted: false, updated_at: new Date() })
          .where("id", "=", userId)
          .execute();
      }

      // Assign instructor role
      await database
        .insertInto("user_roles")
        .values({
          user_id: userId,
          role_id: instructorRole.id,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();

      console.log(`\n${green("✓ OTP verified successfully!")}`);
      console.log(`${green("✓ User upgraded to Instructor:")}`);
    } else {
      userId = crypto.randomUUID();

      // Derive unique username from email
      const baseUsername = email
        .split("@")[0]!
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .slice(0, 30) || "instructor";

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

      // Assign instructor role
      await database
        .insertInto("user_roles")
        .values({
          user_id: userId,
          role_id: instructorRole.id,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();

      console.log(`\n${green("✓ OTP verified successfully!")}`);
      console.log(`${green("✓ Instructor account created:")}`);
    }

    console.log(`  ${dim("•")} User ID:      ${cyan(userId)}`);
    console.log(`  ${dim("•")} Email:        ${cyan(email)}`);
    console.log(`  ${dim("•")} Username:     ${cyan(username)}`);
    console.log(`  ${dim("•")} Display Name: ${cyan(displayName)}`);
    console.log(`  ${dim("•")} Role:         ${cyan(instructorRole.name)}`);
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
