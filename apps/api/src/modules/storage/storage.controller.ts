import type {
  ApproveStorageRequest,
  BlockStorageRequest,
  CreateStorageRequest,
  DeclineStorageRequest,
  SetStorageLimitRequest,
  StorageLearnerFilter,
  StorageLearnerSort,
  UpdateStorageSettingsRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { StorageService } from "./storage.service.ts";

type UserParams = { Params: { userId: string } };
type RequestParams = { Params: { requestId: string } };

export function createStorageController({
  service,
}: {
  service: StorageService;
}) {
  return {
    async mine(request: FastifyRequest) {
      return service.mine(request.user!.id, request.user!.roles);
    },

    async requestMore(request: FastifyRequest<{ Body: CreateStorageRequest }>) {
      return service.requestMore(
        request.user!.id,
        request.user!.roles,
        request.body?.note,
      );
    },

    async cancelRequest(request: FastifyRequest) {
      return service.cancelRequest(request.user!.id);
    },

    async listLearners(
      request: FastifyRequest<{
        Querystring: {
          search?: string;
          filter: StorageLearnerFilter;
          sort: StorageLearnerSort;
          order: "asc" | "desc";
          page: number;
          pageSize: number;
        };
      }>,
    ) {
      return service.listLearners(request.query);
    },

    async learnerDetail(request: FastifyRequest<UserParams>) {
      return service.learnerDetail(request.params.userId);
    },

    async setLimit(
      request: FastifyRequest<UserParams & { Body: SetStorageLimitRequest }>,
    ) {
      return service.setLimit(
        request.user!.id,
        request.params.userId,
        request.body.limitBytes,
        request.body.note,
      );
    },

    async block(
      request: FastifyRequest<UserParams & { Body: BlockStorageRequest }>,
    ) {
      return service.setBlocked(
        request.user!.id,
        request.params.userId,
        true,
        request.body?.reason,
      );
    },

    async unblock(request: FastifyRequest<UserParams>) {
      return service.setBlocked(
        request.user!.id,
        request.params.userId,
        false,
        undefined,
      );
    },

    async recount(request: FastifyRequest<UserParams>) {
      return service.recountOne(request.user!.id, request.params.userId);
    },

    async approve(
      request: FastifyRequest<RequestParams & { Body: ApproveStorageRequest }>,
    ) {
      return service.approveRequest(
        request.user!.id,
        request.params.requestId,
        request.body.limitBytes,
        request.body.note,
      );
    },

    async decline(
      request: FastifyRequest<RequestParams & { Body: DeclineStorageRequest }>,
    ) {
      return service.declineRequest(
        request.user!.id,
        request.params.requestId,
        request.body?.note,
      );
    },

    async settings() {
      return service.settings();
    },

    async updateSettings(
      request: FastifyRequest<{ Body: UpdateStorageSettingsRequest }>,
    ) {
      return service.updateSettings(
        request.user!.id,
        request.body.defaultLimitBytes,
      );
    },
  };
}
