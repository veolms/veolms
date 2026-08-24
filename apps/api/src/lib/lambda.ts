import { LambdaClient } from "@aws-sdk/client-lambda";
import { config } from "../config.ts";

let clientInstance: LambdaClient | null = null;

export function getLambdaClient(): LambdaClient {
  if (!clientInstance) {
    clientInstance = new LambdaClient({
      region: config.FLEET_MANAGER_LAMBDA_REGION || config.STORAGE_REGION,
      credentials:
        config.STORAGE_ACCESS_KEY_ID && config.STORAGE_SECRET_ACCESS_KEY
          ? {
              accessKeyId: config.STORAGE_ACCESS_KEY_ID,
              secretAccessKey: config.STORAGE_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return clientInstance;
}
