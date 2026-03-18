import "./styles.css";
import { describeContentType, isTikTokUrl } from "../shared/tiktok";
import { setDebugLogging } from "../shared/logger";
import { applyTheme } from "../shared/theme";
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

interface PopupState {
  status: { tone: "default" | "success" | "error"; text: string };
  media: ResolvedMedia | null;
  cacheHit: boolean;
  cacheAge: number;
  settings: ExtensionSettings | null;
  recentJobs: RecentJob[];
  sourceMode: "active-tab" | "manual";
  sourceUrl: string;
  busy: boolean;
}

const state: PopupState = {
  status: {
    tone: "default",
    text: "Idle.",
  },
  media: null,
  cacheHit: false,
  cacheAge: 0,
  settings: null,
  recentJobs: [],
  sourceMode: "active-tab",
  sourceUrl: "",
  busy: false,
};

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Popup root element is missing.");
}

const app = appRoot;

function badgeClass(): string {
  return `status-pill ${state.status.tone === "default" ? "" : state.status.tone}`.trim();
}

function currentSourceLabel(): string {
  return state.sourceMode === "manual" ? "Manual input" : "Active tab";
}

function statusDetail(): string {
  if (!state.media) return "No post prepared";
  return `${describeContentType(state.media.contentType)} ready`;
}

function sourceSummary(): string {
  if (!state.sourceUrl) return "Paste a TikTok URL or open a supported post.";
  return state.sourceUrl.length > 42 ? `${state.sourceUrl.slice(0, 42)}...` : state.sourceUrl;
}

function previewThumb(media: ResolvedMedia | null): string {
  if (!media?.thumbnail) {
    return `<div class="preview-thumb">No image</div>`;
  }

  return `<div class="preview-thumb"><img src="${media.thumbnail}" alt="TikTok preview" /></div>`;
}

function previewMarkup(media: ResolvedMedia | null): string {
  if (!media) {
    return `
      <div class="preview">
        <div class="preview-thumb">Waiting for a TikTok URL</div>
        <div class="preview-main">
          <h3>No post</h3>
          <p class="hint">Open a TikTok post or enter a URL.</p>
          <div class="simple-list">
            <div class="simple-row"><span class="meta-label">Content</span><strong>Unknown</strong></div>
            <div class="simple-row"><span class="meta-label">Source</span><strong>${currentSourceLabel()}</strong></div>
          </div>
        </div>
      </div>
    `;
  }

  const itemCount = media.contentType === "images" ? media.images.length : media.video ? 1 : 0;

  return `
    <div class="preview">
      ${previewThumb(media)}
      <div class="preview-main">
        <h3>@${media.author}</h3>
        <div class="preview-id">${media.id}</div>
        <div class="simple-list">
          <div class="simple-row"><span class="meta-label">Type</span><strong>${describeContentType(media.contentType)}</strong></div>
          <div class="simple-row"><span class="meta-label">Items</span><strong>${itemCount}</strong></div>
          <div class="simple-row"><span class="meta-label">Audio</span><strong>${media.music ? media.music.title : "Not available"}</strong></div>
          <div class="simple-row"><span class="meta-label">Source</span><strong>${state.cacheHit ? `Cache ${Math.round(state.cacheAge / 1000)}s` : "Network"}</strong></div>
          <div class="simple-row"><span class="meta-label">Provider</span><strong>${media.providerMeta.provider}</strong></div>
        </div>
      </div>
    </div>
  `;
}

function recentJobsMarkup(jobs: RecentJob[]): string {
  if (!jobs.length) {
    return `<p class="hint">Recent downloads will appear here after the first successful download request.</p>`;
  }

  return jobs
    .map(
      (job) => `
        <div class="recent-item">
          <div>
            <h3>${job.filename}</h3>
            <div class="recent-meta">${job.kind} - ${new Date(job.createdAt).toLocaleString()}</div>
          </div>
          <button class="ghost-button" data-copy-url="${job.sourceUrl}" type="button">Copy URL</button>
        </div>
      `,
    )
    .join("");
}

function render(): void {
  app.innerHTML = `
    <div class="shell">
      <main class="app">
        <section class="header">
          <div>
            <h1>TikTok Downloader</h1>
            <p class="subtle">Video, audio and photo downloads.</p>
          </div>
          <button class="ghost-button" id="openOptions" type="button" aria-label="Open extension options">Settings</button>
        </section>

        <section class="status-card">
          <div class="status-top">
            <div class="status-label">${currentSourceLabel()}</div>
            <div class="${badgeClass()}">${statusDetail()}</div>
          </div>
          <div>
            <div class="status-value">${sourceSummary()}</div>
          </div>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>Current post</h2>
            <span class="subtle">${state.status.text}</span>
          </div>
          ${previewMarkup(state.media)}
        </section>

        <section class="card">
          <div class="card-title">
            <h2>Actions</h2>
            <span class="subtle">${state.settings ? state.settings.filenameTemplate : "Loading settings..."}</span>
          </div>
          <div class="action-grid">
            <button class="action-button" id="downloadVideo" type="button" ${!state.media?.video || state.busy ? "disabled" : ""}>Video</button>
            <button class="action-button" id="downloadAudio" type="button" ${!state.media?.music || state.busy ? "disabled" : ""}>Audio</button>
            <button class="action-button" id="downloadImages" type="button" ${state.media?.images.length ? "" : "disabled"} ${state.busy ? "disabled" : ""}>Photos</button>
          </div>
          <button class="secondary-button" id="refreshMedia" type="button" ${!state.sourceUrl || state.busy ? "disabled" : ""}>Refresh</button>
          <p class="hint">Save dialog: video ${state.settings?.defaultSaveAs.video ? "on" : "off"}, audio ${state.settings?.defaultSaveAs.audio ? "on" : "off"}, photos ${state.settings?.defaultSaveAs.images ? "on" : "off"}.</p>
        </section>

        <section class="card">
          <label class="field-label" for="manualUrl">Manual URL</label>
          <div class="field-row">
            <input id="manualUrl" type="url" placeholder="https://www.tiktok.com/@user/video/123..." value="${state.sourceMode === "manual" ? state.sourceUrl : ""}" />
            <button class="ghost-button" id="resolveManual" type="button" ${state.busy ? "disabled" : ""}>Go</button>
          </div>
          <p class="hint">Used when no active post is detected.</p>
        </section>

        <section class="card">
          <div class="card-title">
            <h2>Recent jobs</h2>
            <span class="subtle">${state.recentJobs.length}</span>
          </div>
          <div class="recent-list">${recentJobsMarkup(state.recentJobs)}</div>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function setStatus(text: string, tone: PopupState["status"]["tone"] = "default"): void {
  state.status = { text, tone };
  render();
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
  setDebugLogging(settings.debugLogging);
  applyTheme(settings.theme);
}

async function loadRecentJobs(): Promise<void> {
  const { jobs } = await sendMessage<RecentJobsResponse>({
    type: "jobs/listRecent",
    limit: 6,
  });
  state.recentJobs = jobs;
}

async function resolveUrl(url: string, sourceMode: PopupState["sourceMode"]): Promise<void> {
  state.busy = true;
  state.sourceMode = sourceMode;
  state.sourceUrl = url;
  setStatus("Resolving...");

  try {
    const result = await sendMessage<ResolveResult>({
      type: "media/resolve",
      url,
      reason: sourceMode,
    });
    state.media = result.media;
    state.cacheHit = result.cacheHit;
    state.cacheAge = result.cacheAge;
    setStatus(result.cacheHit ? "Loaded from cache." : "Loaded.", "success");
  } catch (error) {
    state.media = null;
    setStatus(error instanceof Error ? error.message : "Failed to resolve media.", "error");
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
  setStatus("No supported TikTok post found.", "default");
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

  state.sourceUrl = "";
  state.media = null;
  state.cacheHit = false;
  state.cacheAge = 0;
  setStatus("No supported TikTok post on this page.", "default");
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

async function startDownload(kind: DownloadKind): Promise<void> {
  if (!state.media) return;

  state.busy = true;
  setStatus(`Starting ${kind} download...`);
  try {
    const result = await sendMessage<{ downloadIds: number[] }>({
      type: "downloads/start",
      request: {
        kind,
        media: state.media,
      },
    });
    await loadRecentJobs();
    setStatus(`Started ${result.downloadIds.length} ${kind} download${result.downloadIds.length > 1 ? "s" : ""}.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Failed to start download.", "error");
  } finally {
    state.busy = false;
    render();
  }
}

function bindEvents(): void {
  document.querySelector<HTMLButtonElement>("#openOptions")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelector<HTMLButtonElement>("#resolveManual")?.addEventListener("click", async () => {
    const input = document.querySelector<HTMLInputElement>("#manualUrl");
    const url = input?.value.trim() || "";
    if (!isTikTokUrl(url)) {
      setStatus("Please enter a supported TikTok video or photo URL.", "error");
      return;
    }
    await resolveUrl(url, "manual");
  });

  document.querySelector<HTMLButtonElement>("#refreshMedia")?.addEventListener("click", async () => {
    if (state.sourceUrl) {
      await resolveUrl(state.sourceUrl, state.sourceMode);
    }
  });

  document.querySelector<HTMLButtonElement>("#downloadVideo")?.addEventListener("click", () =>
    startDownload("video"),
  );
  document.querySelector<HTMLButtonElement>("#downloadAudio")?.addEventListener("click", () =>
    startDownload("audio"),
  );
  document.querySelector<HTMLButtonElement>("#downloadImages")?.addEventListener("click", () =>
    startDownload("images"),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-copy-url]").forEach((button) => {
    button.addEventListener("click", async () => {
      const url = button.dataset.copyUrl || "";
      await navigator.clipboard.writeText(url);
      setStatus("Source URL copied to clipboard.", "success");
    });
  });

  document.querySelector<HTMLInputElement>("#manualUrl")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const url = (event.currentTarget as HTMLInputElement).value.trim();
    if (!isTikTokUrl(url)) {
      setStatus("Please enter a supported TikTok video or photo URL.", "error");
      return;
    }
    await resolveUrl(url, "manual");
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
    setStatus("Auto-detect is disabled. Use manual mode or change the setting.", "default");
  }

  render();
}

init().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Popup failed to initialize.", "error");
});
