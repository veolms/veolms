import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  StreamLectureParams,
  StreamCourseLectureParams,
} from "@veolms/contracts";
import type { StreamService } from "./stream.service.ts";
import { AppError } from "../../../lib/errors.ts";

export function createStreamController({
  service,
}: {
  service: StreamService;
}) {
  async function getLectureStreamUrl(
    request: FastifyRequest<{
      Params: StreamLectureParams;
    }>,
    reply: FastifyReply,
  ) {
    const user = request.user;
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const { lectureId } = request.params;
    const streamData = await service.getLectureStreamUrl(lectureId, user);
    reply.code(200);
    return streamData;
  }

  async function getCourseLectureStreamUrl(
    request: FastifyRequest<{
      Params: StreamCourseLectureParams;
    }>,
    reply: FastifyReply,
  ) {
    const user = request.user;
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const { courseId, lectureId } = request.params;
    const streamData = await service.getLectureStreamUrl(
      lectureId,
      user,
      courseId,
    );
    reply.code(200);
    return streamData;
  }

  return {
    getLectureStreamUrl,
    getCourseLectureStreamUrl,
  };
}

export type StreamController = ReturnType<typeof createStreamController>;
