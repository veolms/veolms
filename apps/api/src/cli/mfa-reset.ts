/**
 * Break-glass reset of an account's two-factor sign-in.
 *
 * For the person who can no longer pass the second step: the passkey is on a
 * device they no longer have, the authenticator app is gone, and the backup
 * codes are lost or were never saved. Nothing a signed-out visitor can reach
 * removes a factor — that would make the factor worthless — so the way back
 * in is an operator with shell access running this, after confirming out of
 * band that the request comes from the account's owner.
 *
 * Removes every passkey, the authenticator app and the backup codes, and ends
 * every session. On the next sign-in an account that must have two-factor
 * (administrators, instructors) is asked to set it up again; any other
 * account signs in with its first step alone.
 *
 *   pnpm --filter @veolms/api user:mfa-reset <email-or-phone> [--yes]
 */
/* eslint-disable no-console -- an operator CLI: the terminal is its output */
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import * as mfaRepository from "../modules/auth/mfa/mfa.repository.ts";
import * as sessionRepository from "../modules/auth/session/session.repository.ts";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const rawIdentifier = args.find((arg) => !arg.startsWith("--"))?.trim();

  if (!rawIdentifier) {
    console.error(
      `\n${red("✘ Missing account.")} Usage: user:mfa-reset <email-or-phone> [--yes]\n`,
    );
    process.exit(1);
  }

  const isEmail = rawIdentifier.includes("@");
  const identifier = isEmail ? rawIdentifier.toLowerCase() : rawIdentifier;

  const database = createDatabase(config.DATABASE_URL);
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const user = await database
      .selectFrom("users")
      .select(["id", "email", "phone_no", "username", "display_name"])
      .where(isEmail ? "email" : "phone_no", "=", identifier)
      .executeTakeFirst();

    if (!user) {
      console.error(`\n${red("✘ No account found for")} "${rawIdentifier}"\n`);
      process.exitCode = 1;
      return;
    }

    const factors = await mfaRepository.findMfaFactorState(database, user.id);

    console.log(`\n${bold("Account")}`);
    console.log(`  ${dim("•")} User ID:       ${cyan(user.id)}`);
    console.log(`  ${dim("•")} Name:          ${cyan(user.display_name)}`);
    console.log(`  ${dim("•")} Email:         ${cyan(user.email ?? "—")}`);
    console.log(`  ${dim("•")} Phone:         ${cyan(user.phone_no ?? "—")}`);
    console.log(
      `  ${dim("•")} Passkeys:      ${cyan(String(factors.passkeyCount))}`,
    );
    console.log(
      `  ${dim("•")} Authenticator: ${cyan(factors.totpEnabled ? "active" : "not set up")}`,
    );

    if (!confirmed) {
      const answer = await rl.question(
        `\n${cyan("? ")}${bold("Remove every second factor and sign this account out everywhere? [y/N] ")}`,
      );
      if (answer.trim().toLowerCase() !== "y") {
        console.log(`\n${dim("Nothing was changed.")}\n`);
        return;
      }
    }

    await database.transaction().execute(async (trx) => {
      await mfaRepository.deleteAllUserPasskeys(trx, user.id);
      await mfaRepository.deleteTotpCredential(trx, user.id);
      await mfaRepository.deleteBackupCodes(trx, user.id);
      await sessionRepository.deleteAllUserSessions(trx, user.id);
    });

    console.log(
      `\n${green("✓ Two-factor sign-in reset for")} ${bold(identifier)}`,
    );
    console.log(
      dim(
        "  Passkeys, authenticator app and backup codes removed; all sessions ended.\n" +
          "  A running API may honour an already-open session for a few more seconds\n" +
          "  (its sign-in cache), then asks for a fresh sign-in.\n",
      ),
    );
  } catch (error) {
    console.error(
      `\n${red("✘ Error:")}`,
      error instanceof Error ? error.message : error,
      "\n",
    );
    process.exitCode = 1;
  } finally {
    rl.close();
    await database.destroy();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
