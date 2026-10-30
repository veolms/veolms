import { AddressBookIcon as AddressBook } from "@phosphor-icons/react/AddressBook";
import { useRef, useState } from "react";
import { studentContactUpdateRequestSchema } from "@veolms/contracts";
import { useUpdateStudentContact } from "../services/students";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border-0 bg-[color-mix(in_srgb,var(--surface-strong)_72%,var(--canvas))] px-3 font-mono text-sm text-(--text) placeholder-(--muted) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] outline-none transition-shadow focus:shadow-[inset_0_0_0_1px_var(--accent),0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)] aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)]";

type ContactField = "email" | "phoneNo";

/**
 * Lets an admin change a learner's email or phone number, or remove the
 * number. The email can be changed but not removed. Mounted only while open.
 */
export function StudentContactModal({
  username,
  studentName,
  email,
  phoneNo,
  onClose,
  setNotice,
}: {
  username: string;
  studentName: string;
  email: string | null;
  phoneNo: string | null;
  onClose: () => void;
  setNotice?: (message: string) => void;
}) {
  const [emailValue, setEmailValue] = useState(email ?? "");
  const [phoneValue, setPhoneValue] = useState(phoneNo ?? "");
  const [errors, setErrors] = useState<
    Partial<Record<ContactField | "form", string>>
  >({});
  const updateContact = useUpdateStudentContact(username);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);

  const save = () => {
    const parsed = studentContactUpdateRequestSchema.safeParse({
      email: emailValue,
      phoneNo: phoneValue.trim() ? phoneValue : null,
    });
    if (!parsed.success) {
      const fieldErrors: Partial<Record<ContactField, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as ContactField;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    updateContact.mutate(parsed.data, {
      onSuccess: () => {
        setNotice?.(`${studentName}'s contact details were saved.`);
        onClose();
      },
      onError: (error) => {
        const field: ContactField | "form" =
          error.code === "EMAIL_TAKEN"
            ? "email"
            : error.code === "PHONE_TAKEN" ||
                error.code === "INVALID_PHONE_NUMBER"
              ? "phoneNo"
              : "form";
        setErrors({
          [field]: error.message || "Could not save. Please try again.",
        });
      },
    });
  };

  const fieldError = (field: ContactField | "form", id: string) =>
    errors[field] ? (
      <p id={id} role="alert" className="m-0 text-xs text-(--danger)">
        {errors[field]}
      </p>
    ) : null;

  return (
    <ConfirmActionModal
      id="student-contact-modal"
      isOpen
      isPending={updateContact.isPending}
      onClose={onClose}
      onConfirm={save}
      icon={AddressBook}
      title="Edit contact details"
      description={`Change ${studentName}'s email or phone number. A changed email or number is saved unverified, and ${studentName} confirms it with a code.`}
      cancelLabel="Cancel"
      confirmLabel="Save"
      pendingLabel="Saving…"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-(--text-secondary)">
          Email
        </span>
        <input
          type="email"
          name="email"
          autoComplete="off"
          required
          value={emailValue}
          onChange={(event) => setEmailValue(event.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={
            errors.email ? "student-contact-email-error" : undefined
          }
          className={FIELD_CLASS}
        />
        {fieldError("email", "student-contact-email-error")}
      </label>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="student-contact-phone"
            className="text-xs font-semibold text-(--text-secondary)"
          >
            Phone number
          </label>
          {phoneValue ? (
            <button
              type="button"
              onClick={() => {
                setPhoneValue("");
                // The button goes with the number; keep focus in the form.
                phoneInputRef.current?.focus();
              }}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-semibold text-(--danger) transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
            >
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={phoneInputRef}
          id="student-contact-phone"
          type="tel"
          name="phoneNo"
          autoComplete="off"
          inputMode="tel"
          placeholder="+91 98765 43210 (empty for none)"
          value={phoneValue}
          onChange={(event) => setPhoneValue(event.target.value)}
          aria-invalid={errors.phoneNo ? true : undefined}
          aria-describedby={
            errors.phoneNo ? "student-contact-phone-error" : undefined
          }
          className={FIELD_CLASS}
        />
        {fieldError("phoneNo", "student-contact-phone-error")}
      </div>

      {fieldError("form", "student-contact-form-error")}
    </ConfirmActionModal>
  );
}
