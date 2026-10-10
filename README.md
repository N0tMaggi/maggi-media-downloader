# Maggi Media Downloader

![Hero Banner](./docs/hero-banner.svg)

<p align="center">
  <img src="./assets/safe.png" alt="Project Icon" width="96" />
</p>

<p align="center">
  <img alt="MV3" src="https://img.shields.io/badge/Chrome%20Extension-MV3-000000?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-000000?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-5.4-000000?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-2.1-000000?style=for-the-badge&logo=vitest&logoColor=white" />
  <img alt="Platforms" src="https://img.shields.io/badge/Platforms-TikTok%20%7C%20X%20(Twitter)%20Active-000000?style=for-the-badge" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-000000?style=for-the-badge" />
</p>

Chromium Manifest V3 multi-platform media downloader extension for TikTok and X (Twitter) featuring pure monochrome craft design, interactive media preview decks, native in-feed 1-click download actions, and typed background services.

## Overview
- **Zero AI-Slob Monochrome Aesthetic**: Pure black & white (`#000000` / `#ffffff`) high-craft design with crisp typography, subtle frosted borders, and live sight status indicators.
- **In-Feed & In-Tweet Native 1-Click Action**: Injects native download action buttons directly into TikTok's video action rails and X/Twitter's tweet action bars for instant watermark-free saving.
- **Interactive Preview Decks**: Built-in HTML5 video player, photo carousel slideshow with thumbnail ribbon, and audio soundtrack player with live equalizer.
- **High-Performance Sight Engine**: Instant 80ms viewport tracking and SPA history transitions with zero scroll lag across TikTok and X.
- **Platform Matrix**: **TikTok** (`https://api.maggi.dev/tiktok?url=...`) and **X / Twitter** (`https://api.maggi.dev/twitter?url=...`) fully active.
- **Backend Extractor**: Powered by `api.maggi.dev` with live author avatars, handles, and metadata resolution.
- **Customizable Preferences**: Dynamic filename templates with real-time token preview and quick-insert pills, theme modes, and per-media "Save As" prompts.

## Visual Previews

### Extension Popup
![Popup Preview](./docs/popup-preview.svg)

### Settings & Preferences
![Options Preview](./docs/options-preview.svg)

## Feature Set
- **In-Page Action Button**: 1-Click download directly inside TikTok's native feed without opening the extension popup. Deduplicated and isolated from comments.
- **Interactive Video Deck**: Preview HD videos before downloading with playback scrubbers, fullscreen mode, and direct MP4 saving without watermarks.
- **Photo Carousel Gallery**: View multi-slide photo posts, browse thumbnail strips, and download individual photos or the entire set at once.
- **Soundtrack Audio Player**: Dedicated audio deck with soundwave equalizer, author info, and direct MP3 extraction.
- **Real-Time Live Sight Indicator**: Live dot in the popup header shows whether the extension currently has a post in sight on the active tab.
- **Dynamic Filename Templating**: Customize filenames with tokens (`{author}`, `{id}`, `{type}`, `{index}`, `{title}`) with live preview in settings.
- **Quick Save Prompts**: One-click "Save As" folder prompt toggle right inside the popup and customizable in settings.
- **Multi-Platform Architecture**: Unified interface designed for TikTok with upcoming X (Twitter) support.

## Product Flow
```mermaid
flowchart LR
    A["TikTok Page / Feed"] --> B["Content Script (Sight Engine)"]
    B -->|In-Feed Button Click| D["Background Service Worker"]
    B -->|Context Detection| C["page/contextDetected"]
    C --> D
    D --> E["Provider Adapter"]
    E --> F["api.maggi.dev"]
    D --> G["chrome.storage.local"]
    D --> H["Popup UI (Preview Decks)"]
    H -->|Download Trigger| I["downloads/start"]
    I --> D
    D --> J["chrome.downloads API"]
```

## Live Update Flow
```mermaid
sequenceDiagram
    participant T as TikTok Feed / Modal
    participant C as Content Script
    participant B as Background
    participant P as Popup
    T->>C: Viewport scroll / SPA navigation
    C->>B: page/contextDetected (active video ID + author)
    B->>P: page/contextUpdated
    P->>B: media/resolve (api.maggi.dev)
    B->>P: ResolveResult (media streams, avatars, titles)
    P->>P: Render interactive preview deck
```

## Architecture Map
```mermaid
flowchart TD
    subgraph UI["Extension UI (Monochrome B&W)"]
        Popup["popup.html + src/popup/*"]
        Options["options.html + src/options/*"]
    end

    subgraph Runtime["Runtime Engine"]
        Background["src/background/main.ts"]
        Content["src/content/main.ts (In-Feed Button + Sight)"]
    end

    subgraph Shared["Shared Core"]
        Messages["messages.ts"]
        Provider["provider.ts (api.maggi.dev)"]
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

## Project Structure
```text
maggi-media-downloader/
├─ assets/
│  └─ safe.png
├─ docs/
│  ├─ hero-banner.svg       # Monochrome project banner
│  ├─ popup-preview.svg      # Monochrome popup UI preview
│  └─ options-preview.svg    # Monochrome settings UI preview
├─ src/
│  ├─ background/
│  │  └─ main.ts            # Download manager, context router, cache
│  ├─ content/
│  │  └─ main.ts            # Sight engine, in-feed button injection
│  ├─ options/
│  │  ├─ main.ts            # Settings controller, live token preview
│  │  └─ styles.css         # Monochrome settings styling
│  ├─ popup/
│  │  ├─ main.ts            # Interactive video/photo/audio preview decks
│  │  └─ styles.css         # Monochrome popup styling
│  └─ shared/
│     ├─ __tests__/         # Vitest unit test suite
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
- **TypeScript 5.9** (strict typing across messages, providers, and state)
- **Vite 5.4** & `@samrum/vite-plugin-web-extension`
- **Vitest 2.1**
- **Chrome Extension Manifest V3**

## Development & Build

### Prerequisites
- Node.js 18+
- npm

### Install Dependencies
```bash
npm install
```

### Type Checking & Unit Tests
```bash
npm run typecheck
npm test
```

### Production Build
```bash
npm run build
```
The production bundle is compiled into `dist/`.

### Load Extension in Chrome / Edge / Brave
1. Run `npm run build`.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `dist/` directory.

## Settings Defaults
| Setting | Default | Description |
|---|---|---|
| Theme | `dark` | Pure monochrome black & white theme |
| Filename template | `{author}-{id}-{type}` | Dynamic filename pattern with tokens |
| Auto-detect active video | Enabled | Follows active viewport video on feed scroll |
| In-feed download button | Enabled | 1-Click native circular button on video action rails |
| Save dialog for video | Enabled | Prompts folder location before `.mp4` download |
| Save dialog for audio | Enabled | Prompts folder location before `.mp3` download |
| Save dialog for images | Disabled | Saves photo set directly without repeated prompts |
| Debug logging | Disabled | Detailed logging in DevTools console |

## Permissions
| Permission | Purpose |
|---|---|
| `activeTab` | Access the active tab for viewport media detection |
| `tabs` | Query tab IDs and synchronize feed context |
| `storage` | Persist preferences, cache, and recent download jobs |
| `downloads` | Download watermark-free media files |

## License
MIT License. See [LICENSE.txt](./LICENSE.txt) for details.

## Author
Developed by **Maggi** ([@N0tMaggi](https://github.com/N0tMaggi)) • [maggi.dev](https://maggi.dev)
