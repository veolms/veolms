# System Configuration API — Frontend Integration Guide

This guide documents the API endpoints built for system configuration, theme presets, and user settings synchronization in VEO LMS.

---

## Base API URL

- **Development API Server**: `http://localhost:4000/api/v1`
- **Frontend Local Dev**: React Router dev server proxies requests from `http://localhost:3000/api/v1` to `http://localhost:4000/api/v1`.

---

## Overview of Endpoints

### Public & User Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/system/config` | `GET` | Public | Returns global branding, fallback theme, layout, and feature flags. |
| `/system/themes` | `GET` | Public | Returns array of 16 active theme presets with light/dark CSS tokens. |
| `/me/preferences` | `GET` | Authenticated | Returns user's saved UI, sidebar, reading mode, & learning preferences. |
| `/me/preferences` | `PATCH` | Authenticated | Auto-saves partial preference updates for logged-in user. |

### Admin Management Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/admin/system/config` | `GET` | Admin | Returns all system config items including non-public entries. |
| `/admin/system/config/:namespace/:key` | `PUT` | Admin | Update or create a system config item (e.g. update branding name or logo). |
| `/admin/system/themes` | `GET` | Admin | Returns all theme presets (active + inactive). |
| `/admin/system/themes` | `POST` | Admin | Create a new theme preset with dark/light CSS tokens. |
| `/admin/system/themes/:slug` | `PUT` | Admin | Update an existing theme preset (name, accent color, CSS tokens). |
| `/admin/system/themes/:slug` | `DELETE` | Admin | Soft-delete a theme preset (`is_active = false`). |

---

## 1. Get System Config (Public)

Fetch public platform configurations on app boot to render branding, logos, default theme, and toggle feature-gated UI elements.

### Endpoint
`GET /api/v1/system/config`

### Response (`200 OK`)
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "branding": {
      "brand_name": "ProCodrr",
      "academy_name": "ProCodrr Academy",
      "tagline": "Learn by building software that lasts.",
      "description": "Practical courses for building reliable software.",
      "logo_url": "/assets/logo.svg"
    },
    "theme": {
      "default_color_theme": "codex",
      "default_mode": "dark"
    },
    "layout": {
      "main_content_layout": "framed"
    },
    "featureFlags": {
      "discussions_enabled": true,
      "wishlist_enabled": true
    }
  }
}
```

---

## 2. Get Theme Presets (Public)

Fetch all 16 active theme presets for rendering the color theme picker.

### Endpoint
`GET /api/v1/system/themes`

### Response (`200 OK`)
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "themes": [
      {
        "slug": "codex",
        "name": "Veo Onyx",
        "description": "Default - charcoal & soft white",
        "accentColor": "#8b5cf6",
        "previewColor": "#f4f4f5",
        "darkInk": true,
        "isDefault": true,
        "sortOrder": 0
      },
      {
        "slug": "ocean",
        "name": "Ocean Blue",
        "description": "Clear & confident",
        "accentColor": "#3b82f6",
        "previewColor": "#7193ff",
        "darkInk": true,
        "isDefault": false,
        "sortOrder": 1
      },
      {
        "slug": "brainwave",
        "name": "Brainwave Slate",
        "description": "Cool graphite & electric blue",
        "accentColor": "#0085ff",
        "previewColor": "#0085ff",
        "darkInk": true,
        "isDefault": false,
        "sortOrder": 12
      }
    ]
  }
}
```

---

## 3. Get User Preferences (Authenticated)

Fetch saved preferences for the currently logged-in user.

### Endpoint
`GET /api/v1/me/preferences`

### Headers
```http
Authorization: Bearer <user_token>
```
*(Or via session cookie if using cookie-based auth)*

### Response (`200 OK`)
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "uiMode": "dark",
    "colorTheme": "codex",
    "randomThemeOnOpen": false,
    "themeRotationPool": ["codex", "ocean", "midnight", "graphite"],
    "reduceAnimations": false,
    "highContrastMode": false,
    "compactLayout": false,
    "hideScrollbars": false,
    "elevatedSurfaces": true,
    "shortcutPlatformPreference": "system",
    "textSize": "default",
    "pageTabColors": "follow-sidebar",
    "readingModeEnabled": false,
    "readingModeColorTemperature": 50,
    "readingModeTexture": 15,
    "readingModeColors": "sepia",
    "sidebarIconStyle": "monochrome",
    "sidebarIconColorMode": "theme",
    "sidebarIconCustomColor": null,
    "mainContentLayout": "framed",
    "sidebarMaxWidthPx": 300,
    "sidebarHeaderLayout": "inline",
    "sidebarDockItems": ["appearance", "theme", "reading-mode", "fullscreen"],
    "sidebarDockOrder": ["appearance", "theme", "reading-mode", "fullscreen", "settings"],
    "sidebarShowKeyboardShortcuts": true,
    "sidebarShowLabelsCollapsed": true,
    "sidebarShowLogoCollapsed": true,
    "sidebarHighlightActiveItem": true,
    "sidebarElevateMenus": true,
    "sidebarHidden": false,
    "defaultVideoQuality": "auto",
    "defaultPlaybackSpeed": "1",
    "resumeFromLastPosition": true,
    "startInTheatreMode": false,
    "weeklyLearningGoalHrs": 5.0,
    "learningRemindersEnabled": true,
    "reminderDays": ["mon", "tue", "wed", "thu", "fri"],
    "reminderTime": "19:00",
    "reminderTimezone": "Asia/Kolkata (IST)",
    "showCaptionsByDefault": false,
    "preferredCaptionLanguage": "English",
    "autoScrollTranscript": true,
    "highlightTranscriptLine": true,
    "openCurrentSectionAuto": true,
    "continueNextIncompleteLecture": true,
    "autoMoveNextSection": true,
    "keepCompletedLecturesVisible": true
  }
}
```

---

## 4. Update User Preferences (Authenticated Auto-Save)

Partially update user settings. Only include the fields that changed.

### Endpoint
`PATCH /api/v1/me/preferences`

### Headers
```http
Authorization: Bearer <user_token>
Content-Type: application/json
```

### Request Example (Updating Reading Mode & Text Size)
```json
{
  "readingModeEnabled": true,
  "readingModeColorTemperature": 65,
  "textSize": "large"
}
```

### Request Example (Updating Theme Selection)
```json
{
  "colorTheme": "brainwave",
  "uiMode": "dark"
}
```

### Request Example (Updating Sidebar Dock items)
```json
{
  "sidebarDockItems": ["appearance", "theme", "reading-mode"]
}
```

### Response (`200 OK`)
Returns the complete updated preferences object:
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "uiMode": "dark",
    "colorTheme": "brainwave",
    "readingModeEnabled": true,
    "readingModeColorTemperature": 65,
    "textSize": "large",
    "sidebarDockItems": ["appearance", "theme", "reading-mode"]
  }
}
```

---

## TypeScript Contracts Import

All types and Zod schemas can be imported directly from `@veolms/contracts`:

```typescript
import {
  systemConfigResponseSchema,
  themeListResponseSchema,
  userPreferencesSchema,
  type SystemConfigResponse,
  type ThemePreset,
  type UserPreferences,
} from "@veolms/contracts";
```

---

## Frontend Integration Code Examples

### Example: Syncing Preference Changes (React Auto-Save Hook)

```typescript
import { useState, useCallback } from "react";
import type { UserPreferences } from "@veolms/contracts";

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  // Partial auto-save function
  const updatePreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    // 1. Optimistic state update in UI
    setPreferences((prev) => (prev ? { ...prev, ...updates } : updates));

    try {
      // 2. Persist to API
      const res = await fetch("/api/v1/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const json = await res.json();
      if (json.success) {
        setPreferences(json.data);
      }
    } catch (err) {
      console.error("Failed to auto-save preferences:", err);
    }
  }, []);

  return { preferences, updatePreferences };
}
```

### Example: Fetching Public System Config (React Router Loader)

```typescript
import { json } from "react-router";
import type { SystemConfigResponse } from "@veolms/contracts";

export async function loader() {
  const res = await fetch("http://localhost:4000/api/v1/system/config");
  const data = await res.json();

  if (!data.success) {
    throw new Error("Failed to load platform configuration");
  }

  return json<SystemConfigResponse>(data.data);
}
```
