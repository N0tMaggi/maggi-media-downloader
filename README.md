# Maggi Media Downloader

![Hero Banner](./docs/hero-banner.svg)

<p align="center">
  <img src="./assets/safe.png" alt="Project Icon" width="96" />
</p>

<p align="center">
  <img alt="MV3" src="https://img.shields.io/badge/Chrome%20Extension-MV3-111827?style=for-the-badge&logo=googlechrome" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-2563EB?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5.4-7C3AED?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-2.1-16A34A?style=for-the-badge&logo=vitest&logoColor=white" />
  <img alt="Platforms" src="https://img.shields.io/badge/Platforms-TikTok%20%7C%20X%20(Upcoming)-FE2C55?style=for-the-badge" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-F59E0B?style=for-the-badge" />
</p>

Chromium MV3 multi-platform media downloader extension for TikTok and X (Twitter) with real-time video/photo interactive previews and typed background services.

## Overview
- Modern interactive glassmorphic UI (HTML5 video player, photo slideshow gallery with thumbnail ribbon, soundtrack audio player with equalizer).
- High-performance, low-overhead content detection for SPA feed navigation.
- Platform support: TikTok (fully supported) & X/Twitter (roadmap integration ready).
- Provider adapter for `api.maggi.dev`.
- Cache, recent jobs, customizable filename templates, and theme settings.

## Visual Preview
![Popup Preview](./docs/popup-preview.svg)

## Feature Set
- **Interactive Previews**: Watch videos, browse photo carousel slides, and listen to audio soundtracks directly in the popup before downloading.
- **Selective Downloads**: Download single slides from a photo set or batch-download all photos.
- **Fast Content Detection**: Intercepts SPA history transitions with zero scroll lag.
- **Flexible File Naming**: Configurable tokens `{author}`, `{id}`, `{type}`, `{index}`, `{title}`.
- **Quick Settings**: Instant "Save As" toggle right inside the popup.
- **Multi-Platform Support**: Built for TikTok with architecture ready for X (Twitter).

## Product Flow
```mermaid
flowchart LR
    A["TikTok Page"] --> B["Content Script"]
    B --> C["page/contextDetected"]
    C --> D["Background Service Worker"]
    D --> E["Provider Adapter"]
    E --> F["api.maggi.dev"]
    D --> G["chrome.storage.local"]
    D --> H["Popup UI"]
    H --> I["downloads/start"]
    I --> D
    D --> J["chrome.downloads"]
```

## Live Update Flow
```mermaid
sequenceDiagram
    participant T as TikTok SPA / Feed
    participant C as Content Script
    participant B as Background
    participant P as Popup
    T->>C: URL changes / feed visibility changes
    C->>B: page/contextDetected
    B->>P: page/contextUpdated
    P->>B: media/resolve
    B->>P: ResolveResult
    P->>P: Re-render preview + actions
```

## Architecture Map
```mermaid
flowchart TD
    subgraph UI["Extension UI"]
        Popup["popup.html + src/popup/*"]
        Options["options.html + src/options/*"]
    end

    subgraph Runtime["Runtime"]
        Background["src/background/main.ts"]
        Content["src/content/main.ts"]
    end

    subgraph Shared["Shared Modules"]
        Messages["messages.ts"]
        Provider["provider.ts"]
        Storage["storage.ts"]
        TikTok["tiktok.ts"]
        Theme["theme.ts"]
        Files["filename.ts"]
        Types["types.ts"]
        Settings["settings.ts"]
        Logger["logger.ts"]
    end

    Popup --> Messages
    Options --> Settings
    Options --> Theme
    Content --> TikTok
    Content --> Messages
    Background --> Messages
    Background --> Provider
    Background --> Storage
    Background --> Files
    Background --> Types
```

## Project Map
```text
maggi-media-downloader/
├─ assets/
│  └─ safe.png
├─ docs/
│  ├─ hero-banner.svg
│  └─ popup-preview.svg
├─ src/
│  ├─ background/
│  │  └─ main.ts
│  ├─ content/
│  │  └─ main.ts
│  ├─ options/
│  │  ├─ main.ts
│  │  └─ styles.css
│  ├─ popup/
│  │  ├─ main.ts
│  │  └─ styles.css
│  └─ shared/
│     ├─ __tests__/
│     │  ├─ filename.test.ts
│     │  ├─ provider.test.ts
│     │  └─ tiktok.test.ts
│     ├─ filename.ts
│     ├─ logger.ts
│     ├─ messages.ts
│     ├─ provider.ts
│     ├─ settings.ts
│     ├─ storage.ts
│     ├─ theme.ts
│     ├─ tiktok.ts
│     └─ types.ts
├─ LICENSE.txt
├─ manifest.json
├─ options.html
├─ package.json
├─ popup.html
├─ README.md
├─ tsconfig.json
└─ vite.config.ts
```

## Tech Stack
- TypeScript
- Vite
- `@samrum/vite-plugin-web-extension`
- Vitest
- Chrome Extension Manifest V3 APIs

## Core Runtime Pieces
### Background
- Caches resolved media by normalized TikTok URL.
- Starts browser downloads and records recent jobs.
- Stores and serves settings and active page context.
- Broadcasts page-context updates to an open popup.

### Content Script
- Detects active TikTok video/photo posts.
- Tracks SPA transitions, DOM mutations, scrolling, and direct URL changes.
- Sends context updates and clear events to the background.
- Renders a small quick-action chip when enabled.

### Popup
- Loads the active post or manual URL.
- Displays preview data, metadata, and recent jobs.
- Starts video/audio/photo downloads.
- Updates live when the active TikTok post changes.

### Options
- Controls theme, filename template, page-action visibility, and save-as defaults.
- Writes settings back to `chrome.storage.local`.
- Shows live theme preview while editing.

## Settings Defaults
| Setting | Default |
|---|---|
| Theme | `system` |
| Filename template | `{author}-{id}-{type}` |
| Auto-detect active TikTok tab | Enabled |
| Show in-page action | Enabled |
| Save dialog for video | Enabled |
| Save dialog for audio | Enabled |
| Save dialog for images | Disabled |
| Debug logging | Disabled |

## Storage Model
```mermaid
flowchart LR
    A["settings"] --> B["theme / filenameTemplate / defaults"]
    C["cache"] --> D["normalized TikTok URL -> resolved media"]
    E["recentJobs"] --> F["download metadata history"]
    G["pageContexts"] --> H["tabId -> active detected TikTok post"]
```

## Development
### Install
```bash
npm install
```

### Run Checks
```bash
npm run typecheck
npm test
```

### Build
```bash
npm run build
```

### Load In Browser
1. Run `npm run build`.
2. Open Chrome or Edge.
3. Open the extensions page.
4. Enable developer mode.
5. Load the unpacked extension from `dist/`.

## Available Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev workflow |
| `npm run typecheck` | TypeScript validation |
| `npm test` | Vitest unit tests |
| `npm run build` | Production extension build |

## Testing
- Unit tests cover TikTok URL normalization and content-type detection.
- Unit tests cover filename-template expansion and extension assignment.
- Unit tests cover provider-payload mapping and invalid-response handling.
- Test files live under `src/shared/__tests__/`.

## Security Notes
- Download filenames are sanitized before being passed to `chrome.downloads`.
- Default UI does not expose a verbose terminal/log console.
- Host permissions are limited to TikTok and the configured provider domain.
- Persisted data stays in `chrome.storage.local`.
- Dependency audit currently reports build-time advisories that require breaking Vite/plugin upgrades rather than a safe in-place patch.

## Permissions
| Permission | Why it is needed |
|---|---|
| `activeTab` | Access the current tab for popup detection |
| `tabs` | Query active tab and tab IDs for context sync |
| `storage` | Persist settings, cache, page contexts, recent jobs |
| `downloads` | Start file downloads |

## Manifest Surface
| Surface | Entry |
|---|---|
| Background service worker | `src/background/main.ts` |
| Content script | `src/content/main.ts` |
| Popup page | `popup.html` -> `src/popup/main.ts` |
| Options page | `options.html` -> `src/options/main.ts` |

## License
This project is licensed under the MIT License.

See [LICENSE.txt](./LICENSE.txt) for the full text.

## Credits
- Original project name and icon branding: Maggi
- Extension build system: Vite + `@samrum/vite-plugin-web-extension`
- Testing: Vitest
