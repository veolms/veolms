import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  extractProbeEvent,
  processProbeAndForward,
  parseFleetManagerResponse,
} from "../src/probe-lambda.ts";
import { createMockExecutable } from "./helpers.ts";

describe("Video Metadata Probe Lambda", () => {
  it("should extract event payload from direct invocation", () => {
    const raw = {
      action: "queue",
      videoKey: "raw/test-video.mp4",
      qualities: ["1080p", "720p"],
    };
    const extracted = extractProbeEvent(raw);
    assert.equal(extracted.videoKey, "raw/test-video.mp4");
    assert.equal(extracted.action, "queue");
  });

  it("should extract event payload from API Gateway proxy body string", () => {
    const raw = {
      body: JSON.stringify({
        videoKey: "uploads/lesson1.mp4",
        jobId: "c28f615e-42ab-4720-a681-42ab2674e14f",
      }),
    };
    const extracted = extractProbeEvent(raw);
    assert.equal(extracted.videoKey, "uploads/lesson1.mp4");
    assert.equal(extracted.jobId, "c28f615e-42ab-4720-a681-42ab2674e14f");
  });

  it("should extract event from S3 Event Notification", () => {
    const s3Event = {
      Records: [
        {
          s3: {
            bucket: { name: "my-video-bucket" },
            object: { key: "raw/sample+video%20test.mp4" },
          },
        },
      ],
    };
    const extracted = extractProbeEvent(s3Event);
    assert.equal(extracted.videoKey, "raw/sample video test.mp4");
    assert.equal(extracted.bucket, "my-video-bucket");
    assert.equal(extracted.action, "queue");
  });

  it(
    "should probe metadata and forward enriched payload to downstream Fleet Manager Lambda",
    { skip: process.platform === "win32" },
    async () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "probe-lambda-test-"),
      );

      const sampleFfprobeOutput = {
        streams: [
          {
            codec_type: "video",
            codec_name: "h264",
            width: 1280,
            height: 720,
            r_frame_rate: "30/1",
            duration: "60.0",
            bit_rate: "2500000",
          },
        ],
        format: {
          duration: "60.0",
          bit_rate: "2500000",
          format_name: "mp4",
        },
      };

      const mockFfprobePath = createMockExecutable(
        tempDir,
        "mock-ffprobe",
        sampleFfprobeOutput,
      );

      let sentPayload: any = null;
      const mockLambdaClient = {
        send: async (command: any) => {
          if (command.input?.Payload) {
            sentPayload = JSON.parse(
              Buffer.from(command.input.Payload).toString("utf-8"),
            );
          }
          return {
            Payload: Buffer.from(
              JSON.stringify({
                statusCode: 200,
                body: JSON.stringify({ success: true }),
              }),
            ),
          };
        },
      } as any;

      try {
        const result = await processProbeAndForward(
          {
            action: "queue",
            videoKey: "https://my-bucket.s3.amazonaws.com/test.mp4",
            qualities: ["720p", "480p"],
          },
          {
            lambdaClient: mockLambdaClient,
            targetLambdaName: "test-fleet-manager",
            ffprobePath: mockFfprobePath,
          },
        );

        assert.equal(result.success, true);
        assert.equal(result.probed, true);
        assert.equal(result.videoMetadata?.width, 1280);
        assert.equal(result.videoMetadata?.height, 720);
        assert.equal(result.videoMetadata?.durationSeconds, 60.0);

        // Verify the downstream payload received the original fields PLUS videoMetadata
        assert.ok(sentPayload);
        assert.equal(sentPayload.action, "queue");
        assert.equal(
          sentPayload.videoKey,
          "https://my-bucket.s3.amazonaws.com/test.mp4",
        );
        assert.deepEqual(sentPayload.qualities, ["720p", "480p"]);
        assert.ok(sentPayload.videoMetadata);
        assert.equal(sentPayload.videoMetadata.width, 1280);
        assert.equal(sentPayload.videoMetadata.height, 720);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
  );

  it("should forward cancellation request directly to Fleet Manager without probing", async () => {
    let sentPayload: any = null;
    const mockLambdaClient = {
      send: async (command: any) => {
        if (command.input?.Payload) {
          sentPayload = JSON.parse(
            Buffer.from(command.input.Payload).toString("utf-8"),
          );
        }
        return {
          Payload: Buffer.from(
            JSON.stringify({
              statusCode: 200,
              body: JSON.stringify({
                success: true,
                status: "cancelled",
                cancelled: true,
              }),
            }),
          ),
        };
      },
    } as any;

    const result = await processProbeAndForward(
      {
        jobId: "00000000-0000-4000-8000-000000000001",
        status: "cancelled",
      },
      {
        lambdaClient: mockLambdaClient,
        targetLambdaName: "test-fleet-manager",
      },
    );

    assert.equal(result.success, true);
    assert.equal(result.probed, false);
    assert.ok(sentPayload);
    assert.equal(sentPayload.jobId, "00000000-0000-4000-8000-000000000001");
    assert.equal(sentPayload.status, "cancelled");
    assert.equal(sentPayload.deleteFiles, true);
    // Verify proxy response body was parsed
    assert.equal(
      typeof (result.targetLambdaResponse as any)?.body,
      "object",
    );
    assert.equal(
      (result.targetLambdaResponse as any)?.body?.cancelled,
      true,
    );
  });

  it("should propagate failure (success: false) when cancellation response has cancelled: false", async () => {
    const mockLambdaClient = {
      send: async () => ({
        Payload: Buffer.from(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({
              success: true,
              status: "cancelled",
              cancelled: false,
              filesDeleted: false,
            }),
          }),
        ),
      }),
    } as any;

    const result = await processProbeAndForward(
      {
        jobId: "00000000-0000-4000-8000-000000000002",
        status: "cancelled",
      },
      {
        lambdaClient: mockLambdaClient,
        targetLambdaName: "test-fleet-manager",
      },
    );

    assert.equal(result.success, false);
    assert.equal(result.probed, false);
    assert.equal(
      (result.targetLambdaResponse as any)?.body?.cancelled,
      false,
    );
  });

  it("should propagate failure when Fleet Manager returns an error status code", async () => {
    const mockLambdaClient = {
      send: async () => ({
        Payload: Buffer.from(
          JSON.stringify({
            statusCode: 500,
            body: JSON.stringify({
              success: false,
              error: "Database connection failed",
            }),
          }),
        ),
      }),
    } as any;

    const result = await processProbeAndForward(
      {
        jobId: "00000000-0000-4000-8000-000000000003",
        status: "cancelled",
      },
      {
        lambdaClient: mockLambdaClient,
        targetLambdaName: "test-fleet-manager",
      },
    );

    assert.equal(result.success, false);
    assert.equal(
      (result.targetLambdaResponse as any)?.statusCode,
      500,
    );
  });

  it("should propagate failure when Fleet Manager invocation reports FunctionError", async () => {
    const mockLambdaClient = {
      send: async () => ({
        FunctionError: "Unhandled",
        Payload: Buffer.from(
          JSON.stringify({
            errorMessage: "Runtime crash",
          }),
        ),
      }),
    } as any;

    const result = await processProbeAndForward(
      {
        jobId: "00000000-0000-4000-8000-000000000004",
        status: "cancelled",
      },
      {
        lambdaClient: mockLambdaClient,
        targetLambdaName: "test-fleet-manager",
      },
    );

    assert.equal(result.success, false);
  });

  it("should derive success from status and result fields correctly", () => {
    // 1. Successful proxy response
    const successRes = parseFleetManagerResponse({
      Payload: Buffer.from(
        JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({
            status: "completed",
            result: { success: true },
          }),
        }),
      ),
    });
    assert.equal(successRes.success, true);
    assert.deepEqual((successRes.targetResult as any).body, {
      status: "completed",
      result: { success: true },
    });

    // 2. Failed result field
    const failedResult = parseFleetManagerResponse({
      Payload: Buffer.from(
        JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({
            status: "ok",
            result: { success: false, error: "Transcode failed" },
          }),
        }),
      ),
    });
    assert.equal(failedResult.success, false);

    // 3. Failed status field
    const failedStatus = parseFleetManagerResponse({
      Payload: Buffer.from(
        JSON.stringify({
          statusCode: 200,
          body: JSON.stringify({
            status: "failed",
            error: "Resource limit reached",
          }),
        }),
      ),
    });
    assert.equal(failedStatus.success, false);

    // 4. Cancellation with cancelled: false
    const failedCancel = parseFleetManagerResponse(
      {
        Payload: Buffer.from(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({
              status: "cancelled",
              cancelled: false,
            }),
          }),
        ),
      },
      { isCancellation: true },
    );
    assert.equal(failedCancel.success, false);

    // 5. Successful cancellation
    const successCancel = parseFleetManagerResponse(
      {
        Payload: Buffer.from(
          JSON.stringify({
            statusCode: 200,
            body: JSON.stringify({
              status: "cancelled",
              cancelled: true,
            }),
          }),
        ),
      },
      { isCancellation: true },
    );
    assert.equal(successCancel.success, true);
  });
});
