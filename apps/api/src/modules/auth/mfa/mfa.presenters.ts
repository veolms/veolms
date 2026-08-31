import {
  passkeyAuthenticationOptionsResponseSchema,
  passkeyRegistrationOptionsResponseSchema,
} from "@veolms/contracts";

export function presentPasskeyRegistrationOptions(options: unknown) {
  return passkeyRegistrationOptionsResponseSchema.parse(options);
}

export function presentPasskeyAuthenticationOptions(options: unknown) {
  return passkeyAuthenticationOptionsResponseSchema.parse(options);
}
