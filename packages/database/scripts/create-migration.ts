import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv
  .slice(2)
  .filter((argument) => argument !== "--")
  .join("-")
  .trim();

if (!name) {
  console.error("Usage: pnpm migration:create <migration-name>");
  process.exit(1);
}

const safeName = name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

if (!safeName) {
  console.error(
    `Invalid migration name "${name}". Use letters, numbers, or hyphens.`,
  );
  process.exit(1);
}

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
fs.mkdirSync(migrationsDir, { recursive: true });

// Generate timestamp: YYYYMMDDHHMMSS
const now = new Date();

const timestamp =
  `${now.getFullYear()}` +
  `${String(now.getMonth() + 1).padStart(2, "0")}` +
  `${String(now.getDate()).padStart(2, "0")}` +
  `${String(now.getHours()).padStart(2, "0")}` +
  `${String(now.getMinutes()).padStart(2, "0")}` +
  `${String(now.getSeconds()).padStart(2, "0")}`;

const filename = `${timestamp}-${safeName}.ts`;
const filePath = path.join(migrationsDir, filename);

if (fs.existsSync(filePath)) {
  console.error(`Migration already exists: ${filename}`);
  process.exit(1);
}

const template = `import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {}

export async function down(database: Kysely<unknown>): Promise<void> {}
`;

fs.writeFileSync(filePath, template);

console.log(`Created migration: ${path.relative(process.cwd(), filePath)}`);