import { LambdaClient } from "@aws-sdk/client-lambda";
import { config } from "../config.ts";

let clientInstance: LambdaClient | null = null;

export function getLambdaClient(): LambdaClient {
  if (!clientInstance) {
    const accessKeyId = config.FLEET_MANAGER_ACCESS_KEY_ID;
    const secretAccessKey = config.FLEET_MANAGER_SECRET_ACCESS_KEY;

    clientInstance = new LambdaClient({
      region: config.FLEET_MANAGER_LAMBDA_REGION || config.STORAGE_REGION,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  return clientInstance;
}
