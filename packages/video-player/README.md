# `@veolms/video-player`

Reusable React video-player primitives for VeoLMS. The package owns playback
engines, normalized media state, custom controls, timeline interactions,
chapters, storyboard previews, keyboard behavior, and presentation state. A
consuming application remains responsible for course-specific persistence,
analytics, completion rules, entitlement checks, and navigation.

This package is private to the VeoLMS workspace. Its current `build` script
type-checks the source; workspace consumers compile the TypeScript exports.

## Architecture

The package is deliberately split into four layers:

1. **Engine contract (`src/core`)** — `VideoEngine` defines one normalized API
   for loading, playback, tracks, quality selection, lifecycle, errors, and
   events. UI code never calls Shaka directly.
2. **Engine adapters (`src/engines`)** — `NativeVideoEngine` uses the browser
   media element; `ShakaVideoEngine` adds adaptive streaming and DRM plumbing
   while loading Shaka lazily.
3. **Controller and React composition (`src/react`)** — `PlayerController`
   combines engine state with presentation state. `PlayerRoot` provides that
   controller through context, and `VideoPlayer` assembles the default VeoLMS
   experience.
4. **UI and media metadata (`src/controls`, `src/timeline`, `src/chapters`,
   `src/storyboard`, `src/keyboard`)** — composable controls, custom timeline
   behavior, deterministic chapter/storyboard helpers, and active-player
   keyboard arbitration.

The engine snapshot and UI snapshot are intentionally separate. Playback state
such as `currentTime`, buffering, selected tracks, and errors comes from the
engine; settings-menu state, scrubbing, fullscreen, picture-in-picture,
theater mode, and HUD state belongs to the player controller.

## Consumer setup

Add the workspace dependency to the consuming package:

```json
{
  "dependencies": {
    "@veolms/video-player": "workspace:*"
  }
}
```

Import the package CSS once in the application stylesheet:

```css
@import "tailwindcss";
@import "@veolms/video-player/styles.css";

/* Adjust this relative path for the consuming application. */
@source "../../../packages/video-player/src";
```

The `@source` directive is required because the controls use Tailwind utility
classes from outside the application directory.

## High-level usage

`VideoPlayer` is the normal entry point. It uses the custom VeoLMS controls and
the lazy Shaka engine by default.

```tsx
import { useMemo } from "react";
import {
  VideoPlayer,
  type TimelineMarker,
  type VideoSource,
} from "@veolms/video-player";

const markers: TimelineMarker[] = [
  {
    id: "quiz-closures",
    time: 95,
    type: "quiz",
    label: "Knowledge check",
    metadata: { quizId: "closures-1" },
  },
];

export function LessonPlayer() {
  // Memoization is still recommended. Equivalent source values are compared
  // deeply enough to avoid a reload when a parent recreates this object.
  const source = useMemo<VideoSource>(
    () => ({
      id: "lesson-design-mindset-v1",
      src: "/media/design-mindset.mp4",
      kind: "file",
      type: "video/mp4",
      metadata: {
        title: "The Design Mindset",
        poster: "/media/design-mindset.webp",
      },
      textTracks: [
        {
          src: "/captions/design-mindset.en.vtt",
          language: "en",
          label: "English",
          kind: "captions",
        },
      ],
    }),
    [],
  );

  return (
    <VideoPlayer
      source={source}
      markers={markers}
      description={`00:00 Introduction\n01:35 Why mindset matters\n04:10 Recap`}
      storyboard="/storyboards/design-mindset.vtt"
      accentColor="#ff7a1a"
      onProgress={({ currentTime, duration, progress }) => {
        // Persist or report lesson progress in the application layer.
        console.log({ currentTime, duration, progress });
      }}
      onPlayerError={(error) => console.error(error)}
    />
  );
}
```

Important high-level props include:

- `source`: stable `VideoSource` describing the media and engine configuration.
- `engine`: `"shaka"` (default) or `"native"`.
- `engineFactory`: inject a custom engine instead of the built-in selection.
- `chapters`, `manualChapters`, and `description`: chapter sources with explicit
  precedence described below.
- `storyboard`: a VTT URL, an array of frames, or a `StoryboardTrack`.
- `storyboardLoader`: override authenticated storyboard loading without coupling
  the package to an application HTTP client. The default loader also honors the
  source networking hooks with request type `thumbnail`.
- `markers`: arbitrary typed events displayed on the timeline.
- `controls`: omit for defaults, pass `false` to hide them, or pass a composed
  control tree.
- `overlays`: application-specific content rendered above the media.
- `shortcuts`: replace or disable individual keyboard bindings.
- `onEvent`: the normalized engine and presentation event stream.
- `onProgress` and `onProgressChange`: time/duration/percentage callbacks for
  application-owned progress behavior.
- `theaterMode` and `onTheaterModeChange`: controlled theater presentation.
- `lockLandscapeOnFullscreen`: optionally request landscape orientation while
  fullscreen; browser refusal is non-fatal.
- `theme`: a built-in theme id (`youtube`, `aurora`, or `minimal`) or a custom
  `PlayerThemeDefinition` that replaces player-only tokens and semantic icons.

The forwarded player ref implements `VideoPlayerHandle` and exposes playback,
seeking, volume, quality/track selection, fullscreen, picture-in-picture,
focus, reload, and `getSnapshot()` operations.

## Player-only themes and icon packs

Themes belong to the video-player package, not to the consuming application's
site theme. The current pill-based experience is the default `youtube` theme;
`aurora` uses expressive duotone controls and violet/cyan surfaces, while
`minimal` uses compact monochrome geometry. All three keep identical playback,
keyboard, accessibility, and menu behavior:

```tsx
<VideoPlayer source={source} theme="aurora" />
```

Headless compositions use the same API on `PlayerRoot`. Controls rendered
inside the root read the selected definition through `usePlayerTheme()`.

Create a product-specific theme by extending a built-in definition. Tokens are
CSS custom properties on the player root, and icon overrides are semantic, so
consumers never need to fork control components:

```tsx
import {
  createPlayerTheme,
  type PlayerThemeIconProps,
} from "@veolms/video-player";

function BrandPlayIcon({ active: _active, ...props }: PlayerThemeIconProps) {
  return (
    <svg {...props} viewBox="0 0 24 24">
      {/* brand artwork */}
    </svg>
  );
}

const brandTheme = createPlayerTheme({
  id: "brand",
  label: "Brand",
  base: "minimal",
  tokens: {
    accent: "#22c55e",
    controlRadius: "12px",
  },
  icons: { play: BrandPlayIcon },
});

<VideoPlayer source={source} theme={brandTheme} />;
```

`createPlayerTheme` fills omitted tokens, icons, and motion values from its
base. `PLAYER_THEME_OPTIONS` exposes built-in labels/descriptions for settings
UIs, while `getPlayerThemeStyle` is available for compact visual previews.

## Public API

The root export groups the supported surface as follows:

| Area                 | Main exports                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| High-level React     | `VideoPlayer`, `VideoPlayerProps`, `VideoPlayerHandle`                                                     |
| Headless composition | `PlayerRoot`, `PlayerMedia`, `usePlayerController`, `usePlayerState` and focused selector hooks            |
| Engines              | `VideoEngine`, `NativeVideoEngine`, `ShakaVideoEngine`, normalized source/snapshot/event/error types       |
| Controls             | play, seek, mute, volume, time, settings, PiP, theater, fullscreen, menus, overlays, and `DefaultControls` |
| Timeline             | `Timeline`, `TimelinePreview`, marker/range types, and pure positioning helpers                            |
| Chapters             | normalization, description parsing, precedence resolution, and active-chapter lookup                       |
| Storyboards          | VTT parsing, thumbnail lookup, frame and track types                                                       |
| Keyboard             | default bindings, arbiter/controller helpers, and override types                                           |
| Accessibility        | `formatMediaTime`                                                                                          |

`@veolms/video-player/shaka` exposes the Shaka adapter directly, and
`@veolms/video-player/testing` is reserved for package testing helpers.

## Engine selection

### Shaka (default)

Use Shaka for DASH, HLS, adaptive bitrate selection, multiple audio/text
tracks, or protected content:

```tsx
<VideoPlayer engine="shaka" source={dashSource} />
```

`ShakaVideoEngine` dynamically imports `shaka-player` when a media element is
attached. Importing the React package does not eagerly initialize the Shaka
runtime or Shaka's UI library. The adapter installs Shaka polyfills, verifies
browser support, normalizes variants/tracks/errors into package types, and
unregisters networking filters during unload/detach/destroy.

### Native

Use the native engine for simple, unprotected files when adaptive track and DRM
features are unnecessary:

```tsx
<VideoPlayer engine="native" source={mp4Source} />
```

The native engine supports progressive files and formats the browser can play
natively (including native HLS where available). It manages external text-track
elements but deliberately rejects a source containing DRM configuration.
Quality selection and adaptive streaming are not synthesized for native files.

## Sources, streaming, DRM, and networking

`VideoSource` is the complete load boundary. Prefer an explicit `kind` and MIME
`type`, especially when a URL has no useful extension.

```tsx
import type { VideoSource } from "@veolms/video-player";

const accessToken = "short-lived-token";

const protectedDashSource: VideoSource = {
  id: "course-42-lesson-7-v3",
  src: "https://cdn.example.com/lesson/manifest.mpd",
  kind: "dash",
  type: "application/dash+xml",
  startTime: 28.5,
  drm: {
    preferredSystems: ["widevine", "playready", "fairplay"],
    widevine: {
      licenseUrl: "https://license.example.com/widevine",
      videoRobustness: ["SW_SECURE_DECODE"],
    },
    playready: {
      licenseUrl: "https://license.example.com/playready",
    },
    fairplay: {
      licenseUrl: "https://license.example.com/fairplay",
      certificateUrl: "https://license.example.com/fairplay.cer",
      getContentId: (skdUri) => new URL(skdUri).hostname,
    },
  },
  networking: {
    requestFilter: (request) => {
      if (request.type === "license") {
        request.headers.Authorization = `Bearer ${accessToken}`;
      }
    },
    manifestRetry: {
      maxAttempts: 3,
      baseDelayMs: 500,
      backoffFactor: 2,
      timeoutMs: 15_000,
    },
    segmentRetry: {
      maxAttempts: 4,
      baseDelayMs: 300,
      stallTimeoutMs: 10_000,
      connectionTimeoutMs: 8_000,
    },
    licenseRetry: {
      maxAttempts: 2,
      baseDelayMs: 500,
      timeoutMs: 10_000,
    },
  },
  streaming: {
    bufferingGoal: 20,
    rebufferingGoal: 3,
    bufferBehind: 30,
    abrEnabled: true,
    abrRestrictions: { maxHeight: 1080 },
  },
};
```

Supported DRM configuration includes Widevine, PlayReady, FairPlay certificate
and init-data hooks, preferred key systems, robustness values, and clear keys.
Request and response filters receive normalized request kinds (`manifest`,
`segment`, `license`, `text`, `thumbnail`, or `other`) and may mutate headers,
URIs, credentials, body, and response data before they return. Filters can be
asynchronous.

Retry values are expressed in milliseconds at the package boundary and mapped
to Shaka manifest, streaming-segment, and DRM-license retry configuration.
Authentication refresh and entitlement policy remain the application's
responsibility; implement them in a request filter or before constructing the
source.

## Custom timeline and markers

`Timeline` is a custom pointer/touch/keyboard control, not a styled native range
input. It renders played progress, normalized buffered ranges, chapter
boundaries, arbitrary markers, a custom thumb, and an optional hover/scrub
preview. It supports:

- pointer capture for drag seeking;
- `Arrow` keys for five-second seeks;
- `PageUp`/`PageDown` for ten-percent seeks;
- `Home` and `End` for timeline boundaries;
- accessible slider values and human-readable elapsed/duration text;
- previews clamped near the visual edges of the track.

Markers are intentionally domain-neutral:

```tsx
const markers = [
  {
    id: "note-17",
    time: 132,
    type: "note",
    label: "Your note",
    metadata: { noteId: "17" },
  },
] satisfies TimelineMarker<{ noteId: string }>[];

<VideoPlayer source={source} markers={markers} />;
```

Selecting a default marker seeks to its time. Use `type` and `metadata` in a
custom timeline or surrounding application UI when markers need different
appearance or actions. Pure helpers such as `normalizeBufferedRanges`,
`pointerPositionToTime`, `timeToPositionPercent`, and
`positionTimelineMarkers` are exported for alternate timelines.

## Chapters

Chapter resolution uses exactly one source in this order:

1. `manualChapters`
2. `chapters` (metadata supplied by the caller)
3. timestamps parsed from `description`

An empty or entirely invalid higher-priority source falls through to the next
source. Normalization trims titles, drops invalid entries and duplicate start
times, sorts by time, produces stable IDs, derives each end time from the next
chapter, and uses the known media duration for the final chapter.

The description parser accepts a timestamp followed by a title in `MM:SS` or
`HH:MM:SS` form. Optional bullets or numbered-list prefixes are supported:

```text
00:00 Welcome
- 02:15 Setup
3. 01:04:30 Final review
```

Incidental numbers, URLs, negative values, malformed timestamps, and lines
without titles are ignored. `parseChaptersFromDescription`,
`normalizeChapters`, `resolveChapters`, and `getActiveChapter` are exported for
server preprocessing or custom presentation.

## Storyboard previews

Pass one of these forms to `storyboard`:

- a URL to a WebVTT storyboard;
- a `readonly StoryboardFrame[]`;
- `{ frames: StoryboardFrame[] }`.

For a VTT URL, the package fetches and parses the document and resolves relative
image URLs against the VTT URL. Both one-image-per-cue and sprite fragments are
supported:

```text
WEBVTT

00:00.000 --> 00:05.000
sheet-01.jpg#xywh=0,0,160,90

00:05.000 --> 00:10.000
sheet-01.jpg#xywh=160,0,160,90
```

`getThumbnailAtTime` returns a frame only when its half-open cue range contains
the requested time; gaps return `null` rather than showing a stale frame.
`onStoryboardError` reports fetch/parse failures without turning them into a
fatal playback error.

The default URL loader resolves both VTT URLs and cue image paths against the
document/VTT URL. It runs the same normalized networking hooks as media loads,
using `thumbnail` as the request kind, so an application can add authorization,
credentials, refreshed URLs, or response transformations. Supply a
`storyboardLoader` when a different transport or cache is required.

## Headless composition and custom controls

Use `PlayerRoot` and `PlayerMedia` when the default assembly is not suitable:

```tsx
import {
  DefaultControls,
  NativeVideoEngine,
  PlayerMedia,
  PlayerRoot,
} from "@veolms/video-player";

<PlayerRoot
  source={source}
  engineFactory={() => new NativeVideoEngine()}
  className="relative aspect-video overflow-hidden bg-black"
>
  <PlayerMedia className="size-full object-contain" />
  <DefaultControls />
</PlayerRoot>;
```

All control hooks must run inside `PlayerRoot`. To add a control, select the
smallest necessary state and invoke the controller:

```tsx
import {
  DefaultControls,
  PlayerIconButton,
  usePlayerController,
  usePlayerState,
} from "@veolms/video-player";

function SkipIntroButton() {
  const controller = usePlayerController();
  const currentTime = usePlayerState(({ media }) => media.currentTime);

  return (
    <PlayerIconButton
      label="Skip intro"
      icon={<span aria-hidden>+30</span>}
      disabled={currentTime >= 30}
      onClick={() => controller.seekTo(30)}
    />
  );
}

<VideoPlayer
  source={source}
  controls={<DefaultControls leadingControls={<SkipIntroButton />} />}
/>;
```

Focused hooks (`usePlaybackState`, `useCurrentTime`, `useDuration`,
`useVolume`, `useQuality`, `useTracks`, and `useChapters`) cover common cases.
Use `usePlayerState(selector, equality?)` for custom state projections.

## Adding an engine

Implement the exported `VideoEngine` interface when integrating another media
backend. A conforming engine must:

1. attach/detach one `HTMLMediaElement` and clean up listeners deterministically;
2. implement load/unload/destroy lifecycle methods;
3. expose a complete immutable `VideoEngineSnapshot`;
4. normalize engine-specific errors to `VideoEngineError` categories;
5. implement playback, quality, audio, and text-track commands (or expose empty
   capability/track results when a feature is unavailable);
6. emit the typed `VideoEngineEventMap` events and return an unsubscribe
   function from `on`.

Inject the engine without changing player UI:

```tsx
<VideoPlayer
  source={source}
  engineFactory={() => new CompanyCdnVideoEngine()}
/>
```

Keep provider SDK types and behavior inside the adapter. Do not leak them into
controls, application adapters, or `VideoSource` consumers.

## Keyboard and accessibility

Only the active player handles document-level shortcuts, so multiple mounted
players do not respond together. Editable elements are ignored. Defaults are:

| Action             | Shortcut                                |
| ------------------ | --------------------------------------- |
| Play/pause         | `Space`, `K`                            |
| Seek 5 seconds     | `Left`, `Right`                         |
| Seek 10 seconds    | `J`, `L`                                |
| Mute               | `M`                                     |
| Captions           | `C`                                     |
| Fullscreen         | `F`                                     |
| Theater            | `T`                                     |
| Picture-in-picture | `I`                                     |
| Start/end          | `Home`, `End`                           |
| Percentage         | `Alt+0` through `Alt+9`                 |
| Playback speed     | `Shift+,`, `Shift+.`, or shifted arrows |

Override one action with bindings or disable it with `false`:

```tsx
<VideoPlayer
  source={source}
  shortcuts={{
    toggleTheaterMode: false,
    seekForward: ["ArrowRight", "Ctrl+ArrowRight"],
  }}
/>
```

Controls use native buttons, visible focus styles, names/titles, pressed state
where relevant, and a keyboard-operable timeline. Menus expose menu semantics
and keyboard focus behavior. Motion-heavy transitions honor reduced-motion
preferences. Applications must still supply a meaningful `ariaLabel`, accurate
track labels/languages, and accessible labels for domain-specific markers and
custom controls.

## Events and application policy

`onEvent` receives normalized engine events (`loadstart`, `loaded`, playback,
time, seek, buffering, volume/rate, quality/track, manifest, and error events)
plus presentation events for fullscreen, picture-in-picture, theater, and
control visibility.

The package does not decide when a lesson is complete or where playback state
is stored. A VeoLMS adapter should translate events into domain policy. This
keeps the player reusable in lesson pages, previews, embeds, and future apps.

## Incremental app migration

Migrate through an application-owned adapter rather than replacing the legacy
call site with package internals:

1. Add `@veolms/video-player` and its styles/Tailwind source to the web app.
2. Create a learning-feature adapter that translates the existing course video
   model to a stable `VideoSource`.
3. Preserve app-owned behavior in that adapter: first-play consent, lesson-change
   autoplay rules, resume position, mute/ambient preferences, captions,
   completion thresholds, progress persistence, theater state, and analytics.
4. Run the existing player behavior tests against the adapter, then add engine,
   timeline, accessibility, and responsive interaction coverage.
5. Switch one lesson-player call site while retaining the legacy implementation
   as a short-lived rollback path.
6. Remove the legacy player only after parity is verified on desktop, touch
   devices, fullscreen, and supported streaming/DRM providers.

This boundary prevents course-domain state from becoming part of the reusable
package and makes rollback possible during rollout.

### VeoLMS parity checklist

The first learning-page adapter preserves the behavior audited from the legacy
player:

- initial-play consent and user-selected-lesson autoplay policy;
- play/pause, mute, volume, playback rate, five/ten-second seeking, start/end,
  percentage seeking, captions, PiP, fullscreen, and theater shortcuts;
- full-player fullscreen with guarded mobile landscape locking;
- paused/settings/scrubbing/focus-aware control visibility and central/HUD
  feedback;
- lesson resume position, throttled progress persistence, completion reporting,
  muted and ambient-mode preferences, and caption preference across lessons;
- application-owned ambient projection and theater-layout behavior;
- English VTT mapping and normalized progress/error callbacks.

Legacy course-specific persistence remains in the learning adapter. Other
standalone `<video>` uses (such as course trailers and uploaded attachment
previews) are intentionally outside this migration.

## Development and verification

From the repository root:

```powershell
pnpm --filter @veolms/video-player typecheck
pnpm --filter @veolms/video-player test
pnpm --filter @veolms/video-player build
```

Or from `packages/video-player`:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Tests use Vitest and jsdom. Current focused suites cover engine lifecycle and
normalization, Shaka configuration/filter behavior, menus, keyboard arbitration
and shortcuts, chapter parsing/precedence, storyboard parsing and lookup,
timeline math, typed events, and accessible time formatting. Add tests beside
the module under test and avoid real provider/network dependencies in unit
suites.

## Milestone 1 boundaries

Milestone 1 establishes the package boundary, custom React UI, engine
abstraction, lazy Shaka integration, adaptive track controls, DRM/networking
configuration surfaces, custom timeline, markers, chapters, storyboard VTT
previews, normalized events/errors, accessibility behavior, and an incremental
migration path.

The following are intentionally not claimed complete yet:

- **Real DRM/provider validation.** Widevine, PlayReady, and FairPlay plumbing
  exists, but production license servers, certificates, token refresh,
  packaging profiles, CORS, device matrices, and provider-specific transforms
  must be validated with real protected streams.
- **Advanced filmstrip generation.** Milestone 1 consumes prepared storyboard
  frames or WebVTT sprite metadata; it does not generate thumbnails, prefetch
  adaptive filmstrips, or manage a thumbnail CDN pipeline.
- **Manual chapter creator/editor.** Chapter data can be supplied, parsed, and
  displayed, but authoring, drag/reorder, validation UI, and persistence belong
  to a later authoring milestone.
- **Provider analytics and offline playback.** The normalized event stream is
  ready for application analytics, but no provider-specific telemetry, QoE
  aggregation, download, or offline-license workflow is included.

Treat these as explicit follow-up work, not as hidden guarantees of the current
API.
