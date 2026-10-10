import "./styles.css";
import { DEFAULT_SETTINGS } from "../shared/settings";
import { setDebugLogging } from "../shared/logger";
import { applyTheme } from "../shared/theme";
import type { MessageResponse, SettingsResponse } from "../shared/messages";
import type { ExtensionSettings } from "../shared/types";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Options root element is missing.");
}

const app = appRoot;

let settings: ExtensionSettings = DEFAULT_SETTINGS;
let notice = "Preferences loaded.";
let isSuccessNotice = false;

async function sendMessage<T>(message: object): Promise<T> {
  const response = (await chrome.runtime.sendMessage(
    message,
  )) as MessageResponse<T>;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

function computePreviewFilename(template: string): string {
  const sample = {
    author: "femboymaggi",
    id: "7482910482910382910",
    type: "video",
    index: "1",
    title: "POV_maggi_dev_session",
  };

  let result = template
    .replace(/{author}/gi, sample.author)
    .replace(/{id}/gi, sample.id)
    .replace(/{type}/gi, sample.type)
    .replace(/{index}/gi, sample.index)
    .replace(/{title}/gi, sample.title);

  if (!result.trim()) {
    result = `${sample.author}-${sample.id}-${sample.type}`;
  }

  return `${result}.mp4`;
}

function render(): void {
  applyTheme(settings.theme);

  const previewName = computePreviewFilename(settings.filenameTemplate);

  app.innerHTML = `
    <div class="page">
      <header class="header">
        <div class="brand">
          <div class="logo-badge">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <div class="title-group">
            <h1>Maggi Media Downloader <span class="version-pill">v2.1.0</span></h1>
            <p>Monochrome high-performance media extractor preferences</p>
          </div>
        </div>

        <div class="header-status">
          <span class="status-dot"></span>
          <span>Engine Active</span>
        </div>
      </header>

      <main class="layout">
        <!-- Platform Support Matrix -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              Supported Platforms
            </h2>
            <p class="card-desc">Current and upcoming extractor endpoints powered by api.maggi.dev</p>
          </div>

          <div class="platform-row">
            <div class="platform-badge">
              <div class="platform-name">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/>
                </svg>
                <span>TikTok (Videos & Photos)</span>
              </div>
              <span class="platform-tag tag-active">Active</span>
            </div>

            <div class="platform-badge">
              <div class="platform-name">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <span>X / Twitter (Media Extractor)</span>
              </div>
              <span class="platform-tag tag-roadmap">Upcoming</span>
            </div>
          </div>
        </section>

        <!-- Filename Template -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              File Naming & Appearance
            </h2>
            <p class="card-desc">Configure file generation structure and UI theme mode</p>
          </div>

          <div class="grid">
            <div class="field">
              <label class="field-label" for="filenameTemplate">Filename Pattern</label>
              <input id="filenameTemplate" type="text" value="${settings.filenameTemplate}" spellcheck="false" autocomplete="off" />
              <div class="token-tags">
                <span class="token-pill" data-token="{author}">+ {author}</span>
                <span class="token-pill" data-token="{id}">+ {id}</span>
                <span class="token-pill" data-token="{type}">+ {type}</span>
                <span class="token-pill" data-token="{index}">+ {index}</span>
                <span class="token-pill" data-token="{title}">+ {title}</span>
              </div>
              <div class="preview-box">
                <span class="preview-tag">Preview:</span>
                <span id="previewResult" class="preview-result">${previewName}</span>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="theme">Theme Palette</label>
              <select id="theme">
                <option value="system" ${settings.theme === "system" ? "selected" : ""}>System Default</option>
                <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Monochrome Dark (Default)</option>
                <option value="light" ${settings.theme === "light" ? "selected" : ""}>Clean Light</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Feed & In-Page Injection -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Feed & In-Page Experience
            </h2>
            <p class="card-desc">Controls how the extension detects and integrates into TikTok feeds</p>
          </div>

          <div class="grid">
            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-title">Auto-detect Active Video</span>
                <span class="toggle-sub">Tracks viewport scroll and instant SPA changes</span>
              </div>
              <label class="switch">
                <input id="autoDetectActiveTab" type="checkbox" ${settings.autoDetectActiveTab ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-title">In-Feed Download Button</span>
                <span class="toggle-sub">Injects circular 1-click button on video action rails</span>
              </div>
              <label class="switch">
                <input id="showInPageAction" type="checkbox" ${settings.showInPageAction ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-title">Console Debug Logging</span>
                <span class="toggle-sub">Outputs diagnostic timeline in browser DevTools</span>
              </div>
              <label class="switch">
                <input id="debugLogging" type="checkbox" ${settings.debugLogging ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </section>

        <!-- Download Prompts -->
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Save Location Prompts ("Save As")
            </h2>
            <p class="card-desc">Choose whether the browser prompts for a folder on each download</p>
          </div>

          <div class="grid">
            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-title">Ask Location for Videos</span>
                <span class="toggle-sub">Opens directory dialog for .mp4 downloads</span>
              </div>
              <label class="switch">
                <input id="saveAsVideo" type="checkbox" ${settings.defaultSaveAs.video ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-title">Ask Location for Audio</span>
                <span class="toggle-sub">Opens directory dialog for soundtrack .mp3 files</span>
              </div>
              <label class="switch">
                <input id="saveAsAudio" type="checkbox" ${settings.defaultSaveAs.audio ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>

            <div class="toggle-item">
              <div class="toggle-info">
                <span class="toggle-title">Ask Location for Photos</span>
                <span class="toggle-sub">Prompts for individual image slide files</span>
              </div>
              <label class="switch">
                <input id="saveAsImages" type="checkbox" ${settings.defaultSaveAs.images ? "checked" : ""} />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </section>
      </main>

      <!-- Bottom Sticky Action Bar -->
      <footer class="footer-actions">
        <div class="notice-pill ${isSuccessNotice ? "success" : ""}">
          ${
            isSuccessNotice
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`
              : ""
          }
          <span>${notice}</span>
        </div>

        <div class="action-buttons">
          <button class="secondary" id="resetSettings" type="button">Reset Defaults</button>
          <button class="primary" id="saveSettings" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Save Preferences
          </button>
        </div>
      </footer>
    </div>
  `;

  bindEvents();
}

function readSettingsFromForm(): ExtensionSettings {
  const filenameTemplate =
    document.querySelector<HTMLInputElement>("#filenameTemplate")?.value.trim() ||
    DEFAULT_SETTINGS.filenameTemplate;

  return {
    theme:
      (document.querySelector<HTMLSelectElement>("#theme")?.value as ExtensionSettings["theme"]) ||
      DEFAULT_SETTINGS.theme,
    filenameTemplate,
    autoDetectActiveTab:
      document.querySelector<HTMLInputElement>("#autoDetectActiveTab")?.checked ?? true,
    showInPageAction:
      document.querySelector<HTMLInputElement>("#showInPageAction")?.checked ?? true,
    debugLogging:
      document.querySelector<HTMLInputElement>("#debugLogging")?.checked ?? false,
    defaultSaveAs: {
      video: document.querySelector<HTMLInputElement>("#saveAsVideo")?.checked ?? true,
      audio: document.querySelector<HTMLInputElement>("#saveAsAudio")?.checked ?? true,
      images: document.querySelector<HTMLInputElement>("#saveAsImages")?.checked ?? false,
    },
  };
}

async function loadSettings(): Promise<void> {
  const response = await sendMessage<SettingsResponse>({ type: "settings/get" });
  settings = response.settings;
  setDebugLogging(settings.debugLogging);
  applyTheme(settings.theme);
  render();
}

async function saveSettings(): Promise<void> {
  settings = readSettingsFromForm();
  const response = await sendMessage<SettingsResponse>({
    type: "settings/update",
    settings,
  });
  settings = response.settings;
  setDebugLogging(settings.debugLogging);
  notice = "Preferences saved successfully.";
  isSuccessNotice = true;
  applyTheme(settings.theme);
  render();
}

function bindEvents(): void {
  // Live template preview listener
  const templateInput = document.querySelector<HTMLInputElement>("#filenameTemplate");
  const previewResult = document.querySelector<HTMLElement>("#previewResult");

  templateInput?.addEventListener("input", () => {
    if (previewResult) {
      previewResult.innerText = computePreviewFilename(templateInput.value);
    }
  });

  // Token pill insertion clicks
  const tokenPills = document.querySelectorAll<HTMLElement>(".token-pill");
  for (const pill of Array.from(tokenPills)) {
    pill.addEventListener("click", () => {
      const token = pill.dataset.token;
      if (token && templateInput) {
        templateInput.value = `${templateInput.value}-${token}`;
        if (previewResult) {
          previewResult.innerText = computePreviewFilename(templateInput.value);
        }
      }
    });
  }

  // Save button
  document.querySelector<HTMLButtonElement>("#saveSettings")?.addEventListener("click", () => {
    saveSettings().catch((error) => {
      notice = error instanceof Error ? error.message : "Failed to save preferences.";
      isSuccessNotice = false;
      render();
    });
  });

  // Reset button
  document.querySelector<HTMLButtonElement>("#resetSettings")?.addEventListener("click", () => {
    settings = DEFAULT_SETTINGS;
    notice = "Defaults restored. Click 'Save Preferences' to apply.";
    isSuccessNotice = false;
    applyTheme(settings.theme);
    render();
  });

  // Theme change
  document.querySelector<HTMLSelectElement>("#theme")?.addEventListener("change", (event) => {
    const nextTheme = (event.currentTarget as HTMLSelectElement).value as ExtensionSettings["theme"];
    settings = {
      ...settings,
      theme: nextTheme,
    };
    applyTheme(nextTheme);
  });
}

loadSettings().catch((error) => {
  notice = error instanceof Error ? error.message : "Failed to load preferences.";
  isSuccessNotice = false;
  render();
});
