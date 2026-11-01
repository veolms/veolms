import { AccountSettings } from "./AccountSettings";
import { NotificationSettings } from "./NotificationSettings";
import { ProfileSettings } from "./ProfileSettings";
import { SecuritySettings } from "./SecuritySettings";
import type { SettingsPageProps } from "../SettingsPage";

export type SignedInSettingsTabId =
  "profile" | "notifications" | "security" | "account";

/**
 * The sections that only mean something to a signed-in account. They are a
 * chunk of their own (see SettingsPage.tsx), so a guest's Settings never
 * downloads them.
 */
export function SignedInSettingsTab({
  panelTab,
  pageProps,
}: {
  panelTab: SignedInSettingsTabId;
  pageProps: SettingsPageProps;
}) {
  switch (panelTab) {
    case "profile":
      return (
        <ProfileSettings
          role={pageProps.role}
          onProfileSaved={pageProps.onProfileSaved}
          isAuthenticated={pageProps.isAuthenticated}
        />
      );
    case "notifications":
      return (
        <NotificationSettings isAuthenticated={pageProps.isAuthenticated} />
      );
    case "security":
      return <SecuritySettings isAuthenticated={pageProps.isAuthenticated} />;
    case "account":
      return (
        <AccountSettings
          role={pageProps.role ?? "student"}
          userRoles={pageProps.userRoles}
          isAuthenticated={pageProps.isAuthenticated}
          onNavigatePage={pageProps.onNavigatePage}
        />
      );
  }
}
