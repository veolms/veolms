import type { Database } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

import {
  createChatAssistantBridge,
  type ChatAssistantBridge,
} from "../../chat/index.ts";
import {
  createAssistantRepository,
  type AssistantRepository,
} from "./assistant.repository.ts";

/** What both assistant features share in one process. */
export interface AssistantRuntime {
  database: Kysely<Database>;
  repository: AssistantRepository;
  chat: ChatAssistantBridge;
}

const runtimes = new WeakMap<Kysely<Database>, AssistantRuntime>();

export function getAssistantRuntime(
  app: FastifyInstance,
  database: Kysely<Database>,
  storage: S3StorageService,
): AssistantRuntime {
  const existing = runtimes.get(database);
  if (existing) return existing;
  const runtime: AssistantRuntime = {
    database,
    repository: createAssistantRepository(),
    chat: createChatAssistantBridge(app, database, storage),
  };
  runtimes.set(database, runtime);
  app.addHook("onClose", async () => {
    runtimes.delete(database);
  });
  return runtime;
}
