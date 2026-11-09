import {
  workshopSessionState,
  type WorkshopAdmin,
  type WorkshopAdminListItem,
  type WorkshopSessionAdmin,
} from "@veolms/contracts";

import { displayAvatarUrl } from "../avatars/index.ts";
import type {
  WorkshopDetailRow,
  WorkshopListRow,
  WorkshopSessionRow,
} from "./workshops.repository.ts";

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function host(row: WorkshopDetailRow): WorkshopAdmin["host"] {
  return {
    userId: row.host_user_id,
    name: row.host_name,
    username: row.host_username,
    avatarUrl: displayAvatarUrl(row.host_avatar),
  };
}

export function presentSession(
  row: WorkshopSessionRow,
  joinUrl: string | null,
  now: Date,
): WorkshopSessionAdmin {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    timeZone: row.time_zone,
    joinUrl,
    passcode: row.passcode,
    recordingMediaId: row.recording_media_id,
    recordingReadyAt: isoOrNull(row.recording_ready_at),
    state: workshopSessionState(row.starts_at, row.ends_at, now),
  };
}

export function presentWorkshopAdmin(
  row: WorkshopDetailRow,
  sessions: WorkshopSessionAdmin[],
): WorkshopAdmin {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    coverUrl: row.cover_url,
    coverMediaId: row.cover_media_id,
    host: host(row),
    status: row.status,
    courseId: row.course_id,
    courseTitle: row.course_title,
    priceMinor: row.price_minor,
    currency: row.currency,
    capacity: row.capacity,
    resources: row.resources ?? [],
    cancelReason: row.cancel_reason,
    sessions,
    registrationCount: Number(row.registration_count),
    publishedAt: isoOrNull(row.published_at),
    cancelledAt: isoOrNull(row.cancelled_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function presentWorkshopListItem(
  row: WorkshopListRow,
): WorkshopAdminListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    coverUrl: row.cover_url,
    host: host(row),
    courseTitle: row.course_title,
    priceMinor: row.price_minor,
    currency: row.currency,
    capacity: row.capacity,
    sessionCount: Number(row.session_count),
    nextSessionAt: isoOrNull(row.next_session_at ?? row.first_session_at),
    lastSessionEndsAt: isoOrNull(row.last_session_ends_at),
    registrationCount: Number(row.registration_count),
    updatedAt: iso(row.updated_at),
  };
}
