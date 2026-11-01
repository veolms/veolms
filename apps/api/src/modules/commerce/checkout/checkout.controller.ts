import type { FastifyRequest } from "fastify";
import type {
  CheckoutPreviewRequest,
  CreateCheckoutOrderRequest,
} from "@veolms/contracts";
import type { CheckoutService } from "./checkout.service.ts";
import { AppError } from "../../../lib/errors.ts";
import type { PlatformSettingsService } from "../../platform/index.ts";

export function createCheckoutController({
  service,
  platformSettings,
}: {
  service: CheckoutService;
  platformSettings: Pick<
    PlatformSettingsService,
    "requiresVerifiedPhoneForEnrollment"
  >;
}) {
  async function previewCheckout(
    request: FastifyRequest<{ Body: CheckoutPreviewRequest }>,
  ) {
    const userId = request.user?.id;
    return await service.previewCheckout(userId, request.body);
  }

  async function createOrder(
    request: FastifyRequest<{ Body: CreateCheckoutOrderRequest }>,
  ) {
    // Paid or free, an enrolment needs a verified mobile number when the
    // academy asks for one (Platform > Security), from accounts opened since
    // it does. The course page asks for the number when this answers that it
    // is needed.
    if (
      !request.user!.mobileVerified &&
      (await platformSettings.requiresVerifiedPhoneForEnrollment(
        request.user!.id,
      ))
    ) {
      throw new AppError(
        403,
        "PHONE_VERIFICATION_REQUIRED",
        "Verify your mobile number to enroll.",
      );
    }
    const user = {
      id: request.user!.id,
      name: request.user!.displayName || request.user!.username,
      email: request.user!.email,
      phone: request.user!.phoneNo,
    };
    return await service.createOrder(user, request.body);
  }

  async function releaseCheckoutOrder(
    request: FastifyRequest<{ Params: { orderId: string } }>,
  ) {
    return await service.releaseCheckoutOrder(
      request.user!.id,
      request.params.orderId,
    );
  }

  return {
    previewCheckout,
    createOrder,
    releaseCheckoutOrder,
  };
}
