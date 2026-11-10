import type {
  ContactChangeCodeRequest,
  ContactChangeCompletedResponse,
  ContactChangeConfirmRequest,
  ContactChangeNewValueRequest,
  ContactChangeResponse,
  ContactChangeStartRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { ContactChangeService } from "./contact-change.service.ts";

type ChangeParams = { changeId: string };

export function createContactChangeController(service: ContactChangeService) {
  return {
    start(
      request: FastifyRequest<{ Body: ContactChangeStartRequest }>,
    ): Promise<ContactChangeResponse> {
      return service.start(request.user!.id, request.body.channel, {
        ip: request.ip,
      });
    },

    proveCurrent(
      request: FastifyRequest<{
        Params: ChangeParams;
        Body: ContactChangeCodeRequest;
      }>,
    ): Promise<ContactChangeResponse> {
      return service.proveCurrent(
        request.user!.id,
        request.params.changeId,
        request.body.code,
      );
    },

    sendToNew(
      request: FastifyRequest<{
        Params: ChangeParams;
        Body: ContactChangeNewValueRequest;
      }>,
    ): Promise<ContactChangeResponse> {
      return service.sendToNew(
        request.user!.id,
        request.params.changeId,
        request.body.value,
        { ip: request.ip },
      );
    },

    confirmNew(
      request: FastifyRequest<{
        Params: ChangeParams;
        Body: ContactChangeConfirmRequest;
      }>,
    ): Promise<ContactChangeCompletedResponse> {
      return service.confirmNew(
        request.user!.id,
        request.params.changeId,
        request.body.value,
        request.body.code,
        request.session!.id,
      );
    },
  };
}
