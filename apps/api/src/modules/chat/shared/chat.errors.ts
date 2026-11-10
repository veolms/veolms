import { AppError } from "../../../lib/errors.ts";

/** The errors chat answers with; codes are stable for the web app. */
export const ChatErrors = {
  disabled: () => new AppError(404, "CHAT_DISABLED", "Chat is turned off."),
  roomNotFound: () =>
    new AppError(404, "CHAT_ROOM_NOT_FOUND", "This chat does not exist."),
  messageNotFound: () =>
    new AppError(404, "CHAT_MESSAGE_NOT_FOUND", "This message does not exist."),
  noAccess: () =>
    new AppError(403, "CHAT_NO_ACCESS", "You are not a member of this chat."),
  joinCourseFirst: () =>
    new AppError(
      403,
      "CHAT_JOIN_COURSE_FIRST",
      "Join this course to send messages in its group.",
    ),
  banned: () =>
    new AppError(
      403,
      "CHAT_BANNED",
      "You were removed from this chat by an admin.",
    ),
  muted: (until: Date | null) =>
    new AppError(
      403,
      "CHAT_MUTED",
      until
        ? `You can't send messages here until ${until.toISOString()}.`
        : "You can't send messages here.",
    ),
  staffOnly: () =>
    new AppError(
      403,
      "CHAT_ADMINS_ONLY",
      "Only admins can send messages in this group.",
    ),
  locked: () =>
    new AppError(403, "CHAT_LOCKED", "Nobody can send messages here now."),
  notModerator: () =>
    new AppError(403, "CHAT_NOT_ADMIN", "Only group admins can do this."),
  notManager: () =>
    new AppError(403, "CHAT_NOT_MANAGER", "Only chat managers can do this."),
  targetOutranks: () =>
    new AppError(
      403,
      "CHAT_TARGET_OUTRANKS",
      "You can't do this to someone at your level or above.",
    ),
  slowMode: (waitSeconds: number) =>
    new AppError(
      429,
      "CHAT_SLOW_MODE",
      `Slow mode is on: wait ${waitSeconds} s before sending again.`,
    ),
  repeated: () =>
    new AppError(
      429,
      "CHAT_REPEATED",
      "You sent the same message several times. Wait a moment.",
    ),
  awaitingAccept: () =>
    new AppError(
      403,
      "CHAT_REQUEST_PENDING",
      "Wait until your message request is accepted.",
    ),
  requestDeclined: () =>
    new AppError(
      403,
      "CHAT_REQUEST_DECLINED",
      "You can't send messages to this person.",
    ),
  staffFirst: () =>
    new AppError(
      403,
      "CHAT_STAFF_FIRST",
      "Your instructor messages you first. Until then, ask in your course group.",
    ),
  iconInvalid: () =>
    new AppError(
      400,
      "CHAT_ICON_INVALID",
      "Use a photo uploaded to this group as its icon.",
    ),
  directNotAllowed: () =>
    new AppError(
      403,
      "CHAT_DIRECT_NOT_ALLOWED",
      "You can't start a private chat with this person.",
    ),
  directLimit: () =>
    new AppError(
      429,
      "CHAT_DIRECT_LIMIT",
      "You have sent the most message requests allowed today.",
    ),
  blocked: () =>
    new AppError(
      403,
      "CHAT_BLOCKED",
      "You can't send messages to this person.",
    ),
  notYourMessage: () =>
    new AppError(403, "CHAT_NOT_YOUR_MESSAGE", "This is not your message."),
  editWindowOver: () =>
    new AppError(
      403,
      "CHAT_EDIT_WINDOW_OVER",
      "Messages can only be edited for 15 minutes.",
    ),
  deleteWindowOver: () =>
    new AppError(
      403,
      "CHAT_DELETE_WINDOW_OVER",
      "It's too late to delete this message for everyone.",
    ),
  alreadyDeleted: () =>
    new AppError(409, "CHAT_MESSAGE_DELETED", "This message was deleted."),
  notRestorable: () =>
    new AppError(
      409,
      "CHAT_NOT_RESTORABLE",
      "This message can no longer be restored.",
    ),
  pinLimit: (max: number) =>
    new AppError(409, "CHAT_PIN_LIMIT", `You can pin up to ${max} items.`),
  helperLimit: (max: number) =>
    new AppError(
      409,
      "CHAT_HELPER_LIMIT",
      `A group can have up to ${max} helpers.`,
    ),
  invalidReaction: () =>
    new AppError(400, "CHAT_INVALID_REACTION", "Reactions must be one emoji."),
  wrongRoomKind: () =>
    new AppError(
      400,
      "CHAT_WRONG_ROOM_KIND",
      "This can't be done in this kind of chat.",
    ),
  cannotLeave: () =>
    new AppError(
      400,
      "CHAT_CANNOT_LEAVE",
      "You can't exit a course group while enrolled. Mute it instead.",
    ),
  userNotFound: () =>
    new AppError(404, "CHAT_USER_NOT_FOUND", "This person was not found."),
  self: () => new AppError(400, "CHAT_SELF", "You can't do this to yourself."),
  restrictionNotFound: () =>
    new AppError(
      404,
      "CHAT_RESTRICTION_NOT_FOUND",
      "This restriction does not exist.",
    ),
  reportNotFound: () =>
    new AppError(404, "CHAT_REPORT_NOT_FOUND", "This report does not exist."),
  courseNotFound: () =>
    new AppError(404, "CHAT_COURSE_NOT_FOUND", "This course does not exist."),
  attachmentsOff: () =>
    new AppError(
      403,
      "CHAT_ATTACHMENTS_OFF",
      "Files can't be sent in this group.",
    ),
  uploadNotReady: () =>
    new AppError(
      400,
      "CHAT_UPLOAD_NOT_READY",
      "A file is missing or still uploading.",
    ),
  uploadNotFound: () =>
    new AppError(404, "CHAT_UPLOAD_NOT_FOUND", "This file does not exist."),
  uploadType: () =>
    new AppError(400, "CHAT_UPLOAD_TYPE", "This kind of file can't be sent."),
  uploadTooBig: (maxBytes: number) =>
    new AppError(
      400,
      "CHAT_UPLOAD_TOO_BIG",
      `Files of this kind can be up to ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    ),
  uploadQuota: () =>
    new AppError(
      429,
      "CHAT_UPLOAD_QUOTA",
      "You have uploaded the most allowed today.",
    ),
  uploadMismatch: () =>
    new AppError(
      400,
      "CHAT_UPLOAD_MISMATCH",
      "The uploaded file does not match what was announced.",
    ),
  streamDisabled: () =>
    new AppError(503, "CHAT_STREAM_DISABLED", "Live chat updates are off."),
  streamLimit: () =>
    new AppError(429, "CHAT_STREAM_LIMIT", "Too many open chat streams."),
  streamBusy: () =>
    new AppError(
      503,
      "CHAT_STREAM_BUSY",
      "This server has too many open chat streams; try again shortly.",
    ),
};
