import { useEffect, useMemo } from "react";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import type { CourseRole } from "../../courses/catalogue";
import type { AuthIdentityHint } from "../../store/auth.store";
import { hasAdminRole, getShellProfileSubtitle } from "../workspaceRole";
import {
  useNotificationStream,
  useNotificationSummary,
} from "../../services/notifications";
import type { AuthUser } from "../../store/auth.store";
import type { Icon } from "@phosphor-icons/react";
import { rememberProfileChip } from "../profileHintEarlyState";
import { useChatStream } from "../../services/chat";

export interface UseShellProfileSummaryArgs {
  authUserFetched: boolean;
  authIdentityHint: AuthIdentityHint | null;
  activeUser: AuthUser | null | undefined;
  isAuthenticated: boolean;
  userRoles: readonly string[] | undefined;
  canSwitchWorkspace: boolean;
  effectiveRole: CourseRole;
}

export interface UseShellProfileSummaryResult {
  shellProfileKnownName: string | undefined;
  shellProfileDisplayName: string;
  shellProfileSubtitle: string;
  ProfileSubtitleIcon: Icon;
  shellProfileAvatarUrl: string | null;
  shellProfileAvatarSrcSet: { url: string; width: number; height: number }[];
  unreadNotificationCount: number;
}

export function useShellProfileSummary({
  authUserFetched,
  authIdentityHint,
  activeUser,
  isAuthenticated,
  userRoles,
  canSwitchWorkspace,
  effectiveRole,
}: UseShellProfileSummaryArgs): UseShellProfileSummaryResult {
  // The home greeting takes the name without the placeholder: given "Your
  // name" it greeted a learner who has no display name as "Good morning, Your".
  const shellProfileKnownName =
    activeUser?.displayName?.trim() ||
    (!authUserFetched ? authIdentityHint?.displayName : undefined);
  const shellProfileDisplayName = shellProfileKnownName || "Your name";
  const shellProfileSubtitle = useMemo(
    () =>
      getShellProfileSubtitle(
        effectiveRole,
        userRoles,
        activeUser?.username,
        canSwitchWorkspace,
      ),
    [activeUser?.username, canSwitchWorkspace, effectiveRole, userRoles],
  );
  const ProfileSubtitleIcon =
    effectiveRole === "student"
      ? Student
      : hasAdminRole(userRoles)
        ? ShieldCheck
        : Users;
  const shellProfileAvatarUrl = activeUser?.avatarDataUrl ?? null;
  const shellProfileAvatarSrcSet = activeUser?.avatarSrcSet ?? [];
  // Guests have no notifications endpoint access; an unauthenticated request
  // would only log a 401 console error on every public page.
  const { data: notificationSummary } = useNotificationSummary({
    enabled: isAuthenticated,
  });
  // The badge updates the moment a notification arrives, not at the next poll.
  useNotificationStream(isAuthenticated);
  // Chat's live stream on every page: new messages count as delivered
  // (second tick) and you show as online while the app is open, as in
  // WhatsApp. It carries notification changes too (lib/tabLiveStream).
  useChatStream(activeUser?.id ?? null, isAuthenticated);
  // The Chats page's code, fetched once the app is quiet, so opening Chats
  // from any page draws at once instead of waiting for its chunk.
  useEffect(() => {
    if (!isAuthenticated) return;
    const load = () => void import("../../routes/chat/chat");
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 8_000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(load, 4_000);
    return () => clearTimeout(id);
  }, [isAuthenticated]);
  const unreadNotificationCount = notificationSummary?.unreadCount ?? 0;
  // What the button shows under the name, kept for the next load's first
  // paint (see profileHintEarlyState.ts).
  const activeUserId = activeUser?.id;
  const adminRole = hasAdminRole(userRoles);
  useEffect(() => {
    if (!isAuthenticated || !activeUserId) return;
    rememberProfileChip({
      userId: activeUserId,
      subtitle: shellProfileSubtitle,
      icon: canSwitchWorkspace
        ? effectiveRole === "student"
          ? "student"
          : adminRole
            ? "admin"
            : "creator"
        : null,
    });
  }, [
    activeUserId,
    adminRole,
    canSwitchWorkspace,
    effectiveRole,
    isAuthenticated,
    shellProfileSubtitle,
  ]);
  return {
    shellProfileKnownName,
    shellProfileDisplayName,
    shellProfileSubtitle,
    ProfileSubtitleIcon,
    shellProfileAvatarUrl,
    shellProfileAvatarSrcSet,
    unreadNotificationCount,
  };
}
