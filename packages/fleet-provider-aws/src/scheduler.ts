import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
  type ActionAfterCompletion,
  type FlexibleTimeWindowMode,
} from "@aws-sdk/client-scheduler";
import { loadAwsProviderConfig } from "./config.ts";

export const DEFAULT_SCHEDULE_NAME = "veolms-fleet-next-check";
export const DEFAULT_SCHEDULER_ROLE_NAME = "VeoLMSSchedulerRole";

export interface AwsSchedulerConfig {
  readonly region?: string;
  readonly schedulerClient?: SchedulerClient;
  readonly lambdaArn?: string;
  readonly schedulerRoleArn?: string;
  readonly scheduleName?: string;
}

export function formatAtExpression(date: Date): string {
  // Format as at(YYYY-MM-DDTHH:mm:ss) in UTC without milliseconds
  const iso = date.toISOString();
  const withoutMs = iso.split(".")[0];
  return `at(${withoutMs})`;
}

export interface AwsSchedulerManager {
  scheduleNextWakeup(
    targetTime: Date,
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<void>;
  cancelWakeup(): Promise<void>;
  getWakeupSchedule(): Promise<{ targetTime: Date } | null>;
}

export function createAwsSchedulerManager(
  config: AwsSchedulerConfig = {},
): AwsSchedulerManager {
  const envConfig = loadAwsProviderConfig(process.env);
  const region = config.region ?? envConfig.AWS_REGION;
  const scheduleName = config.scheduleName ?? DEFAULT_SCHEDULE_NAME;
  const isLocalStack = Boolean(process.env.AWS_ENDPOINT_URL);

  const scheduler =
    config.schedulerClient ??
    new SchedulerClient({
      region,
      ...(isLocalStack ? { endpoint: process.env.AWS_ENDPOINT_URL } : {}),
    });

  const resolveTargetArn = (): string | null => {
    if (config.lambdaArn) return config.lambdaArn;
    if (process.env.LAMBDA_FUNCTION_ARN) return process.env.LAMBDA_FUNCTION_ARN;
    return null;
  };

  const resolveRoleArn = (): string | null => {
    if (config.schedulerRoleArn) return config.schedulerRoleArn;
    if (process.env.SCHEDULER_ROLE_ARN) return process.env.SCHEDULER_ROLE_ARN;
    return null;
  };

  return {
    async scheduleNextWakeup(
      targetTime: Date,
      payload: Readonly<Record<string, unknown>> = {},
    ): Promise<void> {
      if (isLocalStack) {
        console.info(
          `[aws-scheduler] LocalStack detected: scheduled wakeup at ${targetTime.toISOString()} for payload:`,
          JSON.stringify(payload),
        );
        return;
      }

      const targetArn = resolveTargetArn();
      const roleArn = resolveRoleArn();

      if (!targetArn || !roleArn) {
        console.warn(
          "[aws-scheduler] LAMBDA_FUNCTION_ARN or SCHEDULER_ROLE_ARN not set — skipping EventBridge Scheduler creation.",
        );
        return;
      }

      // Ensure target time is at least 3 seconds in the future
      const minTarget = new Date(Date.now() + 3000);
      const effectiveTarget = targetTime > minTarget ? targetTime : minTarget;
      const scheduleExpression = formatAtExpression(effectiveTarget);

      const scheduleInput = {
        Name: scheduleName,
        ScheduleExpression: scheduleExpression,
        FlexibleTimeWindow: {
          Mode: "OFF" as FlexibleTimeWindowMode,
        },
        Target: {
          Arn: targetArn,
          RoleArn: roleArn,
          Input: JSON.stringify({
            action: "tick",
            triggerReason: "DYNAMIC_CHECK",
            scheduledFor: effectiveTarget.toISOString(),
            ...payload,
          }),
          RetryPolicy: {
            MaximumEventAgeInSeconds: 300,
            MaximumRetryAttempts: 2,
          },
        },
        ActionAfterCompletion: "DELETE" as ActionAfterCompletion,
      };

      try {
        await scheduler.send(new CreateScheduleCommand(scheduleInput));
        console.info(
          `[aws-scheduler] Created one-shot EventBridge schedule ${scheduleName} for ${scheduleExpression}`,
        );
      } catch (err: unknown) {
        const errorName = (err as { name?: string })?.name;
        if (
          errorName === "ConflictException" ||
          errorName === "ResourceAlreadyExistsException"
        ) {
          try {
            await scheduler.send(new UpdateScheduleCommand(scheduleInput));
            console.info(
              `[aws-scheduler] Updated EventBridge schedule ${scheduleName} to ${scheduleExpression}`,
            );
          } catch (updateErr) {
            console.error(
              `[aws-scheduler] Failed to update EventBridge schedule ${scheduleName}:`,
              updateErr,
            );
          }
        } else {
          console.error(
            `[aws-scheduler] Failed to create EventBridge schedule ${scheduleName}:`,
            err,
          );
        }
      }
    },

    async cancelWakeup(): Promise<void> {
      if (isLocalStack) {
        console.info(
          `[aws-scheduler] LocalStack: cancelled wakeup schedule ${scheduleName}`,
        );
        return;
      }

      try {
        await scheduler.send(
          new DeleteScheduleCommand({
            Name: scheduleName,
          }),
        );
        console.info(
          `[aws-scheduler] Deleted EventBridge schedule ${scheduleName}`,
        );
      } catch (err: unknown) {
        if (
          err instanceof ResourceNotFoundException ||
          (err as { name?: string })?.name === "ResourceNotFoundException"
        ) {
          // Schedule does not exist, nothing to delete
          return;
        }
        console.error(
          `[aws-scheduler] Error deleting EventBridge schedule ${scheduleName}:`,
          err,
        );
      }
    },

    async getWakeupSchedule(): Promise<{ targetTime: Date } | null> {
      if (isLocalStack) return null;

      try {
        const res = await scheduler.send(
          new GetScheduleCommand({
            Name: scheduleName,
          }),
        );
        if (!res.ScheduleExpression) return null;
        // Parse at(YYYY-MM-DDTHH:mm:ss)
        const match = /at\((.+)\)/.exec(res.ScheduleExpression);
        if (match && match[1]) {
          return { targetTime: new Date(`${match[1]}Z`) };
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}
