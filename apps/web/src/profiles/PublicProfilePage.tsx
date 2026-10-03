import {
  EnvelopeSimpleIcon as EnvelopeSimple,
  GithubLogoIcon as GithubLogo,
  GlobeIcon as Globe,
  LinkedinLogoIcon as LinkedinLogo,
  PhoneIcon as Phone,
  SealCheckIcon as SealCheck,
  UserIcon as User,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { PublicProfileResponse } from "@veolms/contracts";
import { PageHeading } from "../components/PageHeading";
import { PublicProfileCard } from "../components/PublicProfileCard";
import { ResponsiveAvatar } from "../components/ResponsiveAvatar";
import { usePublicProfile } from "../services/auth";
import "../styles/features/profile.css";

interface PublicProfilePageProps {
  username?: string;
  onNavigateBack?: () => void;
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function PublicProfileAvatar({ profile }: { profile: PublicProfileResponse }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [profile.avatarDataUrl]);

  return (
    <span className="settings-profile__avatar settings-profile__avatar--large" aria-hidden="true">
      {profile.avatarDataUrl && !imageFailed ? (
        <ResponsiveAvatar
          src={profile.avatarDataUrl}
          srcSet={profile.avatarSrcSet}
          sizes="150px"
          alt=""
          width={160}
          height={160}
          loading="eager"
          fetchPriority="high"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <User className="settings-profile__avatar-fallback" size={72} weight="duotone" />
      )}
    </span>
  );
}

function PublicProfileLinks({ profile }: { profile: PublicProfileResponse }) {
  const linkedinUrl = safeExternalUrl(profile.linkedinUrl);
  const githubUrl = safeExternalUrl(profile.githubUrl);
  const websiteUrl = safeExternalUrl(profile.websiteUrl);

  return (
    <div className="settings-profile__public-links">
      {linkedinUrl ? (
        <a href={linkedinUrl} target="_blank" rel="noreferrer">
          <LinkedinLogo size={16} weight="fill" /> LinkedIn
        </a>
      ) : null}
      {githubUrl ? (
        <a href={githubUrl} target="_blank" rel="noreferrer">
          <GithubLogo size={16} weight="fill" /> GitHub
        </a>
      ) : null}
      {profile.email ? (
        <a href={`mailto:${profile.email}`}>
          <EnvelopeSimple size={16} /> {profile.email}
        </a>
      ) : null}
      {profile.phoneNo ? (
        <a href={`tel:${profile.phoneNo.replace(/\s/g, "")}`}>
          <Phone size={16} /> {profile.phoneNo}
        </a>
      ) : null}
      {websiteUrl ? (
        <a href={websiteUrl} target="_blank" rel="noreferrer">
          <Globe size={16} /> Portfolio
        </a>
      ) : null}
    </div>
  );
}

export function PublicProfilePage({ username, onNavigateBack }: PublicProfilePageProps) {
  const { data: profile, isError, isLoading, refetch } = usePublicProfile(username);

  return (
    <main
      className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-5"
      aria-labelledby="public-profile-title"
    >
      <PageHeading
        id="public-profile-title"
        title="Public profile"
        description="Profile details this member has chosen to share."
        onNavigateBack={onNavigateBack}
      />

      {isLoading ? (
        <section
          className="settings-profile__public-card"
          aria-label="Loading public profile"
          role="status"
        >
          <div className="settings-profile__public-art" aria-hidden="true" />
          <div className="settings-profile__public-content animate-pulse">
            <span className="size-32 rounded-full bg-(--surface-strong)" />
            <span className="h-6 w-48 max-w-full rounded-md bg-(--surface-strong)" />
            <span className="h-4 w-32 max-w-full rounded-md bg-(--surface-strong)" />
            <span className="h-4 w-full max-w-xl rounded-md bg-(--surface-strong)" />
            <span className="sr-only">Loading public profile</span>
          </div>
        </section>
      ) : isError || !profile ? (
        <section className="settings-profile__public-card" aria-label="Public profile details">
          <div className="settings-profile__public-art" aria-hidden="true" />
          <div className="settings-profile__public-content">
            <h2 className="text-lg font-semibold text-(--text)">This profile is unavailable</h2>
            <p className="max-w-prose text-sm leading-6 text-(--muted)">
              Check the profile address or try loading it again.
            </p>
            <button
              type="button"
              className="rounded-lg border border-(--border) bg-(--surface-strong) px-3 py-2 text-sm font-medium text-(--text) transition-colors hover:bg-(--hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              onClick={() => void refetch()}
            >
              Try again
            </button>
          </div>
        </section>
      ) : (
        <PublicProfileCard
          displayName={profile.displayName}
          username={profile.username}
          avatar={<PublicProfileAvatar profile={profile} />}
          bio={profile.bio}
          links={<PublicProfileLinks profile={profile} />}
          verifiedIcon={<SealCheck size={21} weight="fill" aria-label="Verified profile" />}
        />
      )}
    </main>
  );
}
