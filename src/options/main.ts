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
let notice = "Settings loaded.";

async function sendMessage<T>(message: object): Promise<T> {
  const response = (await chrome.runtime.sendMessage(
    message,
  )) as MessageResponse<T>;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

function render(): void {
  applyTheme(settings.theme);

  app.innerHTML = `
    <div class="page">
      <main class="layout">
        <section class="hero">
          <h1>TikTok Downloader Options</h1>
          <p>Extension settings.</p>
          <p class="hint">${notice}</p>
        </section>

        <section class="card">
          <h2>File naming</h2>
          <div class="grid">
            <div class="field">
              <label for="filenameTemplate">Filename template</label>
              <input id="filenameTemplate" type="text" value="${settings.filenameTemplate}" />
              <p class="hint">Supported tokens: {author}, {id}, {type}, {index}, {title}</p>
            </div>
            <div class="field">
              <label for="theme">Theme</label>
              <select id="theme">
                <option value="system" ${settings.theme === "system" ? "selected" : ""}>System</option>
                <option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option>
                <option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option>
              </select>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>Defaults</h2>
          <div class="grid">
            <label class="toggle">
              <div class="toggle-copy">
                <strong>Auto-detect active TikTok tab</strong>
                <span>Resolve the current tab when the popup opens.</span>
              </div>
              <input id="autoDetectActiveTab" type="checkbox" ${settings.autoDetectActiveTab ? "checked" : ""} />
            </label>

            <label class="toggle">
              <div class="toggle-copy">
                <strong>Show in-page button</strong>
                <span>Show a floating button on TikTok pages.</span>
              </div>
              <input id="showInPageAction" type="checkbox" ${settings.showInPageAction ? "checked" : ""} />
            </label>

            <label class="toggle">
              <div class="toggle-copy">
                <strong>Save dialog for video</strong>
                <span>Prompt for a save location before video downloads.</span>
              </div>
              <input id="saveAsVideo" type="checkbox" ${settings.defaultSaveAs.video ? "checked" : ""} />
            </label>

            <label class="toggle">
              <div class="toggle-copy">
                <strong>Save dialog for audio</strong>
                <span>Prompt for a save location before audio downloads.</span>
              </div>
              <input id="saveAsAudio" type="checkbox" ${settings.defaultSaveAs.audio ? "checked" : ""} />
            </label>

            <label class="toggle">
              <div class="toggle-copy">
                <strong>Save dialog for photo sets</strong>
                <span>Prompt before each photo file is started.</span>
              </div>
              <input id="saveAsImages" type="checkbox" ${settings.defaultSaveAs.images ? "checked" : ""} />
            </label>

            <label class="toggle">
              <div class="toggle-copy">
                <strong>Debug logging</strong>
                <span>Enable console logging.</span>
              </div>
              <input id="debugLogging" type="checkbox" ${settings.debugLogging ? "checked" : ""} />
            </label>
          </div>
        </section>

        <section class="card">
          <h2>Actions</h2>
          <div class="actions">
            <button class="primary" id="saveSettings" type="button">Save settings</button>
            <button class="secondary" id="resetSettings" type="button">Reset defaults</button>
          </div>
        </section>
      </main>
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
  notice = "Settings saved.";
  applyTheme(settings.theme);
  render();
}

function bindEvents(): void {
  document.querySelector<HTMLButtonElement>("#saveSettings")?.addEventListener("click", () => {
    saveSettings().catch((error) => {
      notice = error instanceof Error ? error.message : "Failed to save settings.";
      render();
    });
  });

  document.querySelector<HTMLButtonElement>("#resetSettings")?.addEventListener("click", () => {
    settings = DEFAULT_SETTINGS;
    notice = "Defaults restored. Save to apply.";
    applyTheme(settings.theme);
    render();
  });

  document.querySelector<HTMLSelectElement>("#theme")?.addEventListener("change", (event) => {
    const nextTheme = (event.currentTarget as HTMLSelectElement).value as ExtensionSettings["theme"];
    settings = {
      ...settings,
      theme: nextTheme,
    };
    applyTheme(nextTheme);
    render();
  });
}

loadSettings().catch((error) => {
  notice = error instanceof Error ? error.message : "Failed to load settings.";
  render();
});
