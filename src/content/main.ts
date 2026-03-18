import { createLogger, setDebugLogging } from "../shared/logger";
import { detectTikTokContentType, isTikTokUrl, normalizeTikTokUrl } from "../shared/tiktok";
import type { MessageResponse, SettingsResponse } from "../shared/messages";
import type { ExtensionSettings } from "../shared/types";

const logger = createLogger("content");
const CHIP_ID = "maggi-tiktok-downloader-chip";

let currentPageUrl = "";
let currentDetectedUrl = "";
let settings: ExtensionSettings | null = null;
let refreshTimeoutId: number | null = null;
let locationPollId: number | null = null;

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
  const response = await sendMessage<SettingsResponse>({ type: "settings/get" });
  settings = response.settings;
  setDebugLogging(settings.debugLogging);
}

function removeChip(): void {
  document.getElementById(CHIP_ID)?.remove();
}

async function notifyContext(url: string): Promise<void> {
  await sendMessage({
    type: "page/contextDetected",
    context: {
      url,
      normalizedUrl: normalizeTikTokUrl(url),
      contentType: detectTikTokContentType(url),
      detectedAt: Date.now(),
    },
  });
}

async function clearContext(): Promise<void> {
  await sendMessage({
    type: "page/contextCleared",
  });
}

function getAbsoluteHref(value: string | null): string {
  if (!value) return "";
  try {
    return new URL(value, location.origin).toString();
  } catch {
    return "";
  }
}

function scoreAnchor(anchor: HTMLAnchorElement): number {
  const href = getAbsoluteHref(anchor.getAttribute("href"));
  if (!isTikTokUrl(href)) return Number.NEGATIVE_INFINITY;

  const rect = anchor.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  const visibleArea = visibleWidth * visibleHeight;
  if (visibleArea <= 0) return Number.NEGATIVE_INFINITY;

  const viewportCenterY = window.innerHeight / 2;
  const rectCenterY = rect.top + rect.height / 2;
  const centerDistance = Math.abs(viewportCenterY - rectCenterY);

  return visibleArea - centerDistance * 10;
}

function detectActiveTikTokUrl(): string {
  if (isTikTokUrl(location.href)) {
    return location.href;
  }

  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"], a[href*="/photo/"]'));
  let bestUrl = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const anchor of anchors) {
    const score = scoreAnchor(anchor);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = getAbsoluteHref(anchor.getAttribute("href"));
    }
  }

  return bestUrl;
}

function renderChip(url: string): void {
  removeChip();
  if (!settings?.showInPageAction || !isTikTokUrl(url)) return;

  const chip = document.createElement("button");
  chip.id = CHIP_ID;
  chip.type = "button";
  chip.textContent = "Load post";
  chip.style.position = "fixed";
  chip.style.right = "20px";
  chip.style.bottom = "20px";
  chip.style.zIndex = "2147483646";
  chip.style.padding = "12px 16px";
  chip.style.borderRadius = "999px";
  chip.style.border = "1px solid rgba(255,255,255,0.2)";
  chip.style.background = "linear-gradient(135deg, #f6d365, #f15a29)";
  chip.style.color = "#151915";
  chip.style.font = '700 13px "Segoe UI Variable Display", "Segoe UI", sans-serif';
  chip.style.boxShadow = "0 16px 40px rgba(0,0,0,0.3)";
  chip.style.cursor = "pointer";

  chip.addEventListener("click", async () => {
    chip.disabled = true;
    chip.textContent = "Preparing...";
    try {
      await sendMessage({
        type: "media/resolve",
        url,
        reason: "page-action",
      });
      chip.textContent = "Loaded";
    } catch (error) {
      chip.textContent =
        error instanceof Error ? `Error: ${error.message}` : "Error";
      logger.error("Page action failed", error);
    } finally {
      window.setTimeout(() => {
        chip.disabled = false;
        chip.textContent = "Load post";
      }, 2400);
    }
  });

  document.body.appendChild(chip);
}

async function processPageState(): Promise<void> {
  const pageUrl = location.href;
  const pageChanged = pageUrl !== currentPageUrl;
  currentPageUrl = pageUrl;
  const detectedUrl = detectActiveTikTokUrl();

  if (!detectedUrl) {
    if (currentDetectedUrl) {
      currentDetectedUrl = "";
      removeChip();
      await clearContext();
    } else {
      removeChip();
    }
    return;
  }

  if (detectedUrl === currentDetectedUrl && !pageChanged) {
    renderChip(detectedUrl);
    return;
  }

  currentDetectedUrl = detectedUrl;

  try {
    await notifyContext(detectedUrl);
    renderChip(detectedUrl);
  } catch (error) {
    logger.error("Failed to update page context", error);
  }
}

function scheduleRefresh(): void {
  if (refreshTimeoutId !== null) {
    window.clearTimeout(refreshTimeoutId);
  }

  refreshTimeoutId = window.setTimeout(() => {
    refreshTimeoutId = null;
    void processPageState();
  }, 150);
}

function observeUrlChanges(): void {
  const observer = new MutationObserver(() => {
    scheduleRefresh();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("scroll", scheduleRefresh, { passive: true });

  locationPollId = window.setInterval(() => {
    if (location.href !== currentPageUrl) {
      scheduleRefresh();
    }
  }, 300);
}

async function init(): Promise<void> {
  await loadSettings();
  await processPageState();
  observeUrlChanges();
}

init().catch((error) => logger.error("Content script bootstrap failed", error));
