import {
  MediaConvertClient,
  CreateJobCommand,
  CancelJobCommand,
  type CreateJobCommandInput,
} from "@aws-sdk/client-mediaconvert";
import {
  QUALITY_PROFILES,
  type QualityProfile,
  type VideoJobEvent,
  type VideoQualityLevel,
} from "@veolms/contracts";
import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";
import type { VideoDispatchService } from "./types.ts";

/**
 * Strategy 1: AWS MediaConvert (Inbuilt / Direct SDK)
 * Uses @aws-sdk/client-mediaconvert directly to submit and manage transcoding jobs.
 * Compatible with real AWS MediaConvert or local MediaConvert-compatible fleet endpoints.
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

  async function dispatch(payload: VideoJobEvent): Promise<void> {
    const client = getClient();

    // 1. Cancellation request
    if (payload.status === "cancelled") {
      if (payload.jobId) {
        try {
          logger.info(
            { jobId: payload.jobId },
            "[video-dispatch:mediaconvert] Submitting cancellation to AWS MediaConvert",
          );
          await client.send(new CancelJobCommand({ Id: payload.jobId }));
        } catch (err: unknown) {
          logger.warn(
            { err, jobId: payload.jobId },
            "[video-dispatch:mediaconvert] Note on MediaConvert CancelJobCommand (may already be finished)",
          );
        }
      }
      return;
    }

    // 2. Transcode request
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

    const userMetadata: Record<string, string> = {
      jobId: payload.jobId || "",
      videoId: payload.videoId || "",
      sourceKey: videoKey,
      outputPrefix,
      videoSize: String(payload.videoSize || 0),
    };

    if (payload.videoMetadata) {
      if (payload.videoMetadata.width) userMetadata.width = String(payload.videoMetadata.width);
      if (payload.videoMetadata.height) userMetadata.height = String(payload.videoMetadata.height);
      if (payload.videoMetadata.durationSeconds) {
        userMetadata.durationSeconds = String(payload.videoMetadata.durationSeconds);
      }
      if (payload.videoMetadata.bitrate) userMetadata.bitrate = String(payload.videoMetadata.bitrate);
      if (payload.videoMetadata.codec) userMetadata.codec = String(payload.videoMetadata.codec);
      if (payload.videoMetadata.fps) userMetadata.fps = String(payload.videoMetadata.fps);
    }

    if (config.MEDIACONVERT_WEBHOOK_URL) {
      userMetadata.webhookUrl = config.MEDIACONVERT_WEBHOOK_URL;
    }
    if (config.MEDIACONVERT_WEBHOOK_SECRET) {
      userMetadata.webhookSecret = config.MEDIACONVERT_WEBHOOK_SECRET;
    }

    const destination = outputPrefix.startsWith("s3://")
      ? outputPrefix
      : `s3://${bucket}/${outputPrefix}`;

    const inputUri = videoKey.startsWith("s3://")
      ? videoKey
      : `s3://${bucket}/${videoKey}`;

    const outputs = qualities.map((q) => {
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

    const baseDest = destination.replace(/\/+$/, "");
    const hlsDestination = baseDest;

    const jobInput: CreateJobCommandInput = {
      Role: roleArn,
      Queue: config.MEDIACONVERT_QUEUE_ARN || undefined,
      UserMetadata: userMetadata,
      Settings: {
        Inputs: [
          {
            FileInput: inputUri,
            AudioSelectors: {
              "Audio Selector 1": {
                DefaultSelection: "DEFAULT",
              },
            },
          },
        ],
        OutputGroups: [
          {
            Name: "HLS_Group",
            OutputGroupSettings: {
              Type: "HLS_GROUP_SETTINGS",
              HlsGroupSettings: {
                Destination: hlsDestination,
                SegmentLength: 2,
                MinSegmentLength: 0,
              },
            },
            Outputs: outputs,
          },
        ],
      },
    };

    logger.info(
      {
        jobId: payload.jobId,
        videoId: payload.videoId,
        inputUri,
        destination,
        qualities,
      },
      "[video-dispatch:mediaconvert] Submitting transcoding job to AWS MediaConvert",
    );

    const result = await client.send(new CreateJobCommand(jobInput));

    logger.info(
      {
        jobId: payload.jobId,
        mediaConvertJobId: result.Job?.Id,
        status: result.Job?.Status,
      },
      "[video-dispatch:mediaconvert] Job successfully submitted to AWS MediaConvert",
    );
  }

  return { dispatch };
}
