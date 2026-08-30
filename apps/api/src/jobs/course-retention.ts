import { createDatabase } from "@veolms/database";
import { S3StorageService } from "@veolms/storage";
import { config } from "../config.ts";
import { createCourseDeletionService } from "../modules/courses/lifecycle/course-deletion.service.ts";

const database = createDatabase(config.DATABASE_URL);
const storage = new S3StorageService({
  endpoint: config.STORAGE_ENDPOINT,
  region: config.STORAGE_REGION,
  accessKeyId: config.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
  bucket: config.STORAGE_BUCKET,
  forcePathStyle: config.STORAGE_FORCE_PATH_STYLE,
});

try {
  const service = createCourseDeletionService({ database, storage });
  const result = await service.purgeDueCourses();
  process.stdout.write(
    `${JSON.stringify({ job: "course-deletion-retention", ...result })}\n`,
  );
  if (result.failed > 0 || result.storage.failed > 0) {
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      job: "course-deletion-retention",
      error: error instanceof Error ? error.message : "Unknown worker error",
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await database.destroy();
}
