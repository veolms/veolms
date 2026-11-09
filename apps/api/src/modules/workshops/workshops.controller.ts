import type {
  AddWorkshopRegistrantRequest,
  WorkshopRegistrantsQuery,
  ImportWorkshopRegistrantsRequest,
  PublishWorkshopRequest,
  CancelWorkshopRequest,
  CreateWorkshopRequest,
  SetWorkshopRecordingRequest,
  UpdateWorkshopRequest,
  WorkshopAdminListQuery,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { DatabaseExecutor } from "@veolms/database";

import type { WorkshopsService } from "./workshops.service.ts";
import { learnerHomeWorkshop } from "./workshop-home.ts";

type WorkshopParams = { Params: { workshopId: string } };

export function createWorkshopsController({
  service,
  database,
}: {
  service: WorkshopsService;
  database: DatabaseExecutor;
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

  async function publish(
    request: FastifyRequest<
      WorkshopParams & { Body: PublishWorkshopRequest | undefined }
    >,
  ) {
    return await service.publish(request.params.workshopId, {
      announce: request.body?.announce ?? false,
    });
  }

  async function unpublish(request: FastifyRequest<WorkshopParams>) {
    return await service.unpublish(request.params.workshopId);
  }

  async function cancel(
    request: FastifyRequest<WorkshopParams & { Body: CancelWorkshopRequest }>,
  ) {
    return await service.cancel(
      request.params.workshopId,
      request.body.reason,
      {
        refundPaid: request.body.refundPaid,
        actorUserId: request.user!.id,
      },
    );
  }

  async function remove(request: FastifyRequest<WorkshopParams>) {
    await service.remove(request.params.workshopId);
    return { deleted: true as const };
  }

  async function listPublic() {
    return await service.listPublic();
  }

  async function getPublic(
    request: FastifyRequest<{ Params: { slug: string } }>,
  ) {
    return await service.getPublic(request.params.slug);
  }

  async function viewer(request: FastifyRequest<{ Params: { slug: string } }>) {
    return await service.viewer(request.params.slug, request.user!.id);
  }

  async function register(
    request: FastifyRequest<WorkshopParams>,
    reply: FastifyReply,
  ) {
    const result = await service.register(
      request.params.workshopId,
      request.user!.id,
    );
    await reply.status(201).send({
      registered: true as const,
      registrationId: result.registrationId,
    });
  }

  async function unregister(request: FastifyRequest<WorkshopParams>) {
    await service.unregister(request.params.workshopId, request.user!.id);
    return { registered: false as const };
  }

  async function calendar(
    request: FastifyRequest<WorkshopParams>,
    reply: FastifyReply,
  ) {
    const file = await service.calendar(
      request.params.workshopId,
      request.user!.id,
    );
    return reply
      .type("text/calendar; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${file.filename}"`)
      .header("Cache-Control", "no-store")
      .send(file.ics);
  }

  async function join(
    request: FastifyRequest<{
      Params: { workshopId: string; sessionId: string };
    }>,
    reply: FastifyReply,
  ) {
    const url = await service.join(
      request.params.workshopId,
      request.params.sessionId,
      request.user!.id,
    );
    return reply.header("Cache-Control", "no-store").redirect(url, 302);
  }

  async function setRecording(
    request: FastifyRequest<{
      Params: { workshopId: string; sessionId: string };
      Body: SetWorkshopRecordingRequest;
    }>,
  ) {
    return await service.setRecording(
      request.params.workshopId,
      request.params.sessionId,
      request.body.mediaId,
      { id: request.user!.id, roles: request.user!.roles },
      { sectionId: request.body.sectionId ?? null },
    );
  }

  async function recordingPlayback(
    request: FastifyRequest<{
      Params: { workshopId: string; sessionId: string };
    }>,
  ) {
    return await service.recordingPlayback(
      request.params.workshopId,
      request.params.sessionId,
      request.user!.id,
    );
  }

  async function recordingPlaybackToken(
    request: FastifyRequest<{
      Params: { workshopId: string; sessionId: string };
    }>,
  ) {
    return await service.recordingPlaybackToken(
      request.params.workshopId,
      request.params.sessionId,
      request.user!.id,
    );
  }

  async function listRegistrants(
    request: FastifyRequest<
      WorkshopParams & { Querystring: WorkshopRegistrantsQuery }
    >,
  ) {
    return await service.listRegistrants(request.params.workshopId, {
      page: request.query.page,
      ...(request.query.search ? { search: request.query.search } : {}),
    });
  }

  async function registrantsCsv(
    request: FastifyRequest<WorkshopParams>,
    reply: FastifyReply,
  ) {
    const file = await service.registrantsCsv(request.params.workshopId);
    return reply
      .type("text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        'attachment; filename="' + file.filename + '"',
      )
      .header("Cache-Control", "no-store")
      .send(file.csv);
  }

  async function addRegistrant(
    request: FastifyRequest<
      WorkshopParams & { Body: AddWorkshopRegistrantRequest }
    >,
    reply: FastifyReply,
  ) {
    const result = await service.addRegistrant(
      request.params.workshopId,
      request.body.email,
    );
    return reply.status(201).send(result);
  }

  async function importRegistrants(
    request: FastifyRequest<
      WorkshopParams & { Body: ImportWorkshopRegistrantsRequest }
    >,
  ) {
    return await service.importRegistrants(
      request.params.workshopId,
      request.body,
      request.user!.id,
    );
  }

  async function listCourseSections(request: FastifyRequest<WorkshopParams>) {
    return {
      items: await service.listCourseSections(request.params.workshopId),
    };
  }

  async function removeRegistrant(
    request: FastifyRequest<{ Params: { workshopId: string; userId: string } }>,
  ) {
    return await service.removeRegistrant(
      request.params.workshopId,
      request.params.userId,
    );
  }

  async function standings(request: FastifyRequest) {
    return await service.standings(request.user!.id);
  }

  async function myNextWorkshop(request: FastifyRequest) {
    return await learnerHomeWorkshop(database, request.user!.id, new Date());
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
    listPublic,
    getPublic,
    viewer,
    register,
    unregister,
    calendar,
    join,
    setRecording,
    recordingPlayback,
    recordingPlaybackToken,
    listRegistrants,
    registrantsCsv,
    addRegistrant,
    removeRegistrant,
    importRegistrants,
    listCourseSections,
    myNextWorkshop,
    standings,
  };
}

export type WorkshopsController = ReturnType<typeof createWorkshopsController>;
