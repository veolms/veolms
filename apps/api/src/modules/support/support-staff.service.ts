import {
  supportCategoryFitsKind,
  supportStatusFitsKind,
  type SupportEvent,
  type SupportPerson,
  type SupportTeamResponse,
  type SupportTicketStaff,
  type UpdateSupportTicketRequest,
} from "@veolms/contracts";
import type { Database, SupportEventType } from "@veolms/database";
import type { Kysely } from "kysely";

import { createOutboxService } from "../../events/outbox.service.ts";
import { httpError } from "../../lib/errors.ts";
import { listPlatformPermissionHolders } from "../authorization/index.ts";
import { displayAvatarUrl } from "../avatars/index.ts";
import * as staffRepository from "./support-staff.repository.ts";
import { iso, markdownToPlainText } from "./support.text.ts";

const notFound = () =>
  httpError(404, "SUPPORT_TICKET_NOT_FOUND", "We couldn't find this.");
const noteNotFound = () =>
  httpError(404, "SUPPORT_NOTE_NOT_FOUND", "This note is no longer here.");

interface PersonRow {
  id: string;
  display_name: string;
  username: string | null;
  avatar_data_url: string | null;
}

function person(row: PersonRow | undefined, id: string | null): SupportPerson {
  return {
    id: row?.id ?? id,
    name: row?.display_name ?? "Former team member",
    username: row?.username ?? null,
    avatarUrl: displayAvatarUrl(row?.avatar_data_url ?? null),
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * What only the support team does: assign, prioritise, recategorise and
 * change the status of a ticket (each logged in its Activity), and edit,
 * pin or delete internal notes. Routes check `support.manage` first.
 */
export function createSupportStaffService({
  database,
}: {
  database: Kysely<Database>;
}) {
  const outbox = createOutboxService();

  async function teamIds(): Promise<string[]> {
    return await listPlatformPermissionHolders(database, "support.manage", 200);
  }

  /** The team's part of a ticket's detail: assignee, priority, Activity. */
  async function staffSection(
    ticket: {
      id: string;
      assignee_id: string | null;
      assigned_at: Date | null;
      priority: SupportTicketStaff["priority"];
    },
    viewerId: string,
  ): Promise<SupportTicketStaff> {
    const [events, canModerateNotes] = await Promise.all([
      staffRepository.listEvents(database, ticket.id),
      staffRepository.isAdmin(database, viewerId),
    ]);
    const mentioned = new Set<string>();
    if (ticket.assignee_id) mentioned.add(ticket.assignee_id);
    for (const event of events) {
      const assigneeId = text(event.data.assigneeId);
      if (assigneeId) mentioned.add(assigneeId);
    }
    const people = new Map(
      (await staffRepository.findPeople(database, [...mentioned])).map(
        (row) => [row.id, row],
      ),
    );
    return {
      assignee: ticket.assignee_id
        ? person(people.get(ticket.assignee_id), ticket.assignee_id)
        : null,
      assignedAt: ticket.assigned_at ? iso(ticket.assigned_at) : null,
      priority: ticket.priority,
      canModerateNotes,
      events: events.map((event): SupportEvent => {
        const assigneeId = text(event.data.assigneeId);
        return {
          id: event.id,
          type: event.type,
          createdAt: iso(event.created_at),
          actor: person(
            event.actor_id
              ? {
                  id: event.actor_id,
                  display_name: event.actor_name ?? "Former team member",
                  username: event.actor_username,
                  avatar_data_url: event.actor_avatar,
                }
              : undefined,
            event.actor_id,
          ),
          from: text(event.data.from),
          to: text(event.data.to),
          assignee: assigneeId
            ? person(people.get(assigneeId), assigneeId)
            : null,
          messageId: text(event.data.messageId),
        };
      }),
    };
  }

  /**
   * Changes what was asked, in one step, and logs each change. Assigning
   * someone else tells them by email and in the app.
   */
  async function updateTicket(
    staffId: string,
    ticketId: string,
    body: UpdateSupportTicketRequest,
  ): Promise<void> {
    if (body.assigneeId && !(await teamIds()).includes(body.assigneeId)) {
      throw httpError(
        400,
        "INVALID_ASSIGNEE",
        "Only members of the support team can be assigned.",
      );
    }
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const ticket = await staffRepository.lockTicket(trx, ticketId);
      if (!ticket) throw notFound();
      if (body.status && !supportStatusFitsKind(ticket.kind, body.status)) {
        throw httpError(
          400,
          "INVALID_STATUS",
          "This status does not apply here.",
        );
      }
      if (
        body.category &&
        !supportCategoryFitsKind(ticket.kind, body.category)
      ) {
        throw httpError(
          400,
          "INVALID_CATEGORY",
          "This category does not apply here.",
        );
      }

      const log = (type: SupportEventType, data: Record<string, unknown>) =>
        staffRepository.insertEvent(trx, {
          ticketId,
          actorId: staffId,
          type,
          data,
          at: now,
        });
      const statusChanged = body.status && body.status !== ticket.status;
      const categoryChanged =
        body.category && body.category !== ticket.category;
      const priorityChanged =
        body.priority !== undefined && body.priority !== ticket.priority;
      const assigneeChanged =
        body.assigneeId !== undefined && body.assigneeId !== ticket.assignee_id;
      if (
        !statusChanged &&
        !categoryChanged &&
        !priorityChanged &&
        !assigneeChanged
      ) {
        return;
      }

      await staffRepository.updateTicketFields(trx, ticketId, {
        ...(statusChanged
          ? {
              status: body.status,
              resolvedAt: body.status === "resolved" ? now : null,
            }
          : {}),
        ...(categoryChanged ? { category: body.category } : {}),
        ...(priorityChanged ? { priority: body.priority ?? null } : {}),
        ...(assigneeChanged
          ? { assignee: { id: body.assigneeId ?? null, by: staffId, at: now } }
          : {}),
      });
      if (assigneeChanged) {
        await log(body.assigneeId ? "assigned" : "unassigned", {
          assigneeId: body.assigneeId ?? ticket.assignee_id,
        });
      }
      if (statusChanged) {
        await log("status_changed", { from: ticket.status, to: body.status });
      }
      if (priorityChanged) {
        await log("priority_changed", {
          from: ticket.priority,
          to: body.priority ?? null,
        });
      }
      if (categoryChanged) {
        await log("category_changed", {
          from: ticket.category,
          to: body.category,
        });
      }
      // Taking it yourself needs no message.
      if (assigneeChanged && body.assigneeId && body.assigneeId !== staffId) {
        const [assigner] = await staffRepository.findPeople(trx, [staffId]);
        await outbox.publish(trx, {
          type: "support.assigned",
          version: 1,
          dedupeKey: `support.assigned:${ticketId}:${body.assigneeId}:${now.getTime()}`,
          occurredAt: now,
          payload: {
            recipientUserId: body.assigneeId,
            ticketId,
            ticketNumber: Number(ticket.number),
            ticketKind: ticket.kind,
            ticketTitle: ticket.title.slice(0, 200),
            assignedByName: assigner?.display_name ?? "A team member",
          },
        });
      }
    });
  }

  /** The support team for the assignee picker, the viewer first. */
  async function listTeam(viewerId: string): Promise<SupportTeamResponse> {
    const rows = await staffRepository.describeTeam(database, await teamIds());
    const members = rows.map((row) => ({
      ...person(row, row.id),
      id: row.id,
      roleLabel: row.role_name
        ? row.role_name.charAt(0).toUpperCase() + row.role_name.slice(1)
        : "Team",
      openReports: Number(row.open_reports),
      openFeedback: Number(row.open_feedback),
    }));
    members.sort(
      (left, right) =>
        Number(right.id === viewerId) - Number(left.id === viewerId),
    );
    return { members };
  }

  /** A note can be changed by whoever wrote it, or an admin. */
  async function assertMayChangeNote(
    staffId: string,
    note: { author_id: string | null },
  ) {
    if (note.author_id === staffId) return;
    if (await staffRepository.isAdmin(database, staffId)) return;
    throw httpError(
      403,
      "FORBIDDEN",
      "Only the note's author or an admin can change it.",
    );
  }

  async function editNote(
    staffId: string,
    ticketId: string,
    messageId: string,
    content: string,
  ): Promise<void> {
    const trimmed = content.trim();
    await database.transaction().execute(async (trx) => {
      const note = await staffRepository.lockNote(trx, ticketId, messageId);
      if (!note) throw noteNotFound();
      await assertMayChangeNote(staffId, note);
      if (note.content === trimmed) return;
      await staffRepository.editNote(trx, messageId, {
        content: trimmed,
        plainText: markdownToPlainText(trimmed),
        editorId: staffId,
        at: new Date(),
      });
    });
  }

  /** Anyone on the team may pin a note for the others. */
  async function pinNote(
    staffId: string,
    ticketId: string,
    messageId: string,
    pinned: boolean,
  ): Promise<void> {
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const note = await staffRepository.lockNote(trx, ticketId, messageId);
      if (!note) throw noteNotFound();
      if (note.pinned === pinned) return;
      await staffRepository.pinNote(trx, messageId, pinned, now);
      await staffRepository.insertEvent(trx, {
        ticketId,
        actorId: staffId,
        type: pinned ? "note_pinned" : "note_unpinned",
        data: { messageId },
        at: now,
      });
    });
  }

  async function deleteNote(
    staffId: string,
    ticketId: string,
    messageId: string,
  ): Promise<void> {
    const now = new Date();
    await database.transaction().execute(async (trx) => {
      const note = await staffRepository.lockNote(trx, ticketId, messageId);
      if (!note) throw noteNotFound();
      await assertMayChangeNote(staffId, note);
      await staffRepository.deleteNote(trx, messageId, staffId, now);
      await staffRepository.insertEvent(trx, {
        ticketId,
        actorId: staffId,
        type: "note_deleted",
        data: { messageId },
        at: now,
      });
    });
  }

  async function assignedToMe(viewerId: string) {
    return await staffRepository.countAssignedTo(database, viewerId);
  }

  return {
    staffSection,
    updateTicket,
    listTeam,
    editNote,
    pinNote,
    deleteNote,
    assignedToMe,
  };
}

export type SupportStaffService = ReturnType<typeof createSupportStaffService>;
