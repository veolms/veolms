import { config } from "../config.ts";
import type { FastifyServerOptions } from "fastify";

export const logger: FastifyServerOptions["logger"] =
  config.NODE_ENV === "development" && config.API_DEV_PRETTY_LOGS
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : true;
