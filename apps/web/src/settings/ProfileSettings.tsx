import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, Dispatch, ReactNode, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { AtIcon as At } from "@phosphor-icons/react/At";
import { CameraIcon as Camera } from "@phosphor-icons/react/Camera";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GithubLogoIcon as GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { LinkedinLogoIcon as LinkedinLogo } from "@phosphor-icons/react/LinkedinLogo";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { PhoneIcon as Phone } from "@phosphor-icons/react/Phone";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { UserIcon as User } from "@phosphor-icons/react/User";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import {
  CountryCodeSelect,
  getDefaultCountry,
} from "../auth/CountryCodeSelect";
import "../auth/auth.css";
import { OtpCodeInput } from "../auth/OtpCodeInput";
import {
  DEFAULT_COUNTRY_ID,
  findCountry,
  findCountryByPhoneNumber,
  formatNationalPhoneNumber,
  toInternationalPhoneNumber,
  toNationalNumber,
} from "../auth/identifier";
import type { CountryOption } from "../auth/identifier";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { getDefaultProfileIdentity } from "./profilePreferences";
import type {
  ProfileIdentity,
  ProfilePreferences,
  ProfileRole,
} from "./profilePreferences";
import {
  useCurrentUser,
  useSendEmailVerificationOtp,
  useSendPhoneVerificationOtp,
  useUpdateProfile,
  useVerifyEmail,
  useVerifyPhoneNumber,
} from "../services/auth";
import { useAuthStore, type AuthUser } from "../store/auth.store";
import type { ProfileUpdateRequest } from "@veolms/contracts";
import { CircularCheckbox } from "../components/CircularCheckbox";
import type { ToastMessage } from "../ToastNotification";

type EditableProfile = ProfilePreferences & {
  bio: string;
  emailPublic: boolean;
  mobilePublic: boolean;
  linkedinPublic: boolean;
  githubPublic: boolean;
  websitePublic: boolean;
  websiteUrl: string;
};

type SocialVisibilityField = "linkedin" | "github" | "portfolio";

const SIGN_IN_REQUIRED_MESSAGE = "Sign in to edit your profile.";

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

export interface ProfileSettingsProps {
  role?: ProfileRole;
  isAuthenticated?: boolean;
  onNavigatePage?: (page: string) => void;
  onProfileSaved?: (profile: ProfilePreferences) => void;
  setNotice?: (message: ToastMessage) => void;
}

const toEditableProfile = (profile: ProfileIdentity): EditableProfile => ({
  displayName: profile.displayName,
  avatarDataUrl: profile.avatarDataUrl,
  username: profile.username ?? "",
  bio: profile.bio ?? "",
  mobileNumber: profile.mobileNumber ?? "",
  mobileVerified: profile.mobileVerified ?? false,
  emailPublic: profile.emailPublic ?? false,
  mobilePublic: profile.mobilePublic ?? false,
  linkedinUrl: profile.linkedinUrl ?? "",
  linkedinPublic: profile.linkedinPublic ?? false,
  githubUrl: profile.githubUrl ?? "",
  githubPublic: profile.githubPublic ?? false,
  websitePublic: profile.websitePublic ?? false,
  websiteUrl: profile.websiteUrl ?? "",
});

const profileIdentityFromUser = (
  user: AuthUser | null | undefined,
  role: ProfileRole,
): ProfileIdentity => ({
  displayName: user?.displayName ?? "",
  avatarDataUrl: user?.avatarDataUrl ?? null,
  username: user?.username ?? "",
  bio: user?.bio ?? "",
  email: user?.email ?? "",
  mobileNumber: user?.phoneNo ?? "",
  mobileVerified: user?.mobileVerified ?? false,
  mobilePublic: Boolean(
    user?.mobilePublic && user?.phoneNo && user?.mobileVerified,
  ),
  emailPublic: Boolean(user?.emailPublic && user?.email && user?.emailVerified),
  linkedinUrl: user?.linkedinUrl ?? "",
  linkedinPublic: Boolean(user?.linkedinPublic && user?.linkedinUrl),
  githubUrl: user?.githubUrl ?? "",
  githubPublic: Boolean(user?.githubPublic && user?.githubUrl),
  websitePublic: Boolean(user?.websitePublic && user?.websiteUrl),
  websiteUrl: user?.websiteUrl ?? "",
  roleLabel: role === "creator" ? "Instructor" : "Student",
});

const profilesMatch = (left: EditableProfile, right: EditableProfile) =>
  left.displayName === right.displayName &&
  left.avatarDataUrl === right.avatarDataUrl &&
  (left.username ?? "") === (right.username ?? "") &&
  left.bio === right.bio &&
  (left.mobileNumber ?? "") === (right.mobileNumber ?? "") &&
  Boolean(left.mobileVerified) === Boolean(right.mobileVerified) &&
  Boolean(left.emailPublic) === Boolean(right.emailPublic) &&
  Boolean(left.mobilePublic) === Boolean(right.mobilePublic) &&
  (left.linkedinUrl ?? "") === (right.linkedinUrl ?? "") &&
  Boolean(left.linkedinPublic) === Boolean(right.linkedinPublic) &&
  (left.githubUrl ?? "") === (right.githubUrl ?? "") &&
  Boolean(left.githubPublic) === Boolean(right.githubPublic) &&
  Boolean(left.websitePublic) === Boolean(right.websitePublic) &&
  (left.websiteUrl ?? "") === (right.websiteUrl ?? "");

const externalUrl = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const normalizedMobileNumber = (value: string | null | undefined) =>
  (value ?? "").replace(/[^\d+]/g, "");

interface PublicVisibilityCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

interface LockedProfileControlProps {
  children: ReactNode;
  label: string;
  locked: boolean;
  onBlocked: (label: string) => void;
  className?: string;
}

interface LockedProfileControlContextValue {
  activeControl: string | null;
  setActiveControl: Dispatch<SetStateAction<string | null>>;
}

const LockedProfileControlContext =
  createContext<LockedProfileControlContextValue | null>(null);

function LockedProfileControl({
  children,
  label,
  locked,
  onBlocked,
  className = "",
}: LockedProfileControlProps) {
  const tooltipId = `profile-auth-tooltip-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
  const lockedControlContext = useContext(LockedProfileControlContext);
  const [localTooltipActive, setLocalTooltipActive] = useState(false);
  const isTooltipActive = lockedControlContext
    ? lockedControlContext.activeControl === tooltipId
    : localTooltipActive;

  const activateTooltip = () => {
    if (lockedControlContext) {
      lockedControlContext.setActiveControl(tooltipId);
      return;
    }
    setLocalTooltipActive(true);
  };

  const deactivateTooltip = () => {
    if (lockedControlContext) {
      lockedControlContext.setActiveControl((current) =>
        current === tooltipId ? null : current,
      );
      return;
    }
    setLocalTooltipActive(false);
  };

  useEffect(() => {
    if (!locked) {
      if (lockedControlContext) {
        lockedControlContext.setActiveControl((current) =>
          current === tooltipId ? null : current,
        );
      } else {
        setLocalTooltipActive(false);
      }
    }
  }, [locked, lockedControlContext, tooltipId]);

  if (!locked) return children;

  return (
    <span
      className={`group relative ${className}`}
      data-profile-control-locked
      onClick={() => {
        activateTooltip();
        onBlocked(label);
      }}
      onMouseEnter={activateTooltip}
      onMouseLeave={deactivateTooltip}
      onFocus={activateTooltip}
      onBlur={deactivateTooltip}
    >
      {children}
      <button
        type="button"
        className="settings-profile__auth-lock-button"
        aria-label={`Sign in to edit ${label}`}
        aria-describedby={isTooltipActive ? tooltipId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          activateTooltip();
          onBlocked(label);
        }}
      >
        <WarningCircle
          className={`settings-profile__auth-lock-icon${
            isTooltipActive ? " is-visible" : ""
          }`}
          size={16}
          weight="fill"
          aria-hidden="true"
        />
        {isTooltipActive && (
          <span
            id={tooltipId}
            className="settings-profile__auth-tooltip is-visible"
            role="tooltip"
          >
            <span
              className="settings-profile__auth-tooltip-icon"
              aria-hidden="true"
            >
              <Lock size={14} weight="bold" />
            </span>
            <span className="settings-profile__auth-tooltip-copy">
              <strong>Sign in required</strong>
              <span>{SIGN_IN_REQUIRED_MESSAGE}</span>
            </span>
          </span>
        )}
      </button>
    </span>
  );
}

function PublicVisibilityCheckbox({
  id,
  checked,
  onChange,
  label,
  disabled = false,
}: PublicVisibilityCheckboxProps) {
  return (
    <CircularCheckbox
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      label="Show publicly"
      ariaLabel={label}
      labelPosition="before"
      className="settings-profile__visibility-checkbox"
      indicatorClassName="settings-profile__visibility-checkbox-mark"
      unstyled
      disabled={disabled}
    />
  );
}

export function ProfileSettings({
  role = "student",
  isAuthenticated = true,
  onProfileSaved,
  setNotice,
}: ProfileSettingsProps) {
  const {
    data: userProfile,
    isError: userProfileError,
    isFetched: userProfileFetched,
  } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser =
    userProfileFetched && !userProfileError ? userProfile : storeUser;
  const canEdit = isAuthenticated && Boolean(activeUser);
  const sendPhoneVerificationMutation = useSendPhoneVerificationOtp();
  const verifyPhoneNumberMutation = useVerifyPhoneNumber();
  const sendEmailVerificationMutation = useSendEmailVerificationOtp();
  const verifyEmailMutation = useVerifyEmail();
  const updateProfileMutation = useUpdateProfile();

  const initialIdentity = useMemo(
    () => getDefaultProfileIdentity(role),
    [role],
  );
  const [savedProfile, setSavedProfile] = useState<EditableProfile>(() =>
    toEditableProfile(initialIdentity),
  );
  const [draftProfile, setDraftProfile] = useState<EditableProfile>(() =>
    toEditableProfile(initialIdentity),
  );
  const [nameError, setNameError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [mobileError, setMobileError] = useState("");
  const [socialVisibilityErrors, setSocialVisibilityErrors] = useState<
    Partial<Record<SocialVisibilityField, string>>
  >({});
  const [photoError, setPhotoError] = useState("");
  const [blockedControl, setBlockedControl] = useState("");
  const [activeLockedControl, setActiveLockedControl] = useState<string | null>(
    null,
  );
  const [saveState, setSaveState] = useState<"idle" | "saved">("idle");
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [verificationPhone, setVerificationPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [emailVerificationRequested, setEmailVerificationRequested] =
    useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerifiedLocally, setEmailVerifiedLocally] = useState(false);
  const [mobileCountryId, setMobileCountryId] = useState(DEFAULT_COUNTRY_ID);
  const [mobileVisibilityPromptOpen, setMobileVisibilityPromptOpen] =
    useState(false);
  const verificationModalOpen =
    canEdit && (emailVerificationRequested || verificationRequested);
  const verificationChannel = emailVerificationRequested
    ? "email"
    : verificationRequested
      ? "mobile"
      : null;
  const verificationError =
    verificationChannel === "email" ? emailError : mobileError;

  const closeVerificationDialog = () => {
    setEmailVerificationRequested(false);
    setEmailVerificationCode("");
    setVerificationRequested(false);
    setVerificationPhone("");
    setVerificationCode("");
    setEmailError("");
    setMobileError("");
  };

  useBackDismiss({
    open: mobileVisibilityPromptOpen,
    onDismiss: () => setMobileVisibilityPromptOpen(false),
  });
  const dismissVerificationThen = useBackDismiss({
    open: verificationModalOpen,
    onDismiss: closeVerificationDialog,
  });
  const dismissVerificationModal = useCallback(() => {
    dismissVerificationThen(() => {});
  }, [dismissVerificationThen]);
  const [mobileVisibilityAcknowledged, setMobileVisibilityAcknowledged] =
    useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileVisibilityDialogRef = useRef<HTMLDialogElement>(null);
  const verificationDialogRef = useRef<HTMLDivElement>(null);
  const verificationCloseButtonRef = useRef<HTMLButtonElement>(null);
  const verificationCancelButtonRef = useRef<HTMLButtonElement>(null);
  const verificationSubmitButtonRef = useRef<HTMLButtonElement>(null);

  const isDirty = !profilesMatch(draftProfile, savedProfile);
  const displayName = draftProfile.displayName.trim() || "Your name";
  const username = draftProfile.username?.trim() || "username";
  const showAvatar = Boolean(draftProfile.avatarDataUrl) && !avatarFailed;
  const activeEmail = activeUser?.email || "";
  const isEmailVerified =
    Boolean(activeUser?.emailVerified) || emailVerifiedLocally;
  const isMobileVerified = Boolean(draftProfile.mobileVerified);
  const mobileCountry: CountryOption =
    findCountry(mobileCountryId) ?? getDefaultCountry();

  useEffect(() => {
    const editableProfile = toEditableProfile(
      activeUser
        ? profileIdentityFromUser(activeUser, role)
        : getDefaultProfileIdentity(role),
    );
    setSavedProfile(editableProfile);
    setDraftProfile(editableProfile);
    setNameError("");
    setUsernameError("");
    setEmailError("");
    setMobileError("");
    setSocialVisibilityErrors({});
    setPhotoError("");
    setBlockedControl("");
    setActiveLockedControl(null);
    setSaveState("idle");
    setVerificationRequested(false);
    setVerificationPhone("");
    setVerificationCode("");
    setEmailVerificationRequested(false);
    setEmailVerificationCode("");
    setEmailVerifiedLocally(false);
    setMobileCountryId(
      findCountryByPhoneNumber(editableProfile.mobileNumber ?? "")?.id ??
        DEFAULT_COUNTRY_ID,
    );
    setMobileVisibilityPromptOpen(false);
    setMobileVisibilityAcknowledged(false);
  }, [role, activeUser]);

  useEffect(() => {
    if (isAuthenticated) return;
    setEmailVerificationRequested(false);
    setEmailVerificationCode("");
    setVerificationRequested(false);
    setVerificationPhone("");
    setVerificationCode("");
    setMobileVisibilityPromptOpen(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (canEdit) {
      setBlockedControl("");
      setActiveLockedControl(null);
    }
  }, [canEdit]);

  useEffect(() => setAvatarFailed(false), [draftProfile.avatarDataUrl]);

  useEffect(() => {
    const dialog = mobileVisibilityDialogRef.current;
    if (!dialog) return;
    if (mobileVisibilityPromptOpen && !dialog.open) dialog.showModal();
    if (!mobileVisibilityPromptOpen && dialog.open) dialog.close();
  }, [mobileVisibilityPromptOpen]);

  useEffect(() => {
    if (!verificationModalOpen) return undefined;

    const previousActiveElement =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissVerificationModal();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = verificationDialogRef.current;
      if (!dialog) return;
      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled])",
        ),
      );
      if (!focusableElements.length) return;

      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      verificationDialogRef.current
        ?.querySelector<HTMLInputElement>(".auth-otp__digit")
        ?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      previousActiveElement?.focus();
    };
  }, [dismissVerificationModal, verificationModalOpen]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  const updateText = (field: keyof EditableProfile, value: string) => {
    setSaveState("idle");
    if (
      field === "linkedinUrl" ||
      field === "githubUrl" ||
      field === "websiteUrl"
    ) {
      const socialField =
        field === "linkedinUrl"
          ? "linkedin"
          : field === "githubUrl"
            ? "github"
            : "portfolio";
      setSocialVisibilityErrors((current) => {
        if (!current[socialField]) return current;
        const next = { ...current };
        delete next[socialField];
        return next;
      });
    }
    setDraftProfile((current) => {
      const nextProfile = { ...current, [field]: value };
      if (field === "linkedinUrl" && !value.trim()) {
        nextProfile.linkedinPublic = false;
      }
      if (field === "githubUrl" && !value.trim()) {
        nextProfile.githubPublic = false;
      }
      if (field === "websiteUrl" && !value.trim()) {
        nextProfile.websitePublic = false;
      }
      return nextProfile;
    });
  };

  const updateDisplayName = (value: string) => {
    updateText("displayName", value);
    if (value.trim()) setNameError("");
  };

  const updateUsername = (value: string) => {
    updateText("username", value.replace(/^@/, ""));
    setUsernameError("");
  };

  const updateMobileNumber = (value: string) => {
    setDraftProfile((current) => ({
      ...current,
      mobileNumber: value,
      mobileVerified:
        current.mobileNumber === value ? current.mobileVerified : false,
      mobilePublic:
        current.mobileNumber === value ? current.mobilePublic : false,
    }));
    setSaveState("idle");
    setVerificationRequested(false);
    setVerificationPhone("");
    setVerificationCode("");
    setMobileError("");
  };

  const updateMobileCountry = (nextCountry: CountryOption) => {
    const nationalNumber = toNationalNumber(
      draftProfile.mobileNumber ?? "",
      mobileCountry,
    );
    setMobileCountryId(nextCountry.id);
    updateMobileNumber(
      nationalNumber
        ? toInternationalPhoneNumber(nationalNumber, nextCountry)
        : "",
    );
  };

  const updateVisibility = (
    field:
      | "emailPublic"
      | "mobilePublic"
      | "linkedinPublic"
      | "githubPublic"
      | "websitePublic",
    value: boolean,
  ) => {
    setSaveState("idle");
    setDraftProfile((current) => ({ ...current, [field]: value }));
  };

  const requestEmailVisibilityChange = (value: boolean) => {
    if (!value) {
      updateVisibility("emailPublic", false);
      return;
    }
    if (!isEmailVerified) {
      setEmailError("Verify your email address before showing it publicly.");
      return;
    }
    setEmailError("");
    updateVisibility("emailPublic", true);
  };

  const requestSocialVisibilityChange = (
    field: "linkedinPublic" | "githubPublic" | "websitePublic",
    url: string,
    label: string,
    socialField: SocialVisibilityField,
    value: boolean,
  ) => {
    if (!value) {
      updateVisibility(field, false);
      return;
    }
    if (!url.trim()) {
      setSocialVisibilityErrors((current) => ({
        ...current,
        [socialField]: `Add your ${label} link before showing it publicly.`,
      }));
      return;
    }
    setSocialVisibilityErrors((current) => {
      if (!current[socialField]) return current;
      const next = { ...current };
      delete next[socialField];
      return next;
    });
    updateVisibility(field, true);
  };

  const showBlockedControlFeedback = (label: string) => {
    setBlockedControl(label);
  };

  const handleSave = async () => {
    if (!canEdit || !isOnline || updateProfileMutation.isPending) return;

    const normalizedName = draftProfile.displayName.trim();
    const normalizedUsername = draftProfile.username?.trim() ?? "";
    if (!normalizedName) {
      setNameError("Enter the name you want to use in this academy.");
      return;
    }
    if (!normalizedUsername) {
      setUsernameError("Username is required.");
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(normalizedUsername)) {
      setUsernameError(
        "Use letters, numbers, dots, underscores, or hyphens only.",
      );
      return;
    }
    const savedMobileNumber = savedProfile.mobileNumber?.trim() ?? "";
    if (
      normalizedMobileNumber(draftProfile.mobileNumber) !==
        normalizedMobileNumber(savedMobileNumber) &&
      !draftProfile.mobileVerified
    ) {
      setMobileError(
        "Verify your new mobile number before saving your profile.",
      );
      return;
    }

    const payload: ProfileUpdateRequest = {
      displayName: normalizedName,
      username: normalizedUsername,
      avatarDataUrl: draftProfile.avatarDataUrl,
      bio: draftProfile.bio.trim() || null,
      emailPublic: draftProfile.emailPublic,
      mobilePublic: draftProfile.mobilePublic,
      linkedinUrl: draftProfile.linkedinUrl?.trim() || null,
      linkedinPublic: draftProfile.linkedinPublic,
      githubUrl: draftProfile.githubUrl?.trim() || null,
      githubPublic: draftProfile.githubPublic,
      websiteUrl: draftProfile.websiteUrl.trim() || null,
      websitePublic: draftProfile.websitePublic,
    };

    setSaveState("idle");
    try {
      const updatedUser = await updateProfileMutation.mutateAsync(payload);
      const nextProfile = toEditableProfile(
        profileIdentityFromUser(updatedUser, role),
      );
      setSavedProfile(nextProfile);
      setDraftProfile(nextProfile);
      setMobileCountryId(
        findCountryByPhoneNumber(nextProfile.mobileNumber ?? "")?.id ??
          DEFAULT_COUNTRY_ID,
      );
      setSaveState("saved");
      onProfileSaved?.(nextProfile);
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "We couldn't save your profile. Please try again.";
      setNotice?.(message);
    }
  };

  const handleDiscard = () => {
    setDraftProfile(savedProfile);
    setNameError("");
    setUsernameError("");
    setEmailError("");
    setSaveState("idle");
    setSocialVisibilityErrors({});
    setEmailVerificationRequested(false);
    setEmailVerificationCode("");
    setVerificationRequested(false);
    setVerificationPhone("");
    setVerificationCode("");
    setMobileCountryId(
      findCountryByPhoneNumber(savedProfile.mobileNumber ?? "")?.id ??
        DEFAULT_COUNTRY_ID,
    );
  };

  const closeMobileVisibilityPrompt = () => {
    if (mobileVisibilityDialogRef.current?.open) {
      mobileVisibilityDialogRef.current.close();
    }
    setMobileVisibilityPromptOpen(false);
    setMobileVisibilityAcknowledged(false);
  };

  const requestMobileVisibilityChange = (value: boolean) => {
    if (!value) {
      updateVisibility("mobilePublic", false);
      return;
    }
    if (!draftProfile.mobileVerified) {
      setMobileError("Verify your mobile number before showing it publicly.");
      return;
    }
    setMobileError("");
    setMobileVisibilityAcknowledged(false);
    setMobileVisibilityPromptOpen(true);
  };

  const confirmMobileVisibility = () => {
    if (!mobileVisibilityAcknowledged) return;
    updateVisibility("mobilePublic", true);
    closeMobileVisibilityPrompt();
  };

  const requestMobileVerification = async () => {
    const phoneNo = draftProfile.mobileNumber?.trim() ?? "";
    if (!canEdit) {
      setMobileError("Sign in before verifying a mobile number.");
      return;
    }
    if (!phoneNo) {
      setMobileError("Enter a mobile number first.");
      return;
    }

    setMobileError("");
    try {
      await sendPhoneVerificationMutation.mutateAsync({ phoneNo });
      setEmailVerificationRequested(false);
      setEmailVerificationCode("");
      setVerificationPhone(phoneNo);
      setVerificationCode("");
      setVerificationRequested(true);
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "We couldn't send the verification code. Please try again.";
      setMobileError(message);
    }
  };

  const requestEmailVerification = async () => {
    if (!canEdit) {
      setEmailError("Sign in before verifying your email address.");
      return;
    }
    if (!activeEmail) {
      setEmailError("Add an email address before verifying it.");
      return;
    }

    setEmailError("");
    try {
      await sendEmailVerificationMutation.mutateAsync({});
      setVerificationRequested(false);
      setVerificationPhone("");
      setVerificationCode("");
      setEmailVerificationCode("");
      setEmailVerificationRequested(true);
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "We couldn't send the verification code. Please try again.";
      setEmailError(message);
    }
  };

  const verifyMobileNumber = async () => {
    const phoneNo = verificationPhone.trim();
    const code = verificationCode.trim();
    if (!phoneNo) {
      setMobileError("Enter a mobile number first.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setMobileError("Enter the 6-digit code sent to your mobile number.");
      return;
    }

    setMobileError("");
    try {
      await verifyPhoneNumberMutation.mutateAsync({ phoneNo, code });
      setSavedProfile((current) => ({
        ...current,
        mobileNumber: phoneNo,
        mobileVerified: true,
        mobilePublic: false,
      }));
      setDraftProfile((current) => ({
        ...current,
        mobileNumber: phoneNo,
        mobileVerified: true,
        mobilePublic: false,
      }));
      setMobileCountryId(
        findCountryByPhoneNumber(phoneNo)?.id ?? mobileCountryId,
      );
      setVerificationRequested(false);
      setVerificationPhone("");
      setVerificationCode("");
      setSaveState("saved");
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "We couldn't verify that code. Please try again.";
      setMobileError(message);
    }
  };

  const verifyEmailAddress = async () => {
    const code = emailVerificationCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setEmailError("Enter the 6-digit code sent to your email address.");
      return;
    }

    setEmailError("");
    try {
      await verifyEmailMutation.mutateAsync({ code });
      setEmailVerifiedLocally(true);
      setEmailVerificationRequested(false);
      setEmailVerificationCode("");
      setSaveState("saved");
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "We couldn't verify that code. Please try again.";
      setEmailError(message);
    }
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file and try again.");
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setPhotoError("Choose a profile photo that is 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        setPhotoError(
          "We couldn't read that photo. Choose another image and try again.",
        );
        return;
      }
      setDraftProfile((current) => ({
        ...current,
        avatarDataUrl: reader.result as string,
      }));
      setPhotoError("");
    });
    reader.addEventListener("error", () =>
      setPhotoError(
        "We couldn't read that photo. Choose another image and try again.",
      ),
    );
    reader.readAsDataURL(file);
  };

  const avatar = (className: string) => (
    <span className={className} aria-hidden="true">
      {showAvatar ? (
        <img
          src={draftProfile.avatarDataUrl ?? undefined}
          alt=""
          width={160}
          height={160}
          onError={() => setAvatarFailed(true)}
        />
      ) : (
        <User
          className="settings-profile__avatar-fallback"
          size={72}
          weight="duotone"
        />
      )}
    </span>
  );

  const publicSocialLinks = (
    <div className="settings-profile__public-links">
      {draftProfile.linkedinPublic && draftProfile.linkedinUrl && (
        <a
          href={externalUrl(draftProfile.linkedinUrl)}
          target="_blank"
          rel="noreferrer"
        >
          <LinkedinLogo size={16} weight="fill" /> LinkedIn
        </a>
      )}
      {draftProfile.githubPublic && draftProfile.githubUrl && (
        <a
          href={externalUrl(draftProfile.githubUrl)}
          target="_blank"
          rel="noreferrer"
        >
          <GithubLogo size={16} weight="fill" /> GitHub
        </a>
      )}
      {draftProfile.emailPublic && isEmailVerified && activeEmail && (
        <a href={`mailto:${activeEmail}`}>
          <EnvelopeSimple size={16} /> {activeEmail}
        </a>
      )}
      {draftProfile.mobilePublic &&
        draftProfile.mobileVerified &&
        draftProfile.mobileNumber && (
          <a href={`tel:${draftProfile.mobileNumber.replace(/\s/g, "")}`}>
            <Phone size={16} /> {draftProfile.mobileNumber}
          </a>
        )}
      {draftProfile.websitePublic && draftProfile.websiteUrl && (
        <a
          href={externalUrl(draftProfile.websiteUrl)}
          target="_blank"
          rel="noreferrer"
        >
          <Globe size={16} /> Portfolio
        </a>
      )}
    </div>
  );

  return (
    <LockedProfileControlContext.Provider
      value={{
        activeControl: activeLockedControl,
        setActiveControl: setActiveLockedControl,
      }}
    >
      <section
        className="settings-profile"
        aria-labelledby="profile-settings-title"
      >
        <div className="settings-profile__layout">
          <div className="settings-profile__preview-column">
            <section
              className="settings-profile__identity"
              aria-labelledby="profile-photo-title"
            >
              <header className="settings-profile__identity-heading">
                <div>
                  <div className="settings-profile__title-line">
                    <h2 id="profile-photo-title">Your public profile</h2>
                    <span className="settings-profile__public-ready">
                      <CheckCircle size={14} weight="fill" /> Public-ready
                    </span>
                  </div>
                  <p>This is how others will see your profile.</p>
                </div>
              </header>

              <div className="settings-profile__public-card">
                <div
                  className="settings-profile__public-art"
                  aria-hidden="true"
                />
                <div className="settings-profile__public-content">
                  <div className="settings-profile__photo">
                    {avatar(
                      "settings-profile__avatar settings-profile__avatar--large",
                    )}
                    <LockedProfileControl
                      label="profile photo"
                      locked={!canEdit}
                      onBlocked={showBlockedControlFeedback}
                      className="settings-profile__camera-lock"
                    >
                      <button
                        type="button"
                        className="settings-profile__camera"
                        aria-label="Choose a new profile photo"
                        onClick={() => {
                          if (canEdit) fileInputRef.current?.click();
                        }}
                        disabled={!canEdit}
                      >
                        <Camera size={17} weight="fill" />
                      </button>
                    </LockedProfileControl>
                  </div>
                  <input
                    ref={fileInputRef}
                    className="settings-profile__file-input"
                    type="file"
                    accept="image/*"
                    aria-label="Profile photo file"
                    tabIndex={-1}
                    onChange={handlePhotoChange}
                    disabled={!canEdit}
                  />
                  <h3>
                    {displayName}{" "}
                    <SealCheck
                      size={21}
                      weight="fill"
                      aria-label="Verified profile"
                    />
                  </h3>
                  <p className="settings-profile__username">@{username}</p>
                  <p className="settings-profile__bio">
                    {draftProfile.bio ||
                      "Add a short bio so people know what you are learning."}
                  </p>
                  {publicSocialLinks}
                </div>
              </div>
              {photoError && (
                <p className="settings-profile__error" role="alert">
                  {photoError}
                </p>
              )}
            </section>
          </div>

          <div className="settings-profile__form">
            {!canEdit && blockedControl && (
              <p
                className="mx-0 mt-4 flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_28%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-xs font-semibold text-(--danger)"
                role="alert"
              >
                <WarningCircle size={16} weight="fill" aria-hidden="true" />
                <span>
                  Sign in to edit your {blockedControl.toLowerCase()}.
                </span>
              </p>
            )}
            <section className="settings-profile__form-section">
              <div className="settings-profile__section-heading">
                <div>
                  <h2>Personal details</h2>
                  <p>Edit your basic identity and contact information.</p>
                </div>
              </div>
              <div className="settings-profile__field-grid">
                <div className="settings-profile__field">
                  <label htmlFor="profile-display-name">Display name</label>
                  <LockedProfileControl
                    label="display name"
                    locked={!canEdit}
                    onBlocked={showBlockedControlFeedback}
                    className="block w-full"
                  >
                    <input
                      id="profile-display-name"
                      name="displayName"
                      value={draftProfile.displayName}
                      autoComplete="name"
                      aria-invalid={Boolean(nameError)}
                      disabled={!canEdit}
                      onChange={(event) =>
                        updateDisplayName(event.target.value)
                      }
                    />
                  </LockedProfileControl>
                  {nameError && (
                    <small className="settings-profile__error" role="alert">
                      {nameError}
                    </small>
                  )}
                </div>
                <div className="settings-profile__field">
                  <label htmlFor="profile-username">Username</label>
                  <LockedProfileControl
                    label="username"
                    locked={!canEdit}
                    onBlocked={showBlockedControlFeedback}
                    className="block w-full"
                  >
                    <span className="settings-profile__input-shell">
                      <At size={17} aria-hidden="true" />
                      <input
                        id="profile-username"
                        name="username"
                        value={draftProfile.username ?? ""}
                        autoComplete="username"
                        disabled={!canEdit}
                        onChange={(event) => updateUsername(event.target.value)}
                      />
                    </span>
                  </LockedProfileControl>
                  {usernameError && (
                    <small className="settings-profile__error" role="alert">
                      {usernameError}
                    </small>
                  )}
                </div>
              </div>
              <div className="settings-profile__field settings-profile__field--bio">
                <label htmlFor="profile-bio">Bio</label>
                <LockedProfileControl
                  label="bio"
                  locked={!canEdit}
                  onBlocked={showBlockedControlFeedback}
                  className="block w-full"
                >
                  <textarea
                    id="profile-bio"
                    name="bio"
                    className="[touch-action:pan-y_pinch-zoom] focus:touch-auto"
                    value={draftProfile.bio}
                    maxLength={160}
                    rows={3}
                    disabled={!canEdit}
                    onChange={(event) => updateText("bio", event.target.value)}
                  />
                </LockedProfileControl>
                <small className="settings-profile__character-count">
                  {draftProfile.bio.length} / 160
                </small>
              </div>
              <div className="settings-profile__field-grid settings-profile__field-grid--contact">
                <div className="settings-profile__field">
                  <div className="settings-profile__field-heading">
                    <label htmlFor="profile-email">Email address</label>
                    <LockedProfileControl
                      label="email visibility"
                      locked={!canEdit}
                      onBlocked={showBlockedControlFeedback}
                      className="inline-block"
                    >
                      <PublicVisibilityCheckbox
                        id="profile-email-public"
                        checked={draftProfile.emailPublic}
                        onChange={requestEmailVisibilityChange}
                        label="Show email address on your public profile"
                        disabled={!canEdit}
                      />
                    </LockedProfileControl>
                  </div>
                  <LockedProfileControl
                    label="email address"
                    locked={!canEdit}
                    onBlocked={showBlockedControlFeedback}
                    className="block w-full"
                  >
                    <span className="settings-profile__input-shell settings-profile__input-shell--status">
                      <EnvelopeSimple size={17} aria-hidden="true" />
                      <input
                        id="profile-email"
                        value={activeEmail}
                        autoComplete="email"
                        readOnly
                        aria-readonly="true"
                        disabled={!canEdit}
                      />
                      {isEmailVerified ? (
                        <span className="settings-profile__tag settings-profile__tag--success">
                          <SealCheck size={14} weight="fill" /> Verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="settings-profile__inline-verify-action"
                          onClick={() => void requestEmailVerification()}
                          disabled={
                            !activeUser ||
                            !canEdit ||
                            !activeEmail ||
                            sendEmailVerificationMutation.isPending ||
                            verifyEmailMutation.isPending
                          }
                          aria-expanded={emailVerificationRequested}
                          aria-controls="profile-verification-dialog"
                        >
                          {sendEmailVerificationMutation.isPending
                            ? "Sending..."
                            : "Verify now"}
                        </button>
                      )}
                    </span>
                  </LockedProfileControl>
                  {emailError && (
                    <small className="settings-profile__error" role="alert">
                      {emailError}
                    </small>
                  )}
                </div>
                <div className="settings-profile__field">
                  <div className="settings-profile__field-heading">
                    <label htmlFor="profile-mobile">Mobile number</label>
                    <LockedProfileControl
                      label="mobile visibility"
                      locked={!canEdit}
                      onBlocked={showBlockedControlFeedback}
                      className="inline-block"
                    >
                      <PublicVisibilityCheckbox
                        id="profile-mobile-public"
                        checked={draftProfile.mobilePublic}
                        onChange={requestMobileVisibilityChange}
                        label="Show mobile number on your public profile"
                        disabled={!canEdit}
                      />
                    </LockedProfileControl>
                  </div>
                  <LockedProfileControl
                    label="mobile number"
                    locked={!canEdit}
                    onBlocked={showBlockedControlFeedback}
                    className="block w-full"
                  >
                    <div className="settings-profile__phone-control">
                      <span className="settings-profile__input-shell settings-profile__input-shell--status settings-profile__input-shell--phone">
                        <CountryCodeSelect
                          disabled={!canEdit || isMobileVerified}
                          onCountryChange={updateMobileCountry}
                          triggerClassName="settings-profile__country-code"
                          value={mobileCountry.id}
                        />
                        <input
                          id="profile-mobile"
                          name="mobileNumber"
                          type="tel"
                          inputMode="numeric"
                          value={formatNationalPhoneNumber(
                            draftProfile.mobileNumber ?? "",
                            mobileCountry,
                          )}
                          autoComplete="tel-national"
                          readOnly={isMobileVerified}
                          disabled={!canEdit}
                          placeholder={
                            isMobileVerified ? undefined : "98765 43210"
                          }
                          onChange={(event) =>
                            updateMobileNumber(
                              toInternationalPhoneNumber(
                                event.target.value,
                                mobileCountry,
                              ),
                            )
                          }
                        />
                        {isMobileVerified && (
                          <span
                            className="settings-profile__locked-icon"
                            title="Verified mobile numbers cannot be changed here"
                            aria-label="Verified mobile number locked"
                          >
                            <Lock size={15} aria-hidden="true" />
                          </span>
                        )}
                        {isMobileVerified ? (
                          <span className="settings-profile__tag settings-profile__tag--success">
                            <SealCheck size={14} weight="fill" /> Verified
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="settings-profile__inline-verify-action"
                            onClick={() => void requestMobileVerification()}
                            disabled={
                              !canEdit ||
                              !draftProfile.mobileNumber?.trim() ||
                              sendPhoneVerificationMutation.isPending ||
                              verifyPhoneNumberMutation.isPending
                            }
                            aria-expanded={verificationRequested}
                            aria-controls="profile-verification-dialog"
                          >
                            {sendPhoneVerificationMutation.isPending
                              ? "Sending..."
                              : "Verify now"}
                          </button>
                        )}
                      </span>
                    </div>
                  </LockedProfileControl>
                  {mobileError && (
                    <small className="settings-profile__error" role="alert">
                      {mobileError}
                    </small>
                  )}
                </div>
              </div>
            </section>

            <section className="settings-profile__form-section">
              <div className="settings-profile__section-heading">
                <div>
                  <h2>Social &amp; professional links</h2>
                  <p>Add links to your professional profiles and portfolio.</p>
                </div>
              </div>
              <div className="settings-profile__link-grid">
                <div className="settings-profile__field">
                  <div className="settings-profile__field-heading">
                    <label htmlFor="profile-linkedin">LinkedIn URL</label>
                    <LockedProfileControl
                      label="LinkedIn visibility"
                      locked={!canEdit}
                      onBlocked={showBlockedControlFeedback}
                      className="inline-block"
                    >
                      <PublicVisibilityCheckbox
                        id="profile-linkedin-public"
                        checked={draftProfile.linkedinPublic}
                        onChange={(value) =>
                          requestSocialVisibilityChange(
                            "linkedinPublic",
                            draftProfile.linkedinUrl ?? "",
                            "LinkedIn",
                            "linkedin",
                            value,
                          )
                        }
                        label="Show LinkedIn profile on your public profile"
                        disabled={!canEdit}
                      />
                    </LockedProfileControl>
                  </div>
                  <LockedProfileControl
                    label="LinkedIn URL"
                    locked={!canEdit}
                    onBlocked={showBlockedControlFeedback}
                    className="block w-full"
                  >
                    <span className="settings-profile__input-shell">
                      <LinkedinLogo size={17} aria-hidden="true" />
                      <input
                        id="profile-linkedin"
                        name="linkedinUrl"
                        value={draftProfile.linkedinUrl ?? ""}
                        inputMode="url"
                        autoComplete="off"
                        disabled={!canEdit}
                        aria-invalid={Boolean(socialVisibilityErrors.linkedin)}
                        aria-describedby={
                          socialVisibilityErrors.linkedin
                            ? "profile-linkedin-error"
                            : undefined
                        }
                        onChange={(event) =>
                          updateText("linkedinUrl", event.target.value)
                        }
                      />
                    </span>
                  </LockedProfileControl>
                  {socialVisibilityErrors.linkedin && (
                    <small
                      id="profile-linkedin-error"
                      className="settings-profile__error"
                      role="alert"
                    >
                      {socialVisibilityErrors.linkedin}
                    </small>
                  )}
                </div>
                <div className="settings-profile__field">
                  <div className="settings-profile__field-heading">
                    <label htmlFor="profile-github">GitHub URL</label>
                    <LockedProfileControl
                      label="GitHub visibility"
                      locked={!canEdit}
                      onBlocked={showBlockedControlFeedback}
                      className="inline-block"
                    >
                      <PublicVisibilityCheckbox
                        id="profile-github-public"
                        checked={draftProfile.githubPublic}
                        onChange={(value) =>
                          requestSocialVisibilityChange(
                            "githubPublic",
                            draftProfile.githubUrl ?? "",
                            "GitHub",
                            "github",
                            value,
                          )
                        }
                        label="Show GitHub profile on your public profile"
                        disabled={!canEdit}
                      />
                    </LockedProfileControl>
                  </div>
                  <LockedProfileControl
                    label="GitHub URL"
                    locked={!canEdit}
                    onBlocked={showBlockedControlFeedback}
                    className="block w-full"
                  >
                    <span className="settings-profile__input-shell">
                      <GithubLogo size={17} aria-hidden="true" />
                      <input
                        id="profile-github"
                        name="githubUrl"
                        value={draftProfile.githubUrl ?? ""}
                        inputMode="url"
                        autoComplete="off"
                        disabled={!canEdit}
                        aria-invalid={Boolean(socialVisibilityErrors.github)}
                        aria-describedby={
                          socialVisibilityErrors.github
                            ? "profile-github-error"
                            : undefined
                        }
                        onChange={(event) =>
                          updateText("githubUrl", event.target.value)
                        }
                      />
                    </span>
                  </LockedProfileControl>
                  {socialVisibilityErrors.github && (
                    <small
                      id="profile-github-error"
                      className="settings-profile__error"
                      role="alert"
                    >
                      {socialVisibilityErrors.github}
                    </small>
                  )}
                </div>
                <div className="settings-profile__field">
                  <div className="settings-profile__field-heading">
                    <label htmlFor="profile-website">Portfolio</label>
                    <LockedProfileControl
                      label="portfolio visibility"
                      locked={!canEdit}
                      onBlocked={showBlockedControlFeedback}
                      className="inline-block"
                    >
                      <PublicVisibilityCheckbox
                        id="profile-website-public"
                        checked={draftProfile.websitePublic}
                        onChange={(value) =>
                          requestSocialVisibilityChange(
                            "websitePublic",
                            draftProfile.websiteUrl,
                            "portfolio",
                            "portfolio",
                            value,
                          )
                        }
                        label="Show portfolio on your public profile"
                        disabled={!canEdit}
                      />
                    </LockedProfileControl>
                  </div>
                  <LockedProfileControl
                    label="portfolio URL"
                    locked={!canEdit}
                    onBlocked={showBlockedControlFeedback}
                    className="block w-full"
                  >
                    <span className="settings-profile__input-shell">
                      <Globe size={17} aria-hidden="true" />
                      <input
                        id="profile-website"
                        name="websiteUrl"
                        value={draftProfile.websiteUrl}
                        inputMode="url"
                        autoComplete="off"
                        disabled={!canEdit}
                        aria-invalid={Boolean(socialVisibilityErrors.portfolio)}
                        aria-describedby={
                          socialVisibilityErrors.portfolio
                            ? "profile-portfolio-error"
                            : undefined
                        }
                        onChange={(event) =>
                          updateText("websiteUrl", event.target.value)
                        }
                      />
                    </span>
                  </LockedProfileControl>
                  {socialVisibilityErrors.portfolio && (
                    <small
                      id="profile-portfolio-error"
                      className="settings-profile__error"
                      role="alert"
                    >
                      {socialVisibilityErrors.portfolio}
                    </small>
                  )}
                </div>
              </div>
            </section>

            <div className="settings-profile__form-footer">
              <p role="status" aria-live="polite">
                {!activeUser
                  ? "Sign in to edit and save your profile."
                  : !isOnline
                    ? "You are offline. Reconnect before saving."
                    : updateProfileMutation.isPending
                      ? "Saving your profile…"
                      : saveState === "saved"
                        ? "Your profile is up to date."
                        : isDirty
                          ? "You have unsaved profile changes."
                          : "Changes are saved on your account."}
              </p>
              <LockedProfileControl
                label="discarding profile changes"
                locked={!canEdit}
                onBlocked={showBlockedControlFeedback}
                className="inline-flex shrink-0"
              >
                <button
                  type="button"
                  className="settings-profile__secondary-action"
                  onClick={handleDiscard}
                  disabled={
                    !canEdit || !isDirty || updateProfileMutation.isPending
                  }
                >
                  Discard
                </button>
              </LockedProfileControl>
              <LockedProfileControl
                label="saving profile changes"
                locked={!canEdit}
                onBlocked={showBlockedControlFeedback}
                className="inline-flex shrink-0"
              >
                <button
                  type="button"
                  className="settings-profile__primary-action"
                  onClick={() => void handleSave()}
                  disabled={
                    !canEdit ||
                    !isDirty ||
                    !isOnline ||
                    updateProfileMutation.isPending
                  }
                >
                  {updateProfileMutation.isPending
                    ? "Saving..."
                    : "Save changes"}
                </button>
              </LockedProfileControl>
            </div>
          </div>
        </div>

        {verificationModalOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={verificationDialogRef}
                id="profile-verification-dialog"
                className="settings-profile__verification-dialog-overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-verification-dialog-title"
                aria-describedby="profile-verification-dialog-description"
              >
                <div className="settings-profile__verification-dialog-card">
                  <span
                    className="settings-profile__verification-dialog-top-line"
                    aria-hidden="true"
                  />
                  <button
                    ref={verificationCloseButtonRef}
                    type="button"
                    className="settings-profile__verification-dialog-close"
                    aria-label="Close verification dialog"
                    onClick={dismissVerificationModal}
                  >
                    <X size={14} weight="bold" />
                  </button>

                  <div className="settings-profile__verification-dialog-content">
                    <div
                      className="settings-profile__verification-dialog-icon"
                      aria-hidden="true"
                    >
                      {verificationChannel === "email" ? (
                        <EnvelopeSimple size={26} />
                      ) : (
                        <Phone size={26} />
                      )}
                    </div>
                    <h3 id="profile-verification-dialog-title">
                      {verificationChannel === "email"
                        ? "Verify your email"
                        : "Verify your mobile number"}
                    </h3>
                    <p id="profile-verification-dialog-description">
                      We sent a 6-digit code to{" "}
                      <strong>
                        {verificationChannel === "email"
                          ? activeEmail
                          : verificationPhone}
                      </strong>
                      .
                    </p>
                  </div>

                  <div className="settings-profile__verification-dialog-field">
                    <label
                      className="settings-profile__verification-dialog-field-label"
                      htmlFor="auth-otp-digit-1"
                    >
                      Verification code
                    </label>
                    <OtpCodeInput
                      describedBy={
                        verificationError
                          ? "profile-verification-dialog-error"
                          : "profile-verification-dialog-hint"
                      }
                      disabled={
                        verificationChannel === "email"
                          ? verifyEmailMutation.isPending
                          : verifyPhoneNumberMutation.isPending
                      }
                      invalid={Boolean(verificationError)}
                      label="Verification code"
                      value={
                        verificationChannel === "email"
                          ? emailVerificationCode
                          : verificationCode
                      }
                      onChange={(code) => {
                        if (verificationChannel === "email") {
                          setEmailVerificationCode(code);
                        } else {
                          setVerificationCode(code);
                        }
                      }}
                    />
                    <small id="profile-verification-dialog-hint">
                      Enter the code to finish verifying your account.
                    </small>
                  </div>

                  {verificationError ? (
                    <p
                      id="profile-verification-dialog-error"
                      className="settings-profile__verification-dialog-error"
                      role="alert"
                    >
                      {verificationError}
                    </p>
                  ) : null}

                  <div className="settings-profile__verification-dialog-resend-row">
                    <p>Didn&apos;t receive the code?</p>
                    <button
                      type="button"
                      className="settings-profile__verification-dialog-resend"
                      onClick={() =>
                        void (verificationChannel === "email"
                          ? requestEmailVerification()
                          : requestMobileVerification())
                      }
                      disabled={
                        verificationChannel === "email"
                          ? sendEmailVerificationMutation.isPending ||
                            verifyEmailMutation.isPending
                          : sendPhoneVerificationMutation.isPending ||
                            verifyPhoneNumberMutation.isPending
                      }
                    >
                      Resend code
                    </button>
                  </div>

                  <div className="settings-profile__verification-dialog-actions">
                    <button
                      ref={verificationCancelButtonRef}
                      type="button"
                      className="settings-profile__verification-dialog-cancel"
                      onClick={dismissVerificationModal}
                    >
                      Cancel
                    </button>
                    <button
                      ref={verificationSubmitButtonRef}
                      type="button"
                      className="settings-profile__verification-dialog-submit"
                      onClick={() =>
                        void (verificationChannel === "email"
                          ? verifyEmailAddress()
                          : verifyMobileNumber())
                      }
                      disabled={
                        verificationChannel === "email"
                          ? verifyEmailMutation.isPending ||
                            emailVerificationCode.length !== 6
                          : verifyPhoneNumberMutation.isPending ||
                            verificationCode.length !== 6
                      }
                    >
                      {verificationChannel === "email"
                        ? verifyEmailMutation.isPending
                          ? "Verifying..."
                          : "Verify OTP"
                        : verifyPhoneNumberMutation.isPending
                          ? "Verifying..."
                          : "Verify OTP"}
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {mobileVisibilityPromptOpen && (
          <dialog
            ref={mobileVisibilityDialogRef}
            className="settings-profile__privacy-dialog"
            aria-modal="true"
            aria-labelledby="mobile-visibility-dialog-title"
            aria-describedby="mobile-visibility-dialog-description"
            onCancel={(event) => {
              event.preventDefault();
              closeMobileVisibilityPrompt();
            }}
          >
            <button
              type="button"
              className="settings-profile__privacy-dialog-close"
              aria-label="Close mobile visibility confirmation"
              onClick={closeMobileVisibilityPrompt}
            >
              <X size={18} />
            </button>
            <div
              className="settings-profile__privacy-dialog-icon"
              aria-hidden="true"
            >
              <ShieldWarning size={25} weight="fill" />
            </div>
            <div className="settings-profile__privacy-dialog-copy">
              <h2 id="mobile-visibility-dialog-title">
                Show your mobile number publicly?
              </h2>
              <p id="mobile-visibility-dialog-description">
                Anyone who can view your profile will be able to see this
                number. They may call you directly or message you on WhatsApp.
                You can hide it again before saving your profile.
              </p>
            </div>
            <label className="settings-profile__privacy-consent">
              <input
                type="checkbox"
                checked={mobileVisibilityAcknowledged}
                onChange={(event) =>
                  setMobileVisibilityAcknowledged(event.target.checked)
                }
              />
              <span
                className="settings-profile__privacy-consent-mark"
                aria-hidden="true"
              >
                <Check size={12} weight="bold" />
              </span>
              <span>
                I understand that anyone can call or message me on WhatsApp
                using this number.
              </span>
            </label>
            <div className="settings-profile__privacy-dialog-actions">
              <button type="button" onClick={closeMobileVisibilityPrompt}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!mobileVisibilityAcknowledged}
                onClick={confirmMobileVisibility}
              >
                I understand, show publicly
              </button>
            </div>
          </dialog>
        )}
      </section>
    </LockedProfileControlContext.Provider>
  );
}
