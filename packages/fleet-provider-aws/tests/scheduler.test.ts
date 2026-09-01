import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatAtExpression,
  createAwsSchedulerManager,
} from "../src/scheduler.ts";
import type { SchedulerClient } from "@aws-sdk/client-scheduler";

describe("AWS EventBridge Scheduler Manager", () => {
  it("should correctly format at() schedule expressions in UTC without milliseconds", () => {
    const testDate = new Date("2026-08-25T14:30:45.123Z");
    const expr = formatAtExpression(testDate);
    assert.equal(expr, "at(2026-08-25T14:30:45)");
  });

  it("should create a one-shot schedule targeting Lambda ARN", async () => {
    const sentCommands: any[] = [];
    const mockSchedulerClient = {
      send: async (cmd: any) => {
        sentCommands.push(cmd);
        return {};
      },
    } as unknown as SchedulerClient;

    const manager = createAwsSchedulerManager({
      schedulerClient: mockSchedulerClient,
      lambdaArn:
        "arn:aws:lambda:us-east-1:123456789012:function:veolms-fleet-manager",
      schedulerRoleArn: "arn:aws:iam::123456789012:role/VeoLMSSchedulerRole",
      scheduleName: "test-fleet-schedule",
    });

    const targetDate = new Date(Date.now() + 60000);
    await manager.scheduleNextWakeup(targetDate, { workerId: "w-1" });

    assert.equal(sentCommands.length, 1);
    assert.equal(sentCommands[0].constructor.name, "CreateScheduleCommand");
    assert.equal(sentCommands[0].input.Name, "test-fleet-schedule");
    assert.equal(sentCommands[0].input.ActionAfterCompletion, "DELETE");
    assert.equal(sentCommands[0].input.FlexibleTimeWindow.Mode, "OFF");

    const payload = JSON.parse(sentCommands[0].input.Target.Input);
    assert.equal(payload.action, "tick");
    assert.equal(payload.triggerReason, "DYNAMIC_CHECK");
    assert.equal(payload.workerId, "w-1");
  });

  it("should update schedule when it already exists (ConflictException)", async () => {
    const sentCommands: any[] = [];
    let firstCall = true;

    const mockSchedulerClient = {
      send: async (cmd: any) => {
        sentCommands.push(cmd);
        if (firstCall) {
          firstCall = false;
          const err = new Error("Schedule already exists");
          err.name = "ConflictException";
          throw err;
        }
        return {};
      },
    } as unknown as SchedulerClient;

    const manager = createAwsSchedulerManager({
      schedulerClient: mockSchedulerClient,
      lambdaArn:
        "arn:aws:lambda:us-east-1:123456789012:function:veolms-fleet-manager",
      schedulerRoleArn: "arn:aws:iam::123456789012:role/VeoLMSSchedulerRole",
      scheduleName: "test-fleet-schedule",
    });

    const targetDate = new Date(Date.now() + 60000);
    await manager.scheduleNextWakeup(targetDate);

    assert.equal(sentCommands.length, 2);
    assert.equal(sentCommands[0].constructor.name, "CreateScheduleCommand");
    assert.equal(sentCommands[1].constructor.name, "UpdateScheduleCommand");
  });

  it("should delete the schedule when cancelWakeup is called", async () => {
    const sentCommands: any[] = [];
    const mockSchedulerClient = {
      send: async (cmd: any) => {
        sentCommands.push(cmd);
        return {};
      },
    } as unknown as SchedulerClient;

    const manager = createAwsSchedulerManager({
      schedulerClient: mockSchedulerClient,
      scheduleName: "test-fleet-schedule",
    });

    await manager.cancelWakeup();

    assert.equal(sentCommands.length, 1);
    assert.equal(sentCommands[0].constructor.name, "DeleteScheduleCommand");
    assert.equal(sentCommands[0].input.Name, "test-fleet-schedule");
  });
});
