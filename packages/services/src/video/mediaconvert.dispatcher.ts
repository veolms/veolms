import {
  MediaConvertClient,
  CreateJobCommand,
  CancelJobCommand,
  type CreateJobCommandInput,
} from "@aws-sdk/client-mediaconvert";
import {
  QUALITY_PROFILES,
  type ChapterThumbnailCapture,
  type QualityProfile,
  type VideoJobEvent,
  type VideoQualityLevel,
} from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";
import type { VideoDispatchResult, VideoDispatchService } from "./types.ts";

/**
 * Strategy 1: AWS MediaConvert (Inbuilt / Direct SDK)
 * Uses @aws-sdk/client-mediaconvert directly to submit and manage transcoding jobs.
 *
 * Job-template mode: when MEDIACONVERT_JOB_TEMPLATE is set the dispatcher passes
 * only the source input and destination override to AWS, delegating all
 * codec/ladder/packaging decisions to the pre-built template.  The inline ladder
 * is kept as an automatic fallback for deployments that have not yet created a
 * template.
 *
 * DRM ClearKey: when DRM_MASTER_KEY and DRM_MASTER_KEY_VERSION are also set the
 * dispatcher injects drmKeySystem / drmMasterKeyVersion into UserMetadata so the
 * webhook handler and ClearKey license driver can resolve the right key later.
 * The same job template is used for both plain and DRM jobs — the template itself
 * must be configured with a StaticKeyProvider when DRM is required.
 */
export function createMediaConvertDispatcher(options: {
  config: ServerConfig;
  logger: FastifyBaseLogger;
}): VideoDispatchService {
  const { config, logger } = options;

  let clientInstance: MediaConvertClient | null = null;
  function getClient(): MediaConvertClient {
    if (!clientInstance) {
      const region =
        config.MEDIACONVERT_REGION ||
        config.STORAGE_REGION ||
        process.env.AWS_REGION ||
        "us-east-1";

      const accessKeyId =
        config.MEDIACONVERT_ACCESS_KEY_ID ||
        config.STORAGE_ACCESS_KEY_ID ||
        process.env.AWS_ACCESS_KEY_ID;

      const secretAccessKey =
        config.MEDIACONVERT_SECRET_ACCESS_KEY ||
        config.STORAGE_SECRET_ACCESS_KEY ||
        process.env.AWS_SECRET_ACCESS_KEY;

      let endpoint = config.MEDIACONVERT_ENDPOINT || undefined;
      if (endpoint) {
        endpoint = endpoint.replace(/\/2017-08-29\/?$/, "");
      }

      clientInstance = new MediaConvertClient({
        region,
        endpoint,
        credentials:
          accessKeyId && secretAccessKey
            ? { accessKeyId, secretAccessKey }
            : undefined,
      });
    }
    return clientInstance;
  }

  async function dispatchChapterThumbnails(
    client: MediaConvertClient,
    payload: VideoJobEvent,
    capture: ChapterThumbnailCapture,
    videoKey: string,
    roleArn: string,
  ): Promise<void> {
    const bucket = config.STORAGE_BUCKET;
    const toUri = (key: string) =>
      key.startsWith("s3://") ? key : `s3://${bucket}/${key}`;
    const userMetadata: Record<string, string> = {
      jobKind: "chapter-thumbnails",
      videoId: payload.videoId || "",
      sourceKey: videoKey,
      chapterThumbnailTimes: capture.times.join(","),
      chapterThumbnailDestination: capture.destinationPrefix,
    };
    if (capture.masterPlaylistKey) {
      userMetadata.masterPlaylistKey = capture.masterPlaylistKey;
    }
    if (config.MEDIACONVERT_WEBHOOK_URL) {
      userMetadata.webhookUrl = config.MEDIACONVERT_WEBHOOK_URL;
      if (config.MEDIACONVERT_WEBHOOK_SECRET) {
        userMetadata.webhookSecret = config.MEDIACONVERT_WEBHOOK_SECRET;
      }
    }

    const result = await client.send(
      new CreateJobCommand({
        Role: roleArn,
        Queue: config.MEDIACONVERT_QUEUE_ARN || undefined,
        UserMetadata: userMetadata,
        Settings: {
          Inputs: [{ FileInput: toUri(videoKey) }],
          OutputGroups: [
            {
              Name: "Chapter_Thumbnail_Group",
              OutputGroupSettings: {
                Type: "FILE_GROUP_SETTINGS",
                FileGroupSettings: {
                  Destination: toUri(capture.destinationPrefix),
                },
              },
              Outputs: [
                {
                  ContainerSettings: { Container: "RAW" },
                  VideoDescription: {
                    Width: 480,
                    CodecSettings: { Codec: "FRAME_CAPTURE" },
                  },
                  Extension: "webp",
                },
              ],
            },
          ],
        },
      }),
    );

    logger.info(
      {
        videoId: payload.videoId,
        chapters: capture.times.length,
        mediaConvertJobId: result.Job?.Id,
      },
      "[video-dispatch:mediaconvert] Chapter thumbnail capture submitted",
    );
  }

  /**
   * Build a CreateJobCommandInput using a pre-created AWS MediaConvert job template.
   *
   * Templates store the full ladder/codec/packaging configuration; we only supply
   * the source input, the output destination override, and userMetadata.
   */
  function buildTemplateJobInput(opts: {
    templateName: string;
    roleArn: string;
    inputUri: string;
    destination: string;
    userMetadata: Record<string, string>;
  }): CreateJobCommandInput {
    return {
      Role: opts.roleArn,
      Queue: config.MEDIACONVERT_QUEUE_ARN || undefined,
      JobTemplate: opts.templateName,
      UserMetadata: opts.userMetadata,
      Settings: {
        Inputs: [
          {
            FileInput: opts.inputUri,
            AudioSelectors: {
              "Audio Selector 1": {
                DefaultSelection: "DEFAULT",
              },
            },
          },
        ],
        // Provide a destination override so every output group in the template
        // writes into the correct job-specific S3 prefix.
        OutputGroups: [
          {
            OutputGroupSettings: {
              Type: "DASH_ISO_GROUP_SETTINGS",
              DashIsoGroupSettings: {
                Destination: opts.destination,
              },
            },
          },
        ],
      },
    };
  }

  /**
   * Build a CreateJobCommandInput with fully-inlined output settings.
   * Used as fallback when MEDIACONVERT_JOB_TEMPLATE is not configured.
   */
  function buildInlineJobInput(opts: {
    roleArn: string;
    inputUri: string;
    destination: string;
    bucket: string;
    qualities: readonly VideoQualityLevel[];
    thumbnailDestination?: string;
    userMetadata: Record<string, string>;
  }): CreateJobCommandInput {
    const outputs = opts.qualities.map((q) => {
      const profile: QualityProfile =
        QUALITY_PROFILES[q] || QUALITY_PROFILES["720p"];

      return {
        NameModifier: `_${q}`,
        VideoDescription: {
          Width: profile.width,
          Height: profile.height,
          CodecSettings: {
            Codec: "H_264" as const,
            H264Settings: {
              RateControlMode: "QVBR" as const,
              MaxBitrate: (profile.maxBitrateKbps || 2800) * 1000,
              QualityTuningLevel: "SINGLE_PASS" as const,
              SceneChangeDetect: "TRANSITION_DETECTION" as const,
            },
          },
        },
        AudioDescriptions: [
          {
            CodecSettings: {
              Codec: "AAC" as const,
              AacSettings: {
                Bitrate: 128000,
                SampleRate: 48000,
                CodingMode: "CODING_MODE_2_0" as const,
              },
            },
          },
        ],
      };
    });

    const baseDest = opts.destination.replace(/\/+$/, "");

    const outputGroups: NonNullable<
      CreateJobCommandInput["Settings"]
    >["OutputGroups"] = [
      {
        Name: "HLS_Group",
        OutputGroupSettings: {
          Type: "HLS_GROUP_SETTINGS",
          HlsGroupSettings: {
            Destination: baseDest,
            SegmentLength: 2,
            MinSegmentLength: 0,
          },
        },
        Outputs: outputs,
      },
    ];

    if (opts.thumbnailDestination) {
      const rawDest = opts.thumbnailDestination.startsWith("s3://")
        ? opts.thumbnailDestination
        : `s3://${opts.bucket}/${opts.thumbnailDestination}`;

      const thumbDestDir = rawDest.endsWith(".webp")
        ? rawDest.slice(0, rawDest.lastIndexOf("/") + 1)
        : rawDest.endsWith("/")
          ? rawDest
          : `${rawDest}/`;

      outputGroups.unshift({
        Name: "Thumbnail_Group",
        OutputGroupSettings: {
          Type: "FILE_GROUP_SETTINGS",
          FileGroupSettings: {
            Destination: thumbDestDir,
          },
        },
        Outputs: [
          {
            ContainerSettings: { Container: "RAW" },
            VideoDescription: {
              CodecSettings: { Codec: "FRAME_CAPTURE" },
            },
            Extension: "webp",
            NameModifier: "original",
          },
        ],
      });
    }

    return {
      Role: opts.roleArn,
      Queue: config.MEDIACONVERT_QUEUE_ARN || undefined,
      UserMetadata: opts.userMetadata,
      Settings: {
        Inputs: [
          {
            FileInput: opts.inputUri,
            AudioSelectors: {
              "Audio Selector 1": {
                DefaultSelection: "DEFAULT",
              },
            },
          },
        ],
        OutputGroups: outputGroups,
      },
    };
  }

  async function dispatch(
    payload: VideoJobEvent,
  ): Promise<VideoDispatchResult | void> {
    const client = getClient();

    if (payload.status === "cancelled") {
      // MediaConvert only knows its own job id. The old code sent
      // payload.jobId (VeoLMS's internal uuid), so every cancellation
      // failed inside the catch below and AWS kept transcoding — and
      // billing — to completion.
      if (payload.providerJobId) {
        try {
          logger.info(
            { jobId: payload.jobId, providerJobId: payload.providerJobId },
            "[video-dispatch:mediaconvert] Submitting cancellation to AWS MediaConvert",
          );
          await client.send(
            new CancelJobCommand({ Id: payload.providerJobId }),
          );
        } catch (err: unknown) {
          logger.warn(
            { err, jobId: payload.jobId, providerJobId: payload.providerJobId },
            "[video-dispatch:mediaconvert] Note on MediaConvert CancelJobCommand (may already be finished)",
          );
        }
      } else {
        logger.warn(
          { jobId: payload.jobId },
          "[video-dispatch:mediaconvert] No provider job id recorded for this job; cannot submit cancellation to AWS (job predates provider-id tracking)",
        );
      }
      return;
    }

    const bucket = config.STORAGE_BUCKET;
    const videoKey = payload.videoKey;
    if (!videoKey) {
      logger.warn(
        { payload },
        "[video-dispatch:mediaconvert] Dispatch called without videoKey; skipping job creation",
      );
      return;
    }

    const outputPrefix =
      payload.outputPrefix ||
      `transcoded/${payload.videoId || payload.jobId || "default"}/`;

    const qualities: readonly VideoQualityLevel[] =
      payload.qualities && payload.qualities.length > 0
        ? payload.qualities
        : (["1080p", "720p", "480p", "360p"] as const);

    const roleArn =
      config.MEDIACONVERT_ROLE_ARN ||
      "arn:aws:iam::123456789012:role/MediaConvertRole";

    if (payload.chapterThumbnails) {
      await dispatchChapterThumbnails(
        client,
        payload,
        payload.chapterThumbnails,
        videoKey,
        roleArn,
      );
      return;
    }

    const userMetadata: Record<string, string> = {
      jobId: payload.jobId || "",
      videoId: payload.videoId || "",
      sourceKey: videoKey,
      outputPrefix,
      videoSize: String(payload.videoSize || 0),
    };

    if (payload.videoMetadata) {
      if (payload.videoMetadata.width)
        userMetadata.width = String(payload.videoMetadata.width);
      if (payload.videoMetadata.height)
        userMetadata.height = String(payload.videoMetadata.height);
      if (payload.videoMetadata.durationSeconds) {
        userMetadata.durationSeconds = String(
          payload.videoMetadata.durationSeconds,
        );
      }
      if (payload.videoMetadata.bitrate)
        userMetadata.bitrate = String(payload.videoMetadata.bitrate);
      if (payload.videoMetadata.codec)
        userMetadata.codec = String(payload.videoMetadata.codec);
      if (payload.videoMetadata.fps)
        userMetadata.fps = String(payload.videoMetadata.fps);
    }

    if (payload.thumbnailDestination) {
      userMetadata.thumbnailDestination = payload.thumbnailDestination;
    }

    if (config.MEDIACONVERT_WEBHOOK_URL) {
      userMetadata.webhookUrl = config.MEDIACONVERT_WEBHOOK_URL;
      if (config.MEDIACONVERT_WEBHOOK_SECRET) {
        userMetadata.webhookSecret = config.MEDIACONVERT_WEBHOOK_SECRET;
      } else {
        logger.warn(
          "[video-dispatch:mediaconvert] MEDIACONVERT_WEBHOOK_URL is set without MEDIACONVERT_WEBHOOK_SECRET; webhook callbacks will be rejected",
        );
      }
    }

    // ── Optional ClearKey DRM metadata ───────────────────────────────────────
    // When both DRM_MASTER_KEY and DRM_MASTER_KEY_VERSION are configured, tag
    // the job so the webhook handler and ClearKey license driver can resolve the
    // right key.  The raw key value is kept server-side only and is never sent
    // to AWS.  The job template itself must configure the StaticKeyProvider.
    if (config.DRM_MASTER_KEY && config.DRM_MASTER_KEY_VERSION) {
      userMetadata.drmKeySystem = "clearkey";
      userMetadata.drmMasterKeyVersion = config.DRM_MASTER_KEY_VERSION;
    }

    const destination = outputPrefix.startsWith("s3://")
      ? outputPrefix
      : `s3://${bucket}/${outputPrefix}`;

    const inputUri = videoKey.startsWith("s3://")
      ? videoKey
      : `s3://${bucket}/${videoKey}`;

    // ── Choose job-template vs inline path ────────────────────────────────────
    const jobTemplate = config.MEDIACONVERT_JOB_TEMPLATE;
    const isDrm = Boolean(
      config.DRM_MASTER_KEY && config.DRM_MASTER_KEY_VERSION,
    );

    let jobInput: CreateJobCommandInput;

    if (jobTemplate) {
      logger.info(
        {
          jobId: payload.jobId,
          videoId: payload.videoId,
          template: jobTemplate,
          drm: isDrm,
          inputUri,
          destination,
        },
        "[video-dispatch:mediaconvert] Submitting transcoding job using AWS JobTemplate",
      );

      jobInput = buildTemplateJobInput({
        templateName: jobTemplate,
        roleArn,
        inputUri,
        destination,
        userMetadata,
      });
    } else {
      logger.info(
        {
          jobId: payload.jobId,
          videoId: payload.videoId,
          inputUri,
          destination,
          qualities,
        },
        "[video-dispatch:mediaconvert] Submitting transcoding job to AWS MediaConvert (inline settings)",
      );

      jobInput = buildInlineJobInput({
        roleArn,
        inputUri,
        destination,
        bucket,
        qualities,
        thumbnailDestination: payload.thumbnailDestination,
        userMetadata,
      });
    }

    const result = await client.send(new CreateJobCommand(jobInput));

    logger.info(
      {
        jobId: payload.jobId,
        mediaConvertJobId: result.Job?.Id,
        status: result.Job?.Status,
        template: jobTemplate ?? "(inline)",
        drm: isDrm,
      },
      "[video-dispatch:mediaconvert] Job successfully submitted to AWS MediaConvert",
    );

    // Hand the provider's job id back so the caller can persist it —
    // cancellation is impossible without it (see the cancelled branch).
    return result.Job?.Id ? { providerJobId: result.Job.Id } : undefined;
  }

  return { dispatch };
}
