import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useState, type ReactNode } from "react";
import {
  studentCreateRequestSchema,
  type StudentCreateResponse,
} from "@veolms/contracts";
import { Button } from "../components/Button";
import { SlideOverFrame } from "../components/SlideOverPanel";
import { useCreateStudent } from "../services/students";
import { secondaryButtonClassName } from "../team/TeamBits";
import { accessEndFromInput, CourseAccessFields } from "./CourseAccessFields";

const line = "border-(--border)";
const FIELD_CLASS = `h-11 w-full rounded-xl border bg-(--card-surface) px-3.5 text-sm text-(--text) placeholder:text-(--muted) transition-colors focus:border-(--accent) focus:outline-none aria-invalid:border-(--danger) ${line}`;

type Field = "displayName" | "email" | "phoneNo" | "courseIds" | "form";

function SectionLabel({
  children,
  aside,
}: {
  children: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <p className="text-sm font-semibold text-(--text)">{children}</p>
      {aside ? <span className="text-xs text-(--muted)">{aside}</span> : null}
    </div>
  );
}

/**
 * Staff add a student by name and email (and a number, if they have one),
 * optionally with published courses. The account exists at once; the
 * student signs in later with the email and a code, and is sent a welcome
 * email saying so. Mounted only while open.
 */
export function AddStudentPanel({
  canGrantCourses,
  onClose,
  onCreated,
}: {
  canGrantCourses: boolean;
  onClose: () => void;
  onCreated: (student: StudentCreateResponse) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNo, setPhoneNo] = useState("");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [accessEnd, setAccessEnd] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const createStudent = useCreateStudent();

  const save = () => {
    const parsed = studentCreateRequestSchema.safeParse({
      displayName,
      email,
      phoneNo: phoneNo.trim() ? phoneNo : null,
      ...(courseIds.length > 0
        ? { courseIds, validUntil: accessEndFromInput(accessEnd) }
        : {}),
    });
    if (!parsed.success) {
      const fieldErrors: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        const key: Field =
          field === "displayName" || field === "email" || field === "phoneNo"
            ? field
            : field === "courseIds" || field === "validUntil"
              ? "courseIds"
              : "form";
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    createStudent.mutate(parsed.data, {
      onSuccess: onCreated,
      onError: (error) => {
        const field: Field =
          error.code === "EMAIL_TAKEN"
            ? "email"
            : error.code === "PHONE_TAKEN" ||
                error.code === "INVALID_PHONE_NUMBER"
              ? "phoneNo"
              : error.code === "COURSE_NOT_GRANTABLE" ||
                  error.code === "INVALID_VALID_UNTIL"
                ? "courseIds"
                : "form";
        setErrors({
          [field]:
            error.message || "Could not add the student. Please try again.",
        });
      },
    });
  };

  const fieldError = (field: Field) =>
    errors[field] ? (
      <p
        id={`add-student-${field}-error`}
        role="alert"
        className="m-0 mt-1.5 text-xs text-(--danger)"
      >
        {errors[field]}
      </p>
    ) : null;

  const fieldProps = (field: Field) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field]
      ? `add-student-${field}-error`
      : undefined,
    className: FIELD_CLASS,
  });

  const name = displayName.trim();

  return (
    <SlideOverFrame
      label="Add student"
      onClose={onClose}
      className="max-w-[520px]"
    >
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className={`shrink-0 border-b px-6 pt-6 pb-5 ${line}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-(--text)">Add student</h2>
              <p className="mt-1 text-xs text-(--muted)">
                The account is ready at once. No password: they sign in with
                this email and a one-time code.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text)"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <SectionLabel>Student</SectionLabel>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col">
              <span className="mb-1.5 text-xs font-semibold text-(--text-secondary)">
                Name
              </span>
              <input
                type="text"
                name="displayName"
                autoComplete="off"
                autoFocus
                required
                maxLength={100}
                placeholder="Ada Lovelace"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                {...fieldProps("displayName")}
              />
              {fieldError("displayName")}
            </label>

            <label className="flex flex-col">
              <span className="mb-1.5 text-xs font-semibold text-(--text-secondary)">
                Email
              </span>
              <input
                type="email"
                name="email"
                autoComplete="off"
                spellCheck={false}
                required
                placeholder="ada@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                {...fieldProps("email")}
              />
              {fieldError("email")}
            </label>

            <label className="flex flex-col">
              <span className="mb-1.5 text-xs font-semibold text-(--text-secondary)">
                Phone number{" "}
                <span className="font-normal text-(--muted)">(optional)</span>
              </span>
              <input
                type="tel"
                name="phoneNo"
                autoComplete="off"
                inputMode="tel"
                placeholder="+91 98765 43210"
                value={phoneNo}
                onChange={(event) => setPhoneNo(event.target.value)}
                {...fieldProps("phoneNo")}
              />
              {fieldError("phoneNo")}
            </label>
          </div>

          {canGrantCourses ? (
            <div className="mt-7 flex flex-col gap-4">
              <SectionLabel aside="Optional">Course access</SectionLabel>
              <CourseAccessFields
                selectedIds={courseIds}
                onSelectedIdsChange={setCourseIds}
                accessEnd={accessEnd}
                onAccessEndChange={setAccessEnd}
                error={errors.courseIds}
              />
            </div>
          ) : null}

          <div
            className={`mt-7 flex items-start gap-3 rounded-xl border bg-(--card-surface) p-3.5 ${line}`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
              <EnvelopeSimple size={16} weight="bold" />
            </span>
            <p className="m-0 text-xs leading-5 text-(--muted)">
              We email them a welcome with the sign-in link
              {courseIds.length > 0 ? " and the courses you picked" : ""}.
            </p>
          </div>

          {errors.form ? (
            <p role="alert" className="mt-4 text-sm text-(--danger)">
              {errors.form}
            </p>
          ) : null}
        </div>

        <div
          className={`flex shrink-0 items-center justify-between gap-3 border-t px-6 py-4 ${line}`}
        >
          <p className="min-w-0 truncate text-xs text-(--muted)">
            {name ? (
              <>
                <strong className="text-(--text)">{name}</strong>
                {courseIds.length > 0
                  ? ` · ${courseIds.length} course${courseIds.length === 1 ? "" : "s"}`
                  : ""}
              </>
            ) : (
              "Enter a name and email"
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={onClose}
            >
              Cancel
            </button>
            <Button
              type="submit"
              elevation="flat"
              motion="static"
              disabled={createStudent.isPending}
            >
              {createStudent.isPending ? "Adding…" : "Add student"}
            </Button>
          </div>
        </div>
      </form>
    </SlideOverFrame>
  );
}
