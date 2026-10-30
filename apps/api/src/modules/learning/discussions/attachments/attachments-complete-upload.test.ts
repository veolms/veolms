import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseExecutor } from "@veolms/database";
import type { S3StorageService } from "@veolms/storage";

import type {
  AttachmentRecord,
  AttachmentsRepository,
} from "./attachments.repository.ts";
import { createAttachmentsService } from "./attachments.service.ts";

// Audit section 26.2, item 4: completing an upload while the file store
// could not be reached answered 500, as if the server were at fault.

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const ATTACHMENT = "0b0f6f0e-6c0c-4f0e-9c58-2f8f6d0f4a11";
const db = {} as DatabaseExecutor;

const uploading: AttachmentRecord = {
  id: ATTACHMENT,
  ownerId: OWNER,
  targetType: null,
  targetId: null,
  kind: "image",
  storageKey: `protected/discussion-uploads/${ATTACHMENT}.png`,
  fileName: "diagram.png",
  mimeType: "image/png",
  fileSize: 1200,
  status: "uploading",
  width: null,
  height: null,
  metadata: null,
};

/** A service over one stored record and a file store that answers `head`. */
function build(head: () => Promise<{ contentLength?: number } | null>) {
  const calls = { markedReady: 0, warnings: [] as string[] };
  const repo = {
    findAttachmentById: async () => uploading,
    markUploadReady: async () => {
      calls.markedReady += 1;
    },
  } as unknown as AttachmentsRepository;
  const storage = {
    headObject: head,
    getCdnObjectUrl: () => null,
  } as unknown as S3StorageService;
  const service = createAttachmentsService(repo, {} as never, storage);
  const logger = {
    warn: (_details: object, message: string) => {
      calls.warnings.push(message);
    },
  };
  return {
    calls,
    complete: () => service.completeUpload(db, ATTACHMENT, OWNER, logger),
  };
}

async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const { statusCode, code } = error as { statusCode: number; code: string };
    return { statusCode, code };
  }
  return { statusCode: 200, code: "OK" };
}

await test("a file store that cannot be reached answers 503 STORAGE_UNAVAILABLE, and the cause is logged", async () => {
  const { calls, complete } = build(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:9000");
  });
  assert.deepEqual(await failure(complete), {
    statusCode: 503,
    code: "STORAGE_UNAVAILABLE",
  });
  assert.equal(calls.warnings.length, 1);
  // Nothing was confirmed, so the record stays as it was and can be retried.
  assert.equal(calls.markedReady, 0);
});

await test("a file that has not arrived yet still answers 400 UPLOAD_INCOMPLETE", async () => {
  const { calls, complete } = build(async () => null);
  assert.deepEqual(await failure(complete), {
    statusCode: 400,
    code: "UPLOAD_INCOMPLETE",
  });
  assert.equal(calls.warnings.length, 0);
  assert.equal(calls.markedReady, 0);
});

await test("a file of the wrong size still answers 400 FILE_SIZE_MISMATCH", async () => {
  const { calls, complete } = build(async () => ({ contentLength: 999 }));
  assert.deepEqual(await failure(complete), {
    statusCode: 400,
    code: "FILE_SIZE_MISMATCH",
  });
  assert.equal(calls.markedReady, 0);
});
