import "./styles.css";
import { describeContentType, isTikTokUrl } from "../shared/tiktok";
import { setDebugLogging } from "../shared/logger";
import { applyTheme } from "../shared/theme";
import { buildDownloadFilename } from "../shared/filename";
import type {
  ExtensionEvent,
  MessageResponse,
  RecentJobsResponse,
  SettingsResponse,
} from "../shared/messages";
import type {
  DownloadKind,
  ExtensionSettings,
  PageContext,
  RecentJob,
  ResolveResult,
  ResolvedMedia,
} from "../shared/types";

type ActiveTab = "preview" | "manual" | "history";

interface PopupState {
  activeTab: ActiveTab;
  status: { tone: "default" | "success" | "error" | "busy"; text: string };
  media: ResolvedMedia | null;
  cacheHit: boolean;
  cacheAge: number;
  settings: ExtensionSettings | null;
  recentJobs: RecentJob[];
  sourceMode: "active-tab" | "manual";
  sourceUrl: string;
  busy: boolean;
  activePhotoIndex: number;
  promptSaveAs: boolean;
}

const state: PopupState = {
  activeTab: "preview",
  status: {
    tone: "default",
    text: "Ready.",
  },
  media: null,
  cacheHit: false,
  cacheAge: 0,
  settings: null,
  recentJobs: [],
  sourceMode: "active-tab",
  sourceUrl: "",
  busy: false,
  activePhotoIndex: 0,
  promptSaveAs: false,
};

let previewAudioElement: HTMLAudioElement | null = null;
let isAudioPlaying = false;

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Popup root element is missing.");
}
const app = appRoot;

function stopAudioPreview(): void {
  if (previewAudioElement) {
    previewAudioElement.pause();
    previewAudioElement.currentTime = 0;
    previewAudioElement = null;
    isAudioPlaying = false;
  }
}

function toggleAudioPreview(url: string): void {
  if (previewAudioElement && isAudioPlaying) {
    stopAudioPreview();
    updateAudioDeckState();
    return;
  }

  stopAudioPreview();
  previewAudioElement = new Audio(url);
  previewAudioElement.volume = 0.85;

  previewAudioElement.onplay = () => {
    isAudioPlaying = true;
    updateAudioDeckState();
  };

  previewAudioElement.onpause = () => {
    isAudioPlaying = false;
    updateAudioDeckState();
  };

  previewAudioElement.onended = () => {
    isAudioPlaying = false;
    updateAudioDeckState();
  };

  previewAudioElement.onerror = () => {
    isAudioPlaying = false;
    updateAudioDeckState();
    setStatus("Audio preview could not be played.", "error");
  };

  previewAudioElement.play().catch(() => {
    isAudioPlaying = false;
    updateAudioDeckState();
  });
}

function updateAudioDeckState(): void {
  const toggleBtn = document.querySelector<HTMLButtonElement>("#audioPlayBtn");
  const eqBars = document.querySelectorAll<HTMLSpanElement>(".eq-bar");

  if (toggleBtn) {
    toggleBtn.innerHTML = isAudioPlaying
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  }

  eqBars.forEach((bar) => {
    if (isAudioPlaying) {
      bar.classList.add("animating");
    } else {
      bar.classList.remove("animating");
    }
  });
}

function getExpectedFilename(kind: DownloadKind, index?: number): string {
  if (!state.media || !state.settings) return "file.ext";
  return buildDownloadFilename(state.settings.filenameTemplate, state.media, kind, index);
}

function renderHeader(): string {
  return `
    <header class="app-header">
      <div class="brand">
        <div class="brand-icon-wrapper">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.89 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.32 0 .63.05.92.14V9.45a6.35 6.35 0 0 0-.92-.07A6.34 6.34 0 0 0 3 15.72a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.08a8.28 8.28 0 0 0 4.91 1.6V7.23a4.85 4.85 0 0 1-1-.54z"/>
          </svg>
        </div>
        <div class="brand-title">
          <span>Maggi Media DL</span>
          <span class="brand-badge">PRO</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" id="refreshBtn" title="Refresh Post" type="button" ${state.busy ? "disabled" : ""}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
        <button class="icon-btn" id="settingsBtn" title="Extension Settings" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    </header>
  `;
}

function renderTabs(): string {
  return `
    <nav class="nav-tabs">
      <button class="tab-btn ${state.activeTab === "preview" ? "active" : ""}" data-tab="preview" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Preview</span>
      </button>
      <button class="tab-btn ${state.activeTab === "manual" ? "active" : ""}" data-tab="manual" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        <span>Direct URL</span>
      </button>
      <button class="tab-btn ${state.activeTab === "history" ? "active" : ""}" data-tab="history" type="button">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>History (${state.recentJobs.length})</span>
      </button>
    </nav>
  `;
}

function renderStatusBar(): string {
  const dotClass = state.busy
    ? "status-dot pulse"
    : state.status.tone === "success"
      ? "status-dot success"
      : state.status.tone === "error"
        ? "status-dot error"
        : "status-dot";

  const cacheBadge = state.media
    ? state.cacheHit
      ? `<span class="status-badge cached">⚡ Cached ${Math.round(state.cacheAge / 1000)}s</span>`
      : `<span class="status-badge">🌐 Network</span>`
    : "";

  return `
    <div class="status-bar">
      <div class="status-left">
        <span class="${dotClass}"></span>
        <span class="status-text">${state.status.text}</span>
      </div>
      ${cacheBadge}
    </div>
  `;
}

function renderMediaPreview(media: ResolvedMedia): string {
  if (media.contentType === "video" && media.video?.url) {
    return `
      <div class="preview-container">
        <div class="media-stage">
          <video
            id="videoPreview"
            src="${media.video.url}"
            poster="${media.thumbnail || ""}"
            controls
            playsinline
            preload="metadata"
          ></video>
        </div>
      </div>
    `;
  }

  if (media.contentType === "images" && media.images.length > 0) {
    const currentImg = media.images[state.activePhotoIndex] || media.images[0];
    const total = media.images.length;

    const thumbStrip = media.images
      .map(
        (img, idx) => `
        <div class="thumb-item ${idx === state.activePhotoIndex ? "active" : ""}" data-photo-idx="${idx}">
          <img src="${img.url}" alt="Slide ${idx + 1}" loading="lazy" />
        </div>
      `,
      )
      .join("");

    return `
      <div class="preview-container">
        <div class="media-stage">
          <img id="photoPreviewImg" src="${currentImg.url}" alt="Slide ${state.activePhotoIndex + 1}" />
          <div class="carousel-overlay">
            <div class="carousel-top">
              <span class="carousel-counter">Slide ${state.activePhotoIndex + 1} / ${total}</span>
            </div>
            <div class="carousel-nav">
              <button class="carousel-btn" id="prevPhotoBtn" type="button" ${state.activePhotoIndex === 0 ? "disabled" : ""}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              <button class="carousel-btn" id="nextPhotoBtn" type="button" ${state.activePhotoIndex === total - 1 ? "disabled" : ""}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>
        </div>
        <div class="thumb-strip">${thumbStrip}</div>
      </div>
    `;
  }

  return `
    <div class="empty-state">
      <div class="empty-desc">No visual stream available for this post.</div>
    </div>
  `;
}

function renderAudioDeck(media: ResolvedMedia): string {
  if (!media.music?.url) return "";

  return `
    <div class="audio-deck">
      <div class="audio-info">
        <button class="audio-play-toggle" id="audioPlayBtn" type="button" title="Play audio preview">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <div class="audio-meta">
          <span class="audio-title">${media.music.title || "Soundtrack"}</span>
          <span class="audio-artist">@${media.music.author || media.author}</span>
        </div>
      </div>
      <div class="equalizer">
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
        <span class="eq-bar"></span>
      </div>
    </div>
  `;
}

function renderPreviewTab(): string {
  if (!state.media) {
    return `
      <div class="card">
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </div>
          <div class="empty-title">No TikTok Post Detected</div>
          <p class="empty-desc">Open a TikTok video or photo post in your active browser tab, or paste a link below.</p>
          <button class="btn-primary" id="pasteFromClipboardBtn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
            <span>Paste from Clipboard</span>
          </button>
        </div>
      </div>
    `;
  }

  const media = state.media;
  const isVideo = media.contentType === "video" && !!media.video;
  const isImages = media.contentType === "images" && media.images.length > 0;
  const currentFilename = isVideo
    ? getExpectedFilename("video")
    : isImages
      ? getExpectedFilename("images", state.activePhotoIndex)
      : getExpectedFilename("audio");

  return `
    <div class="card">
      <div class="post-header">
        <a class="author-chip" href="${media.sourceUrl}" target="_blank" title="Open on TikTok">
          <div class="author-avatar">${media.author.slice(0, 1).toUpperCase()}</div>
          <div class="author-info">
            <div class="author-name">
              <span>@${media.author}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--accent-cyan)"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
            </div>
            <span class="post-type-tag">${describeContentType(media.contentType)} • ${media.id}</span>
          </div>
        </a>
        <div class="post-actions">
          <button class="icon-btn" id="copyUrlBtn" title="Copy TikTok URL" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>

      ${renderMediaPreview(media)}
      ${renderAudioDeck(media)}

      <div class="download-grid ${isImages ? "two-cols" : ""}">
        ${
          isVideo
            ? `
          <button class="btn-primary" id="downloadVideoBtn" type="button" ${state.busy ? "disabled" : ""}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Download Video (HD)</span>
          </button>
        `
            : ""
        }

        ${
          isImages
            ? `
          <button class="btn-secondary" id="downloadCurrentPhotoBtn" type="button" ${state.busy ? "disabled" : ""}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Slide #${state.activePhotoIndex + 1}</span>
          </button>
          <button class="btn-primary" id="downloadAllPhotosBtn" type="button" ${state.busy ? "disabled" : ""}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>All (${media.images.length}) Photos</span>
          </button>
        `
            : ""
        }

        ${
          media.music
            ? `
          <button class="btn-secondary" id="downloadAudioBtn" type="button" ${state.busy ? "disabled" : ""}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
            <span>Download Audio (MP3)</span>
          </button>
        `
            : ""
        }
      </div>

      <div class="quick-settings">
        <label class="quick-toggle" title="Ask where to save download file">
          <div class="toggle-switch ${state.promptSaveAs ? "on" : ""}" id="promptSaveToggle">
            <span class="toggle-dot"></span>
          </div>
          <span>Save As dialog</span>
        </label>
        <span class="filename-preview" title="${currentFilename}">💾 ${currentFilename}</span>
      </div>
    </div>
  `;
}

function renderManualTab(): string {
  return `
    <div class="card">
      <div class="manual-input-box">
        <div class="empty-title">Direct Post Resolver</div>
        <p class="empty-desc">Enter any valid TikTok or X post link to fetch clean media files directly.</p>
        <div class="input-row">
          <input
            id="manualInput"
            class="url-input"
            type="url"
            placeholder="https://www.tiktok.com/... or https://x.com/..."
            value="${state.sourceMode === "manual" ? state.sourceUrl : ""}"
          />
          <button class="btn-primary" id="resolveManualBtn" type="button" ${state.busy ? "disabled" : ""}>
            <span>Fetch</span>
          </button>
        </div>
        <button class="btn-secondary" id="clipboardFillBtn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
          </svg>
          <span>Paste Clipboard URL</span>
        </button>
      </div>
    </div>
  `;
}

function renderHistoryTab(): string {
  if (!state.recentJobs.length) {
    return `
      <div class="card">
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div class="empty-title">No Recent Downloads</div>
          <p class="empty-desc">Your downloaded TikTok videos, audio tracks, and photo carousels will appear here.</p>
        </div>
      </div>
    `;
  }

  const items = state.recentJobs
    .map(
      (job) => `
      <div class="history-item">
        <div class="history-info">
          <div class="history-name" title="${job.filename}">${job.filename}</div>
          <div class="history-meta">
            <span class="history-tag">${job.kind}</span>
            <span>•</span>
            <span>${new Date(job.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
        <button class="icon-btn" data-copy-history="${job.sourceUrl}" title="Copy URL" type="button">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
    `,
    )
    .join("");

  return `
    <div class="card">
      <div class="history-list">${items}</div>
    </div>
  `;
}

function render(): void {
  app.innerHTML = `
    <div class="shell">
      ${renderHeader()}
      ${renderTabs()}
      ${renderStatusBar()}
      ${
        state.activeTab === "preview"
          ? renderPreviewTab()
          : state.activeTab === "manual"
            ? renderManualTab()
            : renderHistoryTab()
      }
    </div>
  `;

  bindEvents();
  updateAudioDeckState();
}

function setStatus(text: string, tone: PopupState["status"]["tone"] = "default"): void {
  state.status = { text, tone };
  const statusBar = document.querySelector(".status-bar");
  if (statusBar) {
    const dot = statusBar.querySelector(".status-dot");
    const textEl = statusBar.querySelector(".status-text");
    if (dot) {
      dot.className = state.busy
        ? "status-dot pulse"
        : tone === "success"
          ? "status-dot success"
          : tone === "error"
            ? "status-dot error"
            : "status-dot";
    }
    if (textEl) {
      textEl.textContent = text;
    }
  } else {
    render();
  }
}

async function sendMessage<T>(message: object): Promise<T> {
  const response = (await chrome.runtime.sendMessage(
    message,
  )) as MessageResponse<T>;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

async function loadSettings(): Promise<void> {
  const { settings } = await sendMessage<SettingsResponse>({ type: "settings/get" });
  state.settings = settings;
  state.promptSaveAs = settings.defaultSaveAs.video;
  setDebugLogging(settings.debugLogging);
  applyTheme(settings.theme);
}

async function loadRecentJobs(): Promise<void> {
  const { jobs } = await sendMessage<RecentJobsResponse>({
    type: "jobs/listRecent",
    limit: 8,
  });
  state.recentJobs = jobs;
}

async function resolveUrl(url: string, sourceMode: PopupState["sourceMode"]): Promise<void> {
  stopAudioPreview();
  state.busy = true;
  state.sourceMode = sourceMode;
  state.sourceUrl = url;
  state.activePhotoIndex = 0;
  setStatus("Fetching media details...", "busy");

  try {
    const result = await sendMessage<ResolveResult>({
      type: "media/resolve",
      url,
      reason: sourceMode,
    });
    state.media = result.media;
    state.cacheHit = result.cacheHit;
    state.cacheAge = result.cacheAge;
    state.activeTab = "preview";
    setStatus(result.cacheHit ? "Loaded from cache ⚡" : "Media ready for download.", "success");
  } catch (error) {
    state.media = null;
    setStatus(error instanceof Error ? error.message : "Failed to load post.", "error");
  } finally {
    state.busy = false;
    render();
  }
}

async function loadFromActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeUrl = tab?.url || "";

  if (activeUrl && isTikTokUrl(activeUrl)) {
    await resolveUrl(activeUrl, "active-tab");
    return;
  }

  const pageContextResponse = await sendMessage<{ context: { normalizedUrl: string } | null }>({
    type: "page/getContext",
  });
  if (pageContextResponse.context?.normalizedUrl) {
    await resolveUrl(pageContextResponse.context.normalizedUrl, "active-tab");
    return;
  }

  state.sourceMode = "manual";
  state.sourceUrl = "";
  state.media = null;
  setStatus("No active TikTok post detected.", "default");
}

async function handleContextUpdate(context: PageContext): Promise<void> {
  if (state.sourceMode !== "active-tab" || state.busy) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== context.tabId) return;
  if (state.sourceUrl === context.normalizedUrl && state.media) return;

  await resolveUrl(context.normalizedUrl, "active-tab");
}

async function handleContextRemoved(tabId: number): Promise<void> {
  if (state.sourceMode !== "active-tab" || state.busy) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== tabId) return;

  stopAudioPreview();
  state.sourceUrl = "";
  state.media = null;
  state.cacheHit = false;
  state.cacheAge = 0;
  setStatus("No TikTok post on current page.", "default");
  render();
}

function bindRuntimeEvents(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionEvent) => {
    if (message.type === "page/contextUpdated") {
      void handleContextUpdate(message.context);
    }
    if (message.type === "page/contextRemoved") {
      void handleContextRemoved(message.tabId);
    }
  });
}

async function startDownload(kind: DownloadKind, itemIndex?: number): Promise<void> {
  if (!state.media) return;

  state.busy = true;
  setStatus(`Initiating ${kind} download...`, "busy");
  try {
    const result = await sendMessage<{ downloadIds: number[] }>({
      type: "downloads/start",
      request: {
        kind,
        media: state.media,
        saveAs: state.promptSaveAs,
        itemIndex,
      },
    });
    await loadRecentJobs();
    const count = result.downloadIds.length;
    setStatus(`Started download for ${count} file${count > 1 ? "s" : ""} ✓`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Download failed.", "error");
  } finally {
    state.busy = false;
    render();
  }
}

function bindEvents(): void {
  // Navigation tabs
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as ActiveTab;
      if (tab && state.activeTab !== tab) {
        state.activeTab = tab;
        render();
      }
    });
  });

  // Settings & Refresh
  document.querySelector<HTMLButtonElement>("#settingsBtn")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelector<HTMLButtonElement>("#refreshBtn")?.addEventListener("click", async () => {
    if (state.sourceUrl) {
      await resolveUrl(state.sourceUrl, state.sourceMode);
    } else {
      await loadFromActiveTab();
    }
  });

  // Copy TikTok URL
  document.querySelector<HTMLButtonElement>("#copyUrlBtn")?.addEventListener("click", async () => {
    if (state.media?.sourceUrl) {
      await navigator.clipboard.writeText(state.media.sourceUrl);
      setStatus("TikTok URL copied to clipboard! ✓", "success");
    }
  });

  // Audio preview toggle
  document.querySelector<HTMLButtonElement>("#audioPlayBtn")?.addEventListener("click", () => {
    if (state.media?.music?.url) {
      toggleAudioPreview(state.media.music.url);
    }
  });

  // Carousel thumbnail clicks
  document.querySelectorAll<HTMLDivElement>("[data-photo-idx]").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const idx = Number(thumb.dataset.photoIdx);
      if (!Number.isNaN(idx) && state.media?.images[idx]) {
        state.activePhotoIndex = idx;
        render();
      }
    });
  });

  // Carousel navigation
  document.querySelector<HTMLButtonElement>("#prevPhotoBtn")?.addEventListener("click", () => {
    if (state.activePhotoIndex > 0) {
      state.activePhotoIndex -= 1;
      render();
    }
  });

  document.querySelector<HTMLButtonElement>("#nextPhotoBtn")?.addEventListener("click", () => {
    if (state.media && state.activePhotoIndex < state.media.images.length - 1) {
      state.activePhotoIndex += 1;
      render();
    }
  });

  // Prompt Save As toggle
  document.querySelector<HTMLDivElement>("#promptSaveToggle")?.addEventListener("click", () => {
    state.promptSaveAs = !state.promptSaveAs;
    render();
  });

  // Downloads
  document.querySelector<HTMLButtonElement>("#downloadVideoBtn")?.addEventListener("click", () => {
    void startDownload("video");
  });

  document.querySelector<HTMLButtonElement>("#downloadAudioBtn")?.addEventListener("click", () => {
    void startDownload("audio");
  });

  document.querySelector<HTMLButtonElement>("#downloadCurrentPhotoBtn")?.addEventListener("click", () => {
    void startDownload("images", state.activePhotoIndex);
  });

  document.querySelector<HTMLButtonElement>("#downloadAllPhotosBtn")?.addEventListener("click", () => {
    void startDownload("images");
  });

  // Clipboard Paste Buttons
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (!trimmed || !isTikTokUrl(trimmed)) {
        setStatus("Clipboard does not contain a supported TikTok URL.", "error");
        return;
      }
      await resolveUrl(trimmed, "manual");
    } catch {
      setStatus("Could not read clipboard. Please paste manually.", "error");
    }
  };

  document.querySelector<HTMLButtonElement>("#pasteFromClipboardBtn")?.addEventListener("click", handlePaste);
  document.querySelector<HTMLButtonElement>("#clipboardFillBtn")?.addEventListener("click", handlePaste);

  // Manual input fetch
  const handleManualFetch = async () => {
    const input = document.querySelector<HTMLInputElement>("#manualInput");
    const url = input?.value.trim() || "";
    if (!isTikTokUrl(url)) {
      setStatus("Please enter a valid TikTok video or photo URL.", "error");
      return;
    }
    await resolveUrl(url, "manual");
  };

  document.querySelector<HTMLButtonElement>("#resolveManualBtn")?.addEventListener("click", handleManualFetch);
  document.querySelector<HTMLInputElement>("#manualInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleManualFetch();
    }
  });

  // History copy URL buttons
  document.querySelectorAll<HTMLButtonElement>("[data-copy-history]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.copyHistory || "";
      if (url) {
        await navigator.clipboard.writeText(url);
        setStatus("Source link copied to clipboard! ✓", "success");
      }
    });
  });
}

async function init(): Promise<void> {
  render();
  bindRuntimeEvents();
  await loadSettings();
  await loadRecentJobs();

  if (state.settings?.autoDetectActiveTab) {
    await loadFromActiveTab();
  } else {
    state.sourceMode = "manual";
    setStatus("Auto-detection disabled. Paste a link to download.", "default");
  }

  render();
}

init().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Popup failed to initialize.", "error");
});
