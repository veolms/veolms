import fs from "node:fs";

import { z } from "zod";

/**
 * The apps allowed to receive pushes (PUSH_APPS) and the Firebase
 * service-account key each one is sent with. Read once per process.
 *
 * A broken entry (unreadable key file, bad JSON) never stops the API: the
 * app stays registrable, its pushes stay queued, and the error is logged
 * and reported by `problem`, so fixing the key and restarting sends them.
 */

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

export interface PushApp {
  applicationId: string;
  /** null when the key could not be read; see `problem`. */
  serviceAccount: ServiceAccount | null;
  problem: string | null;
}

export interface PushAppRegistry {
  /** False when PUSH_APPS is unset, empty or unreadable. */
  configured: boolean;
  get(applicationId: string): PushApp | undefined;
  list(): readonly PushApp[];
  /** Why PUSH_APPS as a whole could not be read, if it could not. */
  problem: string | null;
}

const entrySchema = z
  .strictObject({
    applicationId: z.string().trim().min(1).max(255),
    serviceAccountPath: z.string().trim().min(1).optional(),
    serviceAccountBase64: z.string().trim().min(1).optional(),
  })
  .refine(
    (entry) =>
      Boolean(entry.serviceAccountPath) !== Boolean(entry.serviceAccountBase64),
    { message: "Give serviceAccountPath or serviceAccountBase64, not both." },
  );

const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.url().optional(),
});

function readServiceAccount(
  entry: z.infer<typeof entrySchema>,
): ServiceAccount {
  const text = entry.serviceAccountPath
    ? fs.readFileSync(entry.serviceAccountPath, "utf8")
    : Buffer.from(entry.serviceAccountBase64!, "base64").toString("utf8");
  const parsed = serviceAccountSchema.parse(JSON.parse(text));
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
    tokenUri: parsed.token_uri ?? "https://oauth2.googleapis.com/token",
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parsePushApps(raw: string | undefined): PushAppRegistry {
  const apps = new Map<string, PushApp>();
  let problem: string | null = null;
  if (raw) {
    try {
      const entries = z.array(entrySchema).parse(JSON.parse(raw));
      for (const entry of entries) {
        let serviceAccount: ServiceAccount | null = null;
        let entryProblem: string | null = null;
        try {
          serviceAccount = readServiceAccount(entry);
        } catch (error) {
          entryProblem = `Firebase key for ${entry.applicationId} could not be read: ${message(error)}`;
        }
        apps.set(entry.applicationId, {
          applicationId: entry.applicationId,
          serviceAccount,
          problem: entryProblem,
        });
      }
    } catch (error) {
      problem = `PUSH_APPS could not be read: ${message(error)}`;
    }
  }
  return {
    configured: apps.size > 0,
    get: (applicationId) => apps.get(applicationId),
    list: () => [...apps.values()],
    problem,
  };
}

let cached: { raw: string | undefined; registry: PushAppRegistry } | null =
  null;

/** The registry for this process's PUSH_APPS, parsed once. */
export function pushAppsFor(raw: string | undefined): PushAppRegistry {
  if (!cached || cached.raw !== raw) {
    cached = { raw, registry: parsePushApps(raw) };
  }
  return cached.registry;
}
