export {
  createEmailService,
  type EmailAttachment,
  type EmailDeliveryResult,
  type EmailSendOptions,
  type EmailService,
  type EmailServiceOptions,
  type EmailTransportConfig,
} from "./email.service.ts";
export {
  deactivatedAccountSignInEmail,
  escapeHtml,
  otpVerificationEmail,
  studentAddedEmail,
  teamInvitationEmail,
  teamMemberAddedEmail,
  teamPreapprovedEmail,
  type EmailContent,
  type OtpVerificationInput,
  type StudentAddedInput,
  type TeamInvitationInput,
  type TeamMemberAddedInput,
  type TeamPreapprovedInput,
} from "./email.templates.ts";
