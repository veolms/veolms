import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const DEFAULTS = {
  bucket: "veolms-hls-segments-133189879757-ap-south-1",
  destinationPrefix: "course-hls/thumbnails",
  mediaOrigin: "https://dev.veolms.org",
  profile: "veolms-deploy",
  sourcePrefix: "course-hls",
};

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value.replace(/\/+$/, "");
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

async function listVideoSlugs({ bucket, profile, sourcePrefix }) {
  const output = await run(
    "aws",
    [
      "s3api",
      "list-objects-v2",
      "--bucket",
      bucket,
      "--prefix",
      `${sourcePrefix}/`,
      "--delimiter",
      "/",
      "--query",
      "CommonPrefixes[].Prefix",
      "--output",
      "json",
      "--profile",
      profile,
    ],
    { capture: true },
  );
  return JSON.parse(output)
    .map((prefix) => prefix.slice(`${sourcePrefix}/`.length, -1))
    .filter((slug) => slug !== "thumbnails")
    .filter((slug) => /^[a-z0-9][a-z0-9-]*$/.test(slug))
    .sort();
}

async function objectExists({ bucket, key, profile }) {
  try {
    await run(
      "aws",
      [
        "s3api",
        "head-object",
        "--bucket",
        bucket,
        "--key",
        key,
        "--profile",
        profile,
      ],
      { capture: true },
    );
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    bucket: readOption(args, "--bucket", DEFAULTS.bucket),
    destinationPrefix: readOption(
      args,
      "--destination-prefix",
      DEFAULTS.destinationPrefix,
    ),
    mediaOrigin: readOption(args, "--media-origin", DEFAULTS.mediaOrigin),
    profile: readOption(args, "--profile", DEFAULTS.profile),
    sourcePrefix: readOption(args, "--source-prefix", DEFAULTS.sourcePrefix),
    force: args.includes("--force"),
  };
  const workDirectory = await mkdtemp(join(tmpdir(), "veolms-thumbnails-"));

  try {
    const slugs = await listVideoSlugs(options);
    if (slugs.length === 0) throw new Error("No HLS video folders found");
    console.log(`Found ${slugs.length} HLS videos.`);

    let uploaded = 0;
    for (const slug of slugs) {
      const key = `${options.destinationPrefix}/${slug}.webp`;
      if (!options.force && (await objectExists({ ...options, key }))) {
        console.log(`Skipping existing ${key}`);
        continue;
      }

      const outputPath = join(workDirectory, `${slug}.webp`);
      const manifestUrl = `${options.mediaOrigin}/${options.sourcePrefix}/${slug}/master.m3u8`;
      console.log(`Extracting ${slug}`);
      await run("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        manifestUrl,
        "-frames:v",
        "1",
        "-vf",
        "scale=1280:-2:force_original_aspect_ratio=decrease",
        "-c:v",
        "libwebp",
        "-quality",
        "76",
        "-compression_level",
        "6",
        "-preset",
        "picture",
        outputPath,
      ]);

      const { size } = await stat(outputPath);
      await run("aws", [
        "s3",
        "cp",
        outputPath,
        `s3://${options.bucket}/${key}`,
        "--content-type",
        "image/webp",
        "--cache-control",
        "public,max-age=31536000,immutable",
        "--only-show-errors",
        "--profile",
        options.profile,
      ]);
      uploaded += 1;
      console.log(`Uploaded ${key} (${Math.round(size / 1024)} KiB)`);
    }

    console.log(
      `Finished: ${uploaded} uploaded, ${slugs.length - uploaded} skipped.`,
    );
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
