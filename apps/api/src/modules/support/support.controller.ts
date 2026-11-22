import type {
  CreateSupportMessageRequest,
  CreateSupportTicketRequest,
  PinSupportNoteRequest,
  SupportAdminListQuery,
  SupportTicketViewQuery,
  UpdateSupportNoteRequest,
  UpdateSupportTicketRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { httpError } from "../../lib/errors.ts";
import { getDiscussionAttachmentDisposition } from "../discussion-uploads/index.ts";
import type { SupportService } from "./support.service.ts";

type TicketParams = {
  Params: { ticketId: string };
  Querystring: SupportTicketViewQuery;
};
type NoteParams = { Params: { ticketId: string; messageId: string } };

function multipartNumber(field: unknown): number | null {
  if (!field || typeof field !== "object") return null;
  const value = Number((field as { value?: unknown }).value);
  return Number.isInteger(value) && value > 0 && value <= 20_000 ? value : null;
}

export function createSupportController({
  service,
}: {
  service: SupportService;
}) {
  async function createTicket(
    request: FastifyRequest<{ Body: CreateSupportTicketRequest }>,
    reply: FastifyReply,
  ) {
    const created = await service.createTicket(request.user!.id, request.body);
    await reply.status(201).send(created);
  }

  async function listMine(request: FastifyRequest) {
    return await service.listMine(request.user!.id);
  }

  async function unreadCount(request: FastifyRequest) {
    return await service.unreadCount(request.user!.id);
  }

  async function getTicket(request: FastifyRequest<TicketParams>) {
    return await service.getTicket(
      request.user!.id,
      request.params.ticketId,
      request.query.as === "staff",
    );
  }

  async function postMessage(
    request: FastifyRequest<
      TicketParams & { Body: CreateSupportMessageRequest }
    >,
    reply: FastifyReply,
  ) {
    const ticket = await service.postMessage(
      request.user!.id,
      request.params.ticketId,
      request.body,
      request.query.as === "staff",
    );
    await reply.status(201).send(ticket);
  }

  async function updateTicket(
    request: FastifyRequest<
      { Params: { ticketId: string } } & { Body: UpdateSupportTicketRequest }
    >,
  ) {
    return await service.updateTicket(
      request.user!.id,
      request.params.ticketId,
      request.body,
    );
  }

  async function editNote(
    request: FastifyRequest<NoteParams & { Body: UpdateSupportNoteRequest }>,
  ) {
    return await service.editNote(
      request.user!.id,
      request.params.ticketId,
      request.params.messageId,
      request.body.content,
    );
  }

  async function pinNote(
    request: FastifyRequest<NoteParams & { Body: PinSupportNoteRequest }>,
  ) {
    return await service.pinNote(
      request.user!.id,
      request.params.ticketId,
      request.params.messageId,
      request.body.pinned,
    );
  }

  async function deleteNote(request: FastifyRequest<NoteParams>) {
    return await service.deleteNote(
      request.user!.id,
      request.params.ticketId,
      request.params.messageId,
    );
  }

  async function listTeam(request: FastifyRequest) {
    return await service.listTeam(request.user!.id);
  }

  async function listForStaff(
    request: FastifyRequest<{ Querystring: SupportAdminListQuery }>,
  ) {
    return await service.listForStaff(request.user!.id, request.query);
  }

  async function statsForStaff(request: FastifyRequest) {
    return await service.statsForStaff(request.user!.id);
  }

  async function uploadAttachment(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const file = await request.file();
    if (!file) throw httpError(400, "FILE_REQUIRED", "No file provided");
    try {
      const attachment = await service.uploadAttachment(request.user!.id, {
        filename: file.filename,
        mimetype: file.mimetype,
        stream: file.file,
        isTruncated: () => file.file.truncated,
        dimensions: () => ({
          width: multipartNumber(file.fields.width),
          height: multipartNumber(file.fields.height),
        }),
      });
      await reply.status(201).send(attachment);
    } catch (error) {
      // Rejected before the stream was read: drain it so the request ends.
      file.file.resume();
      throw error;
    }
  }

  async function openAttachment(
    request: FastifyRequest<{ Params: { attachmentId: string } }>,
    reply: FastifyReply,
  ) {
    const file = await service.openAttachment(
      request.user!.id,
      request.params.attachmentId,
    );
    return (
      reply
        .header("Content-Type", file.mimeType)
        .header("Content-Length", file.size)
        .header(
          "Content-Disposition",
          getDiscussionAttachmentDisposition(file.mimeType, file.fileName),
        )
        .header("X-Content-Type-Options", "nosniff")
        // Never kept by the browser: access is checked on every request.
        .header("Cache-Control", "private, no-store")
        .send(file.stream)
    );
  }

  return {
    createTicket,
    listMine,
    unreadCount,
    getTicket,
    postMessage,
    updateTicket,
    editNote,
    pinNote,
    deleteNote,
    listTeam,
    listForStaff,
    statsForStaff,
    uploadAttachment,
    openAttachment,
  };
}

export type SupportController = ReturnType<typeof createSupportController>;
