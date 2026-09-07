import { describe, expect, it } from "vitest";
import {
  getApiError,
  GENERIC_API_ERROR_MESSAGE,
} from "../../src/lib/api-error";

describe("API error messages", () => {
  it("hides route-not-found details from users", () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: {
        status: 404,
        data: {
          success: false,
          error: {
            code: "ROUTE_NOT_FOUND",
            message:
              "Route POST /api/v1/auth/me/email/otp/send does not exist.",
          },
        },
      },
    });

    const parsed = getApiError(error);

    expect(parsed.message).toBe(GENERIC_API_ERROR_MESSAGE);
    expect(parsed.details).toEqual(error.response.data);
  });

  it("hides internal server details from users", () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          error: {
            code: "DATABASE_FAILURE",
            message: "connection string and query details",
          },
        },
      },
    });

    expect(getApiError(error).message).toBe(GENERIC_API_ERROR_MESSAGE);
  });

  it("preserves actionable client errors", () => {
    const error = Object.assign(new Error("Request failed"), {
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Enter a valid email address.",
          },
        },
      },
    });

    expect(getApiError(error).message).toBe("Enter a valid email address.");
  });
});
