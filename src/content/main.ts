import { createLogger, setDebugLogging } from "../shared/logger";
import { detectTikTokContentType, isTikTokUrl, normalizeTikTokUrl } from "../shared/tiktok";
import type { MessageResponse, SettingsResponse } from "../shared/messages";
import type { ExtensionSettings } from "../shared/types";

const logger = createLogger("content");
const CHIP_ID = "maggi-media-downloader-chip";

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
  try {
    const response = await sendMessage<SettingsResponse>({ type: "settings/get" });
    settings = response.settings;
    setDebugLogging(settings.debugLogging);
  } catch {
    // Extension may be reloading
  }
}

function removeChip(): void {
  document.getElementById(CHIP_ID)?.remove();
}

async function notifyContext(url: string): Promise<void> {
  try {
    await sendMessage({
      type: "page/contextDetected",
      context: {
        url,
        normalizedUrl: normalizeTikTokUrl(url),
        contentType: detectTikTokContentType(url),
        detectedAt: Date.now(),
      },
    });
  } catch {
    // Ignore background unavailability
  }
}

async function clearContext(): Promise<void> {
  try {
    await sendMessage({
      type: "page/contextCleared",
    });
  } catch {
    // Ignore background unavailability
  }
}

function getAbsoluteHref(value: string | null): string {
  if (!value) return "";
  try {
    return new URL(value, location.origin).toString();
  } catch {
    return "";
  }
}

function detectActiveTikTokUrl(): string {
  // 1. Direct post URL in browser address bar (instant)
  if (isTikTokUrl(location.href)) {
    return location.href;
  }

  // 2. Open Modal post viewer (e.g. desktop full view)
  const activeModalAnchor = document.querySelector<HTMLAnchorElement>(
    '[data-e2e="browse-video"] a[href*="/video/"], [data-e2e="browse-video"] a[href*="/photo/"]',
  );
  if (activeModalAnchor) {
    const href = getAbsoluteHref(activeModalAnchor.getAttribute("href"));
    if (isTikTokUrl(href)) return href;
  }

  // 3. Fast detection via active/playing video in viewport center
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
  const vh = window.innerHeight;

  // Prefer video closest to vertical center
  let bestVideoAnchorUrl = "";
  let minCenterDistance = Number.POSITIVE_INFINITY;

  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    // Must be in vertical viewport
    if (rect.bottom <= 0 || rect.top >= vh) continue;

    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(vh / 2 - centerY);

    const isPlaying = !video.paused && video.readyState >= 2;
    // Boost playing video
    const weightedDistance = isPlaying ? distance * 0.5 : distance;

    if (weightedDistance < minCenterDistance) {
      // Find post container
      const container =
        video.closest<HTMLElement>(
          '[data-e2e="recommend-list-item-container"], [data-e2e="feed-active"], article, [class*="DivItemContainer"], [class*="ItemContainer"]',
        ) ||
        video.parentElement?.parentElement?.parentElement ||
        null;

      if (container) {
        const anchor = container.querySelector<HTMLAnchorElement>(
          'a[href*="/video/"], a[href*="/photo/"]',
        );
        if (anchor) {
          const href = getAbsoluteHref(anchor.getAttribute("href"));
          if (isTikTokUrl(href)) {
            minCenterDistance = weightedDistance;
            bestVideoAnchorUrl = href;
          }
        }
      }
    }
  }

  if (bestVideoAnchorUrl) {
    return bestVideoAnchorUrl;
  }

  // 4. Fallback: inspect viewport anchors with small bounded search
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/video/"], a[href*="/photo/"]',
  );
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestUrl = "";
  const maxInspect = Math.min(anchors.length, 20);

  for (let i = 0; i < maxInspect; i++) {
    const anchor = anchors[i];
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < vh && rect.width > 0 && rect.height > 0) {
      const centerY = rect.top + rect.height / 2;
      const score = 1000 - Math.abs(vh / 2 - centerY);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = getAbsoluteHref(anchor.getAttribute("href"));
      }
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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      <span>Download</span>
    </span>
  `;
  chip.style.position = "fixed";
  chip.style.right = "24px";
  chip.style.bottom = "24px";
  chip.style.zIndex = "2147483646";
  chip.style.padding = "9px 16px";
  chip.style.borderRadius = "999px";
  chip.style.border = "1px solid rgba(255, 255, 255, 0.25)";
  chip.style.background = "rgba(10, 10, 10, 0.9)";
  chip.style.backdropFilter = "blur(12px)";
  chip.style.color = "#ffffff";
  chip.style.font = '600 12px system-ui, -apple-system, sans-serif';
  chip.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.6)";
  chip.style.cursor = "pointer";
  chip.style.transition = "all 0.15s ease";

  chip.onmouseenter = () => {
    chip.style.background = "#ffffff";
    chip.style.color = "#000000";
    chip.style.transform = "translateY(-2px)";
  };
  chip.onmouseleave = () => {
    chip.style.background = "rgba(10, 10, 10, 0.9)";
    chip.style.color = "#ffffff";
    chip.style.transform = "translateY(0)";
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <span>Download</span>
          </span>
        `;
      }, 2000);
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

  // Fast 100ms response time on scrolling / navigation
  refreshTimeoutId = window.setTimeout(() => {
    refreshTimeoutId = null;
    void processPageState();
  }, 100);
}

function observeUrlChanges(): void {
  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("hashchange", scheduleRefresh);

  // Instant scroll & keyboard navigation response
  window.addEventListener("scroll", scheduleRefresh, { passive: true });
  window.addEventListener("wheel", scheduleRefresh, { passive: true });
  window.addEventListener(
    "keydown",
    (e) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "j", "k", " "].includes(e.key)) {
        scheduleRefresh();
      }
    },
    { passive: true },
  );

  // Rapid 250ms interval check for SPA state changes
  locationPollId = window.setInterval(() => {
    if (location.href !== currentPageUrl) {
      scheduleRefresh();
    }
  }, 250);
}

async function init(): Promise<void> {
  await loadSettings();
  await processPageState();
  observeUrlChanges();
}

init().catch((error) => logger.error("Content script bootstrap failed", error));
