# OpenCut

**Edit videos online. Completely free.**

OpenCut is a desktop-first, local-first browser video editor. The project model is the source of truth: timeline edits are non-destructive instructions, preview interprets that model, and export renders the same composition rather than downloading the original source media.

## Current MVP

Working source implementation includes:

- React + TypeScript + Vite application structure
- Local project dashboard and new-project canvas presets
- IndexedDB persistence with Dexie for project state and imported media blobs
- Real video/audio/image import with browser metadata extraction and video/image thumbnails
- Multi-track timeline with seconds as the source of truth
- Drag media to a precise timeline position
- Clip selection, movement, left/right trim, split, delete, duplicate, snapping
- Undo/redo with transaction grouping for pointer drags and trims
- Canvas 2D preview compositor with track Z-order
- Video/image transforms: position, scale, rotation, opacity
- Video effects: brightness, contrast, saturation, grayscale
- Text clips rendered into the same canvas compositor
- Audio/video-source playback, volume, mute and fades (browser media-element path)
- Crossfade, fade, slide-left, and slide-right transitions between visual clips
- Autosave and restore from IndexedDB
- Keyboard shortcuts
- Browser capability detection
- Real browser-native export using Canvas `captureStream()`, Web Audio routing, and `MediaRecorder`
- Dynamic MP4/WebM recording format selection based on `MediaRecorder.isTypeSupported()`

## Export behavior

This build uses a **real-time export path**. OpenCut renders the project-resolution canvas while source media follows the master timeline clock, captures the canvas stream, mixes available media audio through Web Audio, and records the result with `MediaRecorder`.

This is a genuine composition export: trims, split placement, transforms, text, effects, transitions, track visibility, volume and fades are applied to the output. It does **not** download the original source as a fake export.

The exact output container depends on the browser. OpenCut tries compatible MP4 recording first and falls back to WebM when MP4 recording is unavailable. Keep the tab active while a real-time export is running.

## Known MVP limitations

- Browser codec/container support varies. Some browsers will export WebM rather than MP4.
- Export currently uses the project canvas resolution; separate 480p/720p/1080p rescaling presets are not exposed yet.
- Real-time export is slower than a WebCodecs/offline encoder pipeline by design.
- Preview audio uses HTML media elements, so gain above 100% is intentionally not exposed in this MVP.
- Audio waveform generation is not implemented yet.
- Missing-media relink UI is not implemented yet; stored blobs are restored from IndexedDB when available.
- Crop UI/logic is not implemented yet.
- Playwright E2E coverage is not included in this build; timeline unit tests are included.
- Very large projects are constrained by browser memory and IndexedDB quota.
- Mobile editing is not targeted. The editor is designed for desktop/laptop widths.

## Requirements

- Node.js 20.19+ or 22.12+ (required by Vite 8; Node 22 LTS recommended)
- npm 10+
- A current Chromium, Firefox, or Safari browser. Chromium generally provides the broadest media support.

## Install and run

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

Production checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

The app uses `HashRouter`, so a static host does not need SPA rewrite rules for editor project URLs.

## Testing

Unit tests in `tests/unit/timeline.test.ts` cover time/pixel mapping, frame conversion, left/right trim, split continuity, source-time mapping, movement, duplicate/delete, project duration and snapping.

A dependency-free smoke test also lives at `tests/core-smoke.cjs`. It is mainly useful for validating timeline math in constrained build environments.

## Core keyboard shortcuts

| Shortcut | Action |
|---|---|
| Space | Play / pause |
| S | Split selected clip at playhead |
| Delete / Backspace | Delete selected clip |
| Ctrl/Cmd + Z | Undo |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + D | Duplicate |
| Ctrl/Cmd + S | Save locally |
| + / - | Timeline zoom |
| Left / Right | Step one project frame |
| Shift + Left / Right | Step 10 frames |
| N | Toggle snapping |

Shortcuts that could interfere with typing are ignored while an input, textarea, or contenteditable element is active.

## Architecture

```text
src/
├── app/                 # Routes, home/dashboard
├── database/            # Dexie DB + repositories
├── editor/
│   ├── media/           # Import/probe UI
│   ├── preview/         # Canvas preview + transform overlay
│   ├── properties/      # Clip/text/effect properties
│   ├── timeline/        # Ruler, tracks, clips, drag/trim interactions
│   └── transitions/     # Transition UI
├── engine/
│   ├── export/          # Real MediaRecorder export engine
│   └── rendering/       # Clip media pool + shared FrameComposer
├── hooks/               # Playback, autosave, shortcuts
├── store/               # Zustand project/editor/history state
├── types/               # Serializable project model
├── utils/               # Timeline math, IDs, capabilities
└── styles/              # Design tokens + editor CSS
```

### Data boundaries

1. **Serializable project metadata** — Zustand + IndexedDB.
2. **Imported binary media** — IndexedDB blob table, not undo/history snapshots.
3. **Runtime media resources** — object URLs and HTML media elements in `MediaRegistry` / `ClipMediaPool`.
4. **UI state** — playhead, selection, zoom, save status and history stacks.

Time is stored in seconds. Pixel positions are only a timeline view transform (`seconds × pixelsPerSecond`).

## Deployment

`npm run build` produces a static `dist/` directory suitable for Vercel, Netlify, Cloudflare Pages or static Nginx. The current MVP does not require cross-origin isolation because it does not use multithreaded FFmpeg/SharedArrayBuffer as a primary path.

## Privacy

OpenCut does not include authentication, analytics, cloud storage, subscriptions, payment providers, watermarks or a server upload path in this MVP. Imported files are handled through browser APIs and IndexedDB.

## MP4 Export and Preview Stability Update

This build adds an explicit **MP4 (H.264)** option in the Export dialog.

- When the browser can record MP4 directly with `MediaRecorder`, OpenCut uses the native path.
- When native MP4 recording is unavailable but WebM recording works, OpenCut records the composed timeline as WebM and then converts it locally to MP4 with `ffmpeg.wasm`.
- The FFmpeg core is lazy-loaded only when the MP4 fallback is required. The fallback downloads processing code, not your media; source media remains on the device.
- WebM remains available as a direct export option where supported.

The editor preview compositor also uses an off-screen back buffer and a last-good-frame cache for video layers. Stale asynchronous renders are prevented from overwriting newer frames, and short decode/seek gaps retain the previous valid frame instead of briefly clearing the visible preview. This substantially reduces the black/background blinking that could occur during playback and scrubbing.
