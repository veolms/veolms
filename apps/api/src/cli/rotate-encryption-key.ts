/**
 * One-off rotation of MFA_ENCRYPTION_KEY.
 *
 * Every value the API encrypts at rest uses this key:
 *   - user_totp_credentials.secret_encrypted (authenticator-app secrets,
 *     auth.utils.ts encryptSecret/decryptSecret, "v1:iv:tag:data");
 *   - creator_payment_configs.encrypted_key_id, encrypted_key_secret and
 *     encrypted_webhook_secret (creator gateway credentials, crypto.helper.ts,
 *     "iv:tag:data"). That helper falls back to SESSION_SECRET only when
 *     MFA_ENCRYPTION_KEY is empty, which the config schema never allows, so
 *     SESSION_SECRET plays no part.
 * Both derive the AES-256-GCM key as sha256(MFA_ENCRYPTION_KEY).
 *
 * Decrypts every value with the old key and re-encrypts it with the new one in
 * a single transaction. Writes nothing unless every value decrypts, and checks
 * every rewritten value against the new key before committing. Prints counts
 * and, for values that fail, row ids only — never a secret or a person's data.
 *
 * Stop the API first: rows it writes with the old key while this runs would
 * be refused (the tables are locked) or, after the commit, unreadable.
 *
 *   OLD_MFA_ENCRYPTION_KEY=… NEW_MFA_ENCRYPTION_KEY=… \
 *     pnpm --filter @veolms/api encryption-key:rotate [--dry-run] [--yes]
 *
 * --dry-run decrypts everything with the old key (and round-trips it through
 * the new key when one is given), reports counts, and writes nothing.
 * --yes skips the question (required when not run from a terminal).
 * --allow-shipped-default accepts the public default as the new key; it is
 * only for undoing a rotation away from it.
 */
/* eslint-disable no-console -- an operator CLI: the terminal is its output */
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "@veolms/database";
import { sql } from "kysely";
import { config } from "../config.ts";
import {
  decryptSecret as decryptTotpSecret,
  encryptSecret as encryptTotpSecret,
} from "../modules/auth/shared/auth.utils.ts";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const SHIPPED_DEFAULT_KEY = "default_mfa_encryption_key_at_least_32_chars_long";
const MAX_LISTED_FAILURES = 20;

// crypto.helper.ts reads its key from config, so its format is mirrored here
// with the key passed in. Keep the two in step.
function encryptGatewaySecret(plainText: string, keySource: string): string {
  const key = crypto.createHash("sha256").update(keySource).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptGatewaySecret(payload: string, keySource: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }
  const key = crypto.createHash("sha256").update(keySource).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parts[0]!, "hex"),
  );
  decipher.setAuthTag(Buffer.from(parts[1]!, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2]!, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

type Cipher = {
  encrypt: (plainText: string, key: string) => string;
  decrypt: (payload: string, key: string) => string;
};

const totpCipher: Cipher = {
  encrypt: encryptTotpSecret,
  decrypt: decryptTotpSecret,
};
const gatewayCipher: Cipher = {
  encrypt: encryptGatewaySecret,
  decrypt: decryptGatewaySecret,
};

type Column = {
  table: "user_totp_credentials" | "creator_payment_configs";
  column: string;
  cipher: Cipher;
};

const COLUMNS: Column[] = [
  {
    table: "user_totp_credentials",
    column: "secret_encrypted",
    cipher: totpCipher,
  },
  {
    table: "creator_payment_configs",
    column: "encrypted_key_id",
    cipher: gatewayCipher,
  },
  {
    table: "creator_payment_configs",
    column: "encrypted_key_secret",
    cipher: gatewayCipher,
  },
  {
    table: "creator_payment_configs",
    column: "encrypted_webhook_secret",
    cipher: gatewayCipher,
  },
];

type Value = {
  target: Column;
  rowId: string;
  plainText: string;
  rotated: string;
};

type Failure = {
  target: Column;
  rowId: string;
  alreadyNewKey: boolean;
};

class RotationRefused extends Error {}

function tryDecrypt(cipher: Cipher, payload: string, key: string) {
  try {
    return cipher.decrypt(payload, key);
  } catch {
    return null;
  }
}

function label(target: Column): string {
  return `${target.table}.${target.column}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const confirmed = args.includes("--yes");
  const oldKey = process.env["OLD_MFA_ENCRYPTION_KEY"] ?? "";
  const newKey = process.env["NEW_MFA_ENCRYPTION_KEY"] ?? "";

  if (!oldKey) {
    console.error(`\n${red("✘ OLD_MFA_ENCRYPTION_KEY is not set.")}\n`);
    process.exit(1);
  }
  if (!dryRun || newKey) {
    if (newKey.length < 32) {
      console.error(
        `\n${red("✘ NEW_MFA_ENCRYPTION_KEY must be set and at least 32 characters.")}\n`,
      );
      process.exit(1);
    }
    if (newKey === oldKey) {
      console.error(`\n${red("✘ The new key is the same as the old key.")}\n`);
      process.exit(1);
    }
    if (
      newKey === SHIPPED_DEFAULT_KEY &&
      !args.includes("--allow-shipped-default")
    ) {
      console.error(
        `\n${red("✘ The new key is the public default from the code.")} ${dim(
          "To undo a rotation, add --allow-shipped-default.",
        )}\n`,
      );
      process.exit(1);
    }
  }

  // The question is asked with the tables locked, so it must be answerable.
  if (!dryRun && !confirmed && !stdin.isTTY) {
    console.error(
      `\n${red("✘ Not run from a terminal:")} pass --yes to re-encrypt without the question.\n`,
    );
    process.exit(1);
  }

  // Which key the API would use with this environment, without showing it.
  const configuredKey = config.MFA_ENCRYPTION_KEY;
  console.log(
    `\n${bold("MFA_ENCRYPTION_KEY in this environment:")} ${
      configuredKey === oldKey
        ? "the old key"
        : configuredKey === newKey
          ? "the new key"
          : yellow("neither the old nor the new key")
    }`,
  );

  const database = createDatabase(config.DATABASE_URL);

  try {
    await database.transaction().execute(async (trx) => {
      // Holds off other writers (a still-running API) until the commit, while
      // leaving reads alone. Gives up rather than queue behind a writer.
      await sql`set local lock_timeout = '10s'`.execute(trx);
      await sql`lock table user_totp_credentials, creator_payment_configs in share row exclusive mode`.execute(
        trx,
      );

      const values: Value[] = [];
      const failures: Failure[] = [];

      for (const target of COLUMNS) {
        const rows = await sql<{ id: string; payload: string }>`
          select id, ${sql.ref(target.column)} as payload
          from ${sql.table(target.table)}
          where ${sql.ref(target.column)} is not null
          order by id
        `.execute(trx);

        for (const row of rows.rows) {
          const plainText = tryDecrypt(target.cipher, row.payload, oldKey);
          if (plainText === null) {
            failures.push({
              target,
              rowId: row.id,
              alreadyNewKey:
                newKey !== "" &&
                tryDecrypt(target.cipher, row.payload, newKey) !== null,
            });
            continue;
          }

          let rotated = "";
          if (newKey) {
            rotated = target.cipher.encrypt(plainText, newKey);
            if (target.cipher.decrypt(rotated, newKey) !== plainText) {
              throw new RotationRefused(
                `Re-encrypted ${label(target)} for row ${row.id} did not read back.`,
              );
            }
          }
          values.push({ target, rowId: row.id, plainText, rotated });
        }
      }

      console.log(`\n${bold("Values found")}`);
      for (const target of COLUMNS) {
        const ok = values.filter((v) => v.target === target).length;
        const failed = failures.filter((f) => f.target === target).length;
        console.log(
          `  ${dim("•")} ${label(target).padEnd(56)} ${String(ok).padStart(5)} decrypt with the old key${
            failed ? red(`, ${failed} do not`) : ""
          }`,
        );
      }

      if (failures.length > 0) {
        console.error(
          `\n${red("✘ Some values do not decrypt with the old key:")}`,
        );
        for (const failure of failures.slice(0, MAX_LISTED_FAILURES)) {
          console.error(
            `  ${dim("•")} ${label(failure.target)} row ${failure.rowId}${
              failure.alreadyNewKey ? dim(" (already uses the new key)") : ""
            }`,
          );
        }
        if (failures.length > MAX_LISTED_FAILURES) {
          console.error(
            `  ${dim(`… and ${failures.length - MAX_LISTED_FAILURES} more`)}`,
          );
        }
        const alreadyNew = failures.filter((f) => f.alreadyNewKey).length;
        if (alreadyNew === failures.length) {
          console.error(
            `\n${yellow("Every one of them already uses the new key: the rotation has run before.")}`,
          );
        }
        throw new RotationRefused("Nothing was written.");
      }

      if (dryRun) {
        console.log(
          `\n${green("✓ Dry run:")} every value decrypts with the old key${
            newKey ? " and round-trips through the new key" : ""
          }. ${dim("Nothing was written.")}\n`,
        );
        return;
      }

      if (!confirmed) {
        // Opened only now: an interface opened earlier would swallow an
        // answer piped in on stdin before the question is asked.
        const rl = readline.createInterface({ input: stdin, output: stdout });
        const answer = await rl
          .question(
            `\n${bold(`Re-encrypt these ${values.length} values with the new key? [y/N] `)}`,
          )
          .catch(() => "")
          .finally(() => rl.close());
        if (answer.trim().toLowerCase() !== "y") {
          throw new RotationRefused("Nothing was written.");
        }
      }

      for (const value of values) {
        const result = await sql`
          update ${sql.table(value.target.table)}
          set ${sql.ref(value.target.column)} = ${value.rotated}
          where id = ${value.rowId}
        `.execute(trx);
        if (result.numAffectedRows !== 1n) {
          throw new RotationRefused(
            `Updating ${label(value.target)} for row ${value.rowId} changed ${result.numAffectedRows ?? 0} rows.`,
          );
        }
      }

      // Read everything back as the API will after the switch.
      for (const value of values) {
        const row = await sql<{ payload: string | null }>`
          select ${sql.ref(value.target.column)} as payload
          from ${sql.table(value.target.table)}
          where id = ${value.rowId}
        `.execute(trx);
        const payload = row.rows[0]?.payload;
        if (
          !payload ||
          tryDecrypt(value.target.cipher, payload, newKey) !== value.plainText
        ) {
          throw new RotationRefused(
            `${label(value.target)} for row ${value.rowId} did not read back with the new key.`,
          );
        }
      }

      console.log(
        `\n${green("✓ Re-encrypted")} ${bold(String(values.length))} values with the new key and committed.`,
      );
      console.log(
        dim(
          "  Set MFA_ENCRYPTION_KEY to the new key before the API starts again.\n",
        ),
      );
    });
  } catch (error) {
    if (error instanceof RotationRefused) {
      console.error(`\n${red("✘")} ${error.message} ${dim("(rolled back)")}\n`);
    } else {
      console.error(
        `\n${red("✘ Error:")}`,
        error instanceof Error ? error.message : error,
        dim("(rolled back)"),
        "\n",
      );
    }
    process.exitCode = 1;
  } finally {
    await database.destroy();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
