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

  // Look for currently active modal or video link first
  const activeModalAnchor = document.querySelector<HTMLAnchorElement>(
    '[data-e2e="browse-video"] a[href*="/video/"], [data-e2e="feed-active"] a[href*="/video/"]',
  );
  if (activeModalAnchor) {
    const href = getAbsoluteHref(activeModalAnchor.getAttribute("href"));
    if (isTikTokUrl(href)) return href;
  }

  // Scan anchors in viewport with low overhead
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"], a[href*="/photo/"]');
  let bestUrl = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  const maxToInspect = Math.min(anchors.length, 25);

  for (let i = 0; i < maxToInspect; i++) {
    const anchor = anchors[i];
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
  chip.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:8px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.89 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.32 0 .63.05.92.14V9.45a6.35 6.35 0 0 0-.92-.07A6.34 6.34 0 0 0 3 15.72a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.08a8.28 8.28 0 0 0 4.91 1.6V7.23a4.85 4.85 0 0 1-1-.54z"/>
      </svg>
      <span>Download Ready</span>
    </span>
  `;
  chip.style.position = "fixed";
  chip.style.right = "24px";
  chip.style.bottom = "24px";
  chip.style.zIndex = "2147483646";
  chip.style.padding = "10px 18px";
  chip.style.borderRadius = "999px";
  chip.style.border = "1px solid rgba(37, 244, 238, 0.4)";
  chip.style.background = "linear-gradient(135deg, rgba(18, 22, 32, 0.95), rgba(28, 34, 48, 0.95))";
  chip.style.backdropFilter = "blur(12px)";
  chip.style.color = "#ffffff";
  chip.style.font = '600 13px system-ui, -apple-system, sans-serif';
  chip.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.45), 0 0 16px rgba(37, 244, 238, 0.25)";
  chip.style.cursor = "pointer";
  chip.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";

  chip.onmouseenter = () => {
    chip.style.transform = "translateY(-2px) scale(1.02)";
    chip.style.boxShadow = "0 14px 36px rgba(0, 0, 0, 0.5), 0 0 22px rgba(254, 44, 85, 0.35)";
  };
  chip.onmouseleave = () => {
    chip.style.transform = "translateY(0) scale(1)";
    chip.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.45), 0 0 16px rgba(37, 244, 238, 0.25)";
  };

  chip.addEventListener("click", async () => {
    chip.disabled = true;
    chip.innerText = "Resolving...";
    try {
      await sendMessage({
        type: "media/resolve",
        url,
        reason: "page-action",
      });
      chip.innerText = "Ready in Popup ✓";
    } catch (error) {
      chip.innerText = error instanceof Error ? `Error: ${error.message}` : "Failed";
      logger.error("Page action failed", error);
    } finally {
      window.setTimeout(() => {
        chip.disabled = false;
        chip.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:8px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.89 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.32 0 .63.05.92.14V9.45a6.35 6.35 0 0 0-.92-.07A6.34 6.34 0 0 0 3 15.72a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.08a8.28 8.28 0 0 0 4.91 1.6V7.23a4.85 4.85 0 0 1-1-.54z"/>
            </svg>
            <span>Download Ready</span>
          </span>
        `;
      }, 2500);
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
  }, 250);
}

function observeUrlChanges(): void {
  // Intercept client-side SPA navigation safely
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    scheduleRefresh();
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    scheduleRefresh();
    return result;
  };

  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("hashchange", scheduleRefresh);

  // Light mutation observer on top-level body only (not entire subtree)
  const observer = new MutationObserver(() => {
    if (location.href !== currentPageUrl) {
      scheduleRefresh();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true });
  }

  // Periodic lightweight check every 800ms
  locationPollId = window.setInterval(() => {
    if (location.href !== currentPageUrl) {
      scheduleRefresh();
    }
  }, 800);
}

async function init(): Promise<void> {
  await loadSettings();
  await processPageState();
  observeUrlChanges();
}

init().catch((error) => logger.error("Content script bootstrap failed", error));
