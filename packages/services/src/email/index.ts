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
  contactChangedEmail,
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
export {
  discussionMentionEmail,
  discussionReplyEmail,
  type DiscussionMentionEmailInput,
  type DiscussionReplyEmailInput,
} from "./discussion-email.templates.ts";
export {
  purchaseConfirmedEmail,
  type PurchaseConfirmedEmailInput,
  type PurchaseEmailItem,
} from "./purchase-email.templates.ts";
export {
  marketingBlockLink,
  marketingEmail,
  type MarketingEmailInput,
} from "./marketing-email.templates.ts";
export {
  paymentAccountChangedEmail,
  type PaymentAccountChangedEmailInput,
} from "./payment-account-email.templates.ts";
