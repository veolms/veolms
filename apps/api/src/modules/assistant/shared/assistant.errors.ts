import { ASSISTANT_ERROR_CODES as CODES } from "@veolms/contracts";

import { AppError } from "../../../lib/errors.ts";

/** The errors the assistant routes answer with; codes are stable. */
export const AssistantErrors = {
  disabled: () =>
    new AppError(404, CODES.disabled, "The assistant is turned off."),
  notAllowed: () =>
    new AppError(403, CODES.notAllowed, "You can't use the assistant."),
  tokenInvalid: () =>
    new AppError(401, CODES.tokenInvalid, "The assistant token is not valid."),
  cardNotFound: () =>
    new AppError(404, CODES.cardNotFound, "This request does not exist."),
  cardFinished: () =>
    new AppError(409, CODES.cardFinished, "This request has already finished."),
  roomNotFound: () =>
    new AppError(
      404,
      CODES.roomNotFound,
      "This assistant chat does not exist.",
    ),
  fileTooLarge: (maxBytes: number) =>
    new AppError(
      413,
      CODES.fileTooLarge,
      `Files can be at most ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
    ),
  fileType: () =>
    new AppError(415, CODES.fileType, "This kind of file can't be sent here."),
};
