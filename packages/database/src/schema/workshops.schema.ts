import type { Generated, JSONColumnType } from "kysely";

export type WorkshopStatus = "draft" | "published" | "cancelled";
export type WorkshopRegistrationSource = "free" | "order" | "admin" | "course";

/** A link shown with the workshop. */
export interface WorkshopResourceJson {
  title: string;
  url: string;
}

/**
 * A live event with one or more sessions, run on Zoom, Google Meet, YouTube
 * Live or any link the host pastes. Price, course link, cover and
 * resources are columns here rather than tables of their own.
 */
export interface WorkshopTable {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  cover_media_id: string | null;
  cover_url: string | null;
  host_user_id: string;
  status: Generated<WorkshopStatus>;
  /** Null: open to every learner. Set: only that course's learners. */
  course_id: string | null;
  /** Null: free. */
  price_minor: number | null;
  currency: Generated<string>;
  /** Null: unlimited. */
  capacity: number | null;
  resources: JSONColumnType<WorkshopResourceJson[]>;
  cancel_reason: string | null;
  /** Shown to a buyer after paying; `{first_name}` is filled in. */
  welcome_message: string | null;
  welcome_link_label: string | null;
  /** https only. */
  welcome_link_url: string | null;
  created_by: string;
  published_at: Date | null;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface WorkshopSessionTable {
  id: string;
  workshop_id: string;
  position: Generated<number>;
  title: string | null;
  starts_at: Date;
  ends_at: Date;
  time_zone: string;
  /** The meeting link, encrypted at rest; only ever handed out as a redirect. */
  join_url_encrypted: string | null;
  passcode: string | null;
  recording_media_id: string | null;
  recording_ready_at: Date | null;
  /** For a course workshop: the course lesson the recording was published as. */
  recording_lesson_id: Generated<string | null>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkshopRegistrationTable {
  id: string;
  workshop_id: string;
  user_id: string;
  source: WorkshopRegistrationSource;
  order_id: string | null;
  registered_at: Generated<Date>;
  cancelled_at: Date | null;
  /** Said "I'm not going": no more reminders or notices. */
  declined_at: Generated<Date | null>;
  /** The sessions this learner clicked Join on. */
  joined_session_ids: Generated<string[]>;
}
