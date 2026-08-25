import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { AtIcon as At } from "@phosphor-icons/react/At";
import { CameraIcon as Camera } from "@phosphor-icons/react/Camera";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GithubLogoIcon as GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { LinkedinLogoIcon as LinkedinLogo } from "@phosphor-icons/react/LinkedinLogo";
import { PhoneIcon as Phone } from "@phosphor-icons/react/Phone";
import { SealCheckIcon as SealCheck } from "@phosphor-icons/react/SealCheck";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/ShieldWarning";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useBackDismiss } from "../navigation/useBackDismiss";
import {
  getDefaultProfileIdentity,
  getProfileIdentity,
  saveProfilePreferences,
} from "./profilePreferences";
import type {
  ProfileIdentity,
  ProfilePreferences,
  ProfileRole,
} from "./profilePreferences";
import { useCurrentUser } from "../services/auth";
import { useAuthStore } from "../store/auth.store";

type EditableProfile = ProfilePreferences & {
  bio: string;
  emailPublic: boolean;
  mobilePublic: boolean;
  linkedinPublic: boolean;
  githubPublic: boolean;
  websitePublic: boolean;
  websiteUrl: string;
};

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

export interface ProfileSettingsProps {
  role?: ProfileRole;
  onNavigatePage?: (page: string) => void;
  onProfileSaved?: (profile: ProfilePreferences) => void;
}

const toEditableProfile = (profile: ProfileIdentity): EditableProfile => ({
  displayName: profile.displayName,
  avatarDataUrl: profile.avatarDataUrl,
  username: profile.username ?? "",
  bio: profile.bio ?? "",
  mobileNumber: profile.mobileNumber ?? "",
  mobileVerified: profile.mobileVerified ?? false,
  emailPublic: profile.emailPublic ?? false,
  // Public mobile visibility requires server confirmation. Never restore a
  // browser-only value left by an earlier client-only implementation.
  mobilePublic: false,
  linkedinUrl: profile.linkedinUrl ?? "",
  linkedinPublic: profile.linkedinPublic ?? true,
  githubUrl: profile.githubUrl ?? "",
  githubPublic: profile.githubPublic ?? true,
  websitePublic: profile.websitePublic ?? true,
  websiteUrl: profile.websiteUrl ?? "",
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

const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");
};

const externalUrl = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

interface PublicVisibilityCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

function PublicVisibilityCheckbox({
  id,
  checked,
  onChange,
  label,
}: PublicVisibilityCheckboxProps) {
  return (
    <label className="settings-profile__visibility-checkbox" htmlFor={id}>
      <span>Show publicly</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
      <span
        className="settings-profile__visibility-checkbox-mark"
        aria-hidden="true"
      >
        <Check size={10} weight="bold" />
      </span>
    </label>
  );
}

export function ProfileSettings({
  role = "student",
  onProfileSaved,
}: ProfileSettingsProps) {
  const initializedRoleRef = useRef(role);
  const { data: userProfile } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = userProfile || storeUser;

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
  const [mobileError, setMobileError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [mobileVisibilityPromptOpen, setMobileVisibilityPromptOpen] =
    useState(false);

  useBackDismiss({
    open: mobileVisibilityPromptOpen,
    onDismiss: () => setMobileVisibilityPromptOpen(false),
  });
  const [mobileVisibilityAcknowledged, setMobileVisibilityAcknowledged] =
    useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileVisibilityDialogRef = useRef<HTMLDialogElement>(null);

  const isDirty = !profilesMatch(draftProfile, savedProfile);
  const displayName = draftProfile.displayName.trim() || "Your name";
  const username = draftProfile.username?.trim() || "username";
  const showAvatar = Boolean(draftProfile.avatarDataUrl) && !avatarFailed;
  const activeEmail = activeUser?.email || initialIdentity.email;
  const isEmailVerified = Boolean(activeUser?.email);
  const isMobileVerified = Boolean(activeUser?.phoneNo || draftProfile.mobileVerified);

  useEffect(() => {
    // Restore default dummy identity for guest or active user context
    initializedRoleRef.current = role;
    if (!activeUser) {
      const defaultIdentity = getDefaultProfileIdentity(role);
      const editableProfile = toEditableProfile(defaultIdentity);
      setSavedProfile(editableProfile);
      setDraftProfile(editableProfile);
    } else {
      const identity = getProfileIdentity(role);
      const editableProfile = toEditableProfile(identity);
      if (activeUser.displayName) editableProfile.displayName = activeUser.displayName;
      if (activeUser.username) editableProfile.username = activeUser.username;
      if (activeUser.phoneNo) {
        editableProfile.mobileNumber = activeUser.phoneNo;
        editableProfile.mobileVerified = true;
      }
      setSavedProfile(editableProfile);
      setDraftProfile(editableProfile);
    }
    setNameError("");
    setUsernameError("");
    setMobileError("");
    setPhotoError("");
    setSaveError("");
    setVerificationRequested(false);
    setMobileVisibilityPromptOpen(false);
    setMobileVisibilityAcknowledged(false);
  }, [role, activeUser]);

  useEffect(() => setAvatarFailed(false), [draftProfile.avatarDataUrl]);

  useEffect(() => {
    const dialog = mobileVisibilityDialogRef.current;
    if (!dialog) return;
    if (mobileVisibilityPromptOpen && !dialog.open) dialog.showModal();
    if (!mobileVisibilityPromptOpen && dialog.open) dialog.close();
  }, [mobileVisibilityPromptOpen]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!isDirty || !isOnline || !activeUser) return;

    const normalizedName = draftProfile.displayName.trim();
    const normalizedUsername = draftProfile.username?.trim() ?? "";
    if (!normalizedName) {
      setNameError("Enter the name you want to use in this academy.");
      return;
    }
    if (normalizedUsername && !/^[a-zA-Z0-9._-]+$/.test(normalizedUsername)) {
      setUsernameError(
        "Use letters, numbers, dots, underscores, or hyphens only.",
      );
      return;
    }

    const timer = window.setTimeout(() => {
      const nextProfile: EditableProfile = {
        ...draftProfile,
        displayName: normalizedName,
        username: normalizedUsername,
        bio: draftProfile.bio.trim(),
        mobileNumber: draftProfile.mobileNumber?.trim() ?? "",
        linkedinUrl: draftProfile.linkedinUrl?.trim() ?? "",
        githubUrl: draftProfile.githubUrl?.trim() ?? "",
        websiteUrl: draftProfile.websiteUrl.trim(),
      };
      if (saveProfilePreferences(role, nextProfile)) {
        setSavedProfile(nextProfile);
        setSaveError("");
        onProfileSaved?.(nextProfile);
      } else {
        setSaveError(
          "We couldn't save these profile changes in this browser. Free some browser storage or choose a smaller profile photo, then try again.",
        );
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [draftProfile, isDirty, isOnline, onProfileSaved, role]);

  const updateText = (field: keyof EditableProfile, value: string) => {
    setSaveError("");
    setDraftProfile((current) => ({ ...current, [field]: value }));
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
    setSaveError("");
    setVerificationRequested(false);
    setMobileError("");
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
    setSaveError("");
    setDraftProfile((current) => ({ ...current, [field]: value }));
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
    updateVisibility("mobilePublic", false);
    closeMobileVisibilityPrompt();
    setMobileError(
      "Mobile publishing is unavailable until server verification is connected. Your number remains private, and no request was sent.",
    );
  };

  const requestMobileVerification = () => {
    if (!draftProfile.mobileNumber?.trim()) {
      setMobileError("Enter a mobile number first.");
      return;
    }
    setMobileError("");
    setVerificationRequested(true);
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
        <strong>{getInitials(displayName)}</strong>
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
      {draftProfile.emailPublic && (
        <a href={`mailto:${activeEmail}`}>
          <EnvelopeSimple size={16} /> {activeEmail}
        </a>
      )}
      {draftProfile.mobilePublic && draftProfile.mobileNumber && (
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
                  <button
                    type="button"
                    className="settings-profile__camera"
                    aria-label="Choose a new profile photo"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera size={17} weight="fill" />
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  className="settings-profile__file-input"
                  type="file"
                  accept="image/*"
                  aria-label="Profile photo file"
                  tabIndex={-1}
                  onChange={handlePhotoChange}
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
          {saveError && (
            <p
              className="settings-profile__error settings-profile__save-error"
              role="alert"
            >
              {saveError}
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
                <input
                  id="profile-display-name"
                  name="displayName"
                  value={draftProfile.displayName}
                  autoComplete="name"
                  aria-invalid={Boolean(nameError)}
                  onChange={(event) => updateDisplayName(event.target.value)}
                />
                {nameError && (
                  <small className="settings-profile__error" role="alert">
                    {nameError}
                  </small>
                )}
              </div>
              <div className="settings-profile__field">
                <label htmlFor="profile-username">Username</label>
                <span className="settings-profile__input-shell">
                  <At size={17} aria-hidden="true" />
                  <input
                    id="profile-username"
                    name="username"
                    value={draftProfile.username ?? ""}
                    autoComplete="username"
                    onChange={(event) => updateUsername(event.target.value)}
                  />
                </span>
                {usernameError && (
                  <small className="settings-profile__error" role="alert">
                    {usernameError}
                  </small>
                )}
              </div>
            </div>
            <div className="settings-profile__field settings-profile__field--bio">
              <label htmlFor="profile-bio">Bio</label>
              <textarea
                id="profile-bio"
                name="bio"
                className="[touch-action:pan-y_pinch-zoom] focus:touch-auto"
                value={draftProfile.bio}
                maxLength={160}
                rows={3}
                onChange={(event) => updateText("bio", event.target.value)}
              />
              <small className="settings-profile__character-count">
                {draftProfile.bio.length} / 160
              </small>
            </div>
            <div className="settings-profile__field-grid settings-profile__field-grid--contact">
              <div className="settings-profile__field">
                <div className="settings-profile__field-heading">
                  <label htmlFor="profile-email">Email address</label>
                  <PublicVisibilityCheckbox
                    id="profile-email-public"
                    checked={draftProfile.emailPublic}
                    onChange={(value) => updateVisibility("emailPublic", value)}
                    label="Show email address on your public profile"
                  />
                </div>
                <span className="settings-profile__input-shell settings-profile__input-shell--status">
                  <EnvelopeSimple size={17} aria-hidden="true" />
                  <input
                    id="profile-email"
                    value={activeEmail}
                    autoComplete="email"
                    readOnly
                    aria-readonly="true"
                  />
                  {isEmailVerified ? (
                    <span className="settings-profile__tag settings-profile__tag--success">
                      <SealCheck size={14} weight="fill" /> Verified
                    </span>
                  ) : (
                    <span className="settings-profile__tag settings-profile__tag--warning">
                      Not verified
                    </span>
                  )}
                </span>
              </div>
              <div className="settings-profile__field">
                <div className="settings-profile__field-heading">
                  <label htmlFor="profile-mobile">Mobile number</label>
                  <PublicVisibilityCheckbox
                    id="profile-mobile-public"
                    checked={draftProfile.mobilePublic}
                    onChange={requestMobileVisibilityChange}
                    label="Show mobile number on your public profile"
                  />
                </div>
                <div className="settings-profile__phone-control">
                  <span className="settings-profile__input-shell settings-profile__input-shell--status">
                    <Phone size={17} aria-hidden="true" />
                    <input
                      id="profile-mobile"
                      name="mobileNumber"
                      type="tel"
                      value={draftProfile.mobileNumber ?? ""}
                      autoComplete="tel"
                      onChange={(event) =>
                        updateMobileNumber(event.target.value)
                      }
                    />
                    {isMobileVerified ? (
                      <span className="settings-profile__tag settings-profile__tag--success">
                        <SealCheck size={14} weight="fill" /> Verified
                      </span>
                    ) : (
                      <span className="settings-profile__tag settings-profile__tag--warning">
                        Not verified
                      </span>
                    )}
                  </span>
                  {!isMobileVerified && (
                    <button
                      type="button"
                      className="settings-profile__verify-action"
                      onClick={requestMobileVerification}
                      aria-expanded={verificationRequested}
                      aria-controls="profile-verification-availability"
                    >
                      {verificationRequested ? "Unavailable" : "Verify number"}
                    </button>
                  )}
                </div>
                {mobileError && (
                  <small className="settings-profile__error" role="alert">
                    {mobileError}
                  </small>
                )}
              </div>
            </div>
            {verificationRequested && !draftProfile.mobileVerified && (
              <div
                id="profile-verification-availability"
                className="settings-profile__verification-panel"
                role="status"
                aria-labelledby="profile-verification-title"
              >
                <div className="settings-profile__verification-copy">
                  <span
                    className="settings-profile__verification-icon"
                    aria-hidden="true"
                  >
                    <Phone size={18} />
                  </span>
                  <div>
                    <strong id="profile-verification-title">
                      Mobile verification unavailable
                    </strong>
                    <p>
                      The server verification service has not been connected
                      yet.
                    </p>
                  </div>
                </div>
                <div className="settings-profile__verification-copy">
                  <span
                    className="settings-profile__verification-icon"
                    aria-hidden="true"
                  >
                    <ShieldWarning size={18} />
                  </span>
                  <div>
                    <strong>No request sent</strong>
                    <p>
                      No code was sent. This number remains unverified and
                      private until the server confirms it.
                    </p>
                  </div>
                </div>
              </div>
            )}
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
                  <PublicVisibilityCheckbox
                    id="profile-linkedin-public"
                    checked={draftProfile.linkedinPublic}
                    onChange={(value) =>
                      updateVisibility("linkedinPublic", value)
                    }
                    label="Show LinkedIn profile on your public profile"
                  />
                </div>
                <span className="settings-profile__input-shell">
                  <LinkedinLogo size={17} aria-hidden="true" />
                  <input
                    id="profile-linkedin"
                    name="linkedinUrl"
                    value={draftProfile.linkedinUrl ?? ""}
                    inputMode="url"
                    onChange={(event) =>
                      updateText("linkedinUrl", event.target.value)
                    }
                  />
                </span>
              </div>
              <div className="settings-profile__field">
                <div className="settings-profile__field-heading">
                  <label htmlFor="profile-github">GitHub URL</label>
                  <PublicVisibilityCheckbox
                    id="profile-github-public"
                    checked={draftProfile.githubPublic}
                    onChange={(value) =>
                      updateVisibility("githubPublic", value)
                    }
                    label="Show GitHub profile on your public profile"
                  />
                </div>
                <span className="settings-profile__input-shell">
                  <GithubLogo size={17} aria-hidden="true" />
                  <input
                    id="profile-github"
                    name="githubUrl"
                    value={draftProfile.githubUrl ?? ""}
                    inputMode="url"
                    onChange={(event) =>
                      updateText("githubUrl", event.target.value)
                    }
                  />
                </span>
              </div>
              <div className="settings-profile__field">
                <div className="settings-profile__field-heading">
                  <label htmlFor="profile-website">Portfolio</label>
                  <PublicVisibilityCheckbox
                    id="profile-website-public"
                    checked={draftProfile.websitePublic}
                    onChange={(value) =>
                      updateVisibility("websitePublic", value)
                    }
                    label="Show portfolio on your public profile"
                  />
                </div>
                <span className="settings-profile__input-shell">
                  <Globe size={17} aria-hidden="true" />
                  <input
                    id="profile-website"
                    name="websiteUrl"
                    value={draftProfile.websiteUrl}
                    inputMode="url"
                    onChange={(event) =>
                      updateText("websiteUrl", event.target.value)
                    }
                  />
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

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
              Anyone who can view your profile will be able to see this number.
              They may call you directly or message you on WhatsApp. Publishing
              is not connected yet, so this acknowledgement will keep your
              number private and will not send a request.
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
              I understand that anyone can call or message me on WhatsApp using
              this number.
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
              I understand, keep private
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
