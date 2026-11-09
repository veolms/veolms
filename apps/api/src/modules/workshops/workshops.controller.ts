import type {
  CancelWorkshopRequest,
  CreateWorkshopRequest,
  UpdateWorkshopRequest,
  WorkshopAdminListQuery,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { WorkshopsService } from "./workshops.service.ts";

type WorkshopParams = { Params: { workshopId: string } };

export function createWorkshopsController({
  service,
}: {
  service: WorkshopsService;
}) {
  async function list(
    request: FastifyRequest<{ Querystring: WorkshopAdminListQuery }>,
  ) {
    return await service.list(request.query);
  }

  async function getOne(request: FastifyRequest<WorkshopParams>) {
    return await service.getAdmin(request.params.workshopId);
  }

  async function create(
    request: FastifyRequest<{ Body: CreateWorkshopRequest }>,
    reply: FastifyReply,
  ) {
    const workshop = await service.create(request.user!.id, request.body);
    await reply.status(201).send(workshop);
  }

  async function update(
    request: FastifyRequest<WorkshopParams & { Body: UpdateWorkshopRequest }>,
  ) {
    return await service.update(request.params.workshopId, request.body);
  }

  async function publishCheck(request: FastifyRequest<WorkshopParams>) {
    return await service.publishCheck(request.params.workshopId);
  }

  async function publish(request: FastifyRequest<WorkshopParams>) {
    return await service.publish(request.params.workshopId);
  }

  async function unpublish(request: FastifyRequest<WorkshopParams>) {
    return await service.unpublish(request.params.workshopId);
  }

  async function cancel(
    request: FastifyRequest<WorkshopParams & { Body: CancelWorkshopRequest }>,
  ) {
    return await service.cancel(request.params.workshopId, request.body.reason);
  }

  async function remove(request: FastifyRequest<WorkshopParams>) {
    await service.remove(request.params.workshopId);
    return { deleted: true as const };
  }

  return {
    list,
    getOne,
    create,
    update,
    publishCheck,
    publish,
    unpublish,
    cancel,
    remove,
  };
}

export type WorkshopsController = ReturnType<typeof createWorkshopsController>;
