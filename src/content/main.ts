import { createLogger, setDebugLogging } from "../shared/logger";
import { detectTikTokContentType, isTikTokUrl, normalizeTikTokUrl } from "../shared/tiktok";
import type { MessageResponse, SettingsResponse } from "../shared/messages";
import type { ExtensionSettings, ResolveResult } from "../shared/types";

const logger = createLogger("content");
const CHIP_ID = "maggi-media-downloader-chip";
const INJECTED_CLASS = "maggi-injected-action-item";

let currentPageUrl = "";
let currentDetectedUrl = "";
let settings: ExtensionSettings | null = null;
let refreshTimeoutId: number | null = null;
let locationPollId: number | null = null;

async function sendMessage<T>(message: object): Promise<T> {
  const response = (await chrome.runtime.sendMessage(
    message,
  )) as MessageResponse<T>;
  if (!response || !response.ok) {
    throw new Error(response ? response.error : "Failed to communicate with extension background.");
  }
  return response.data;
}

async function loadSettings(): Promise<void> {
  try {
    const response = await sendMessage<SettingsResponse>({ type: "settings/get" });
    settings = response.settings;
    setDebugLogging(settings.debugLogging);
  } catch {
    // Background may be temporarily unavailable
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

export function extractPostUrlFromContainer(container: HTMLElement): string {
  // 1. Direct anchor with /video/ or /photo/ or /v/
  const anchors = Array.from(
    container.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/video/"], a[href*="/photo/"], a[href*="/v/"]',
    ),
  );
  for (const anchor of anchors) {
    const rawHref = anchor.getAttribute("href");
    if (!rawHref) continue;
    const absHref = getAbsoluteHref(rawHref);
    if (isTikTokUrl(absHref)) return absHref;

    const match = rawHref.match(/(?:@[\w.-]+\/)?(?:video|v|photo)\/\d+/);
    if (match) {
      return `https://www.tiktok.com/${match[0].startsWith("@") ? match[0] : `@tiktok/${match[0]}`}`;
    }
  }

  // 2. Check XGPlayer wrapper id (e.g. xgwrapper-0-7412345678901234567)
  const xgElement = container.matches('[id*="xgwrapper"]')
    ? container
    : container.querySelector('[id*="xgwrapper"]');
  if (xgElement) {
    const idMatch = xgElement.id.match(/\d{16,21}/);
    if (idMatch) {
      const authorAnchor = container.querySelector<HTMLAnchorElement>('a[href^="/@"]');
      const author = authorAnchor?.getAttribute("href")?.replace(/^\//, "") || "@tiktok";
      return `https://www.tiktok.com/${author.startsWith("@") ? author : `@${author}`}/video/${idMatch[0]}`;
    }
  }

  // 3. Search all element attributes in container for video ID
  const allElements = Array.from(container.querySelectorAll<HTMLElement>("*"));
  for (const el of allElements) {
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      if (val && /^\d{18,20}$/.test(val)) {
        const authorAnchor = container.querySelector<HTMLAnchorElement>('a[href^="/@"]');
        const author = authorAnchor?.getAttribute("href")?.replace(/^\//, "") || "@tiktok";
        return `https://www.tiktok.com/${author.startsWith("@") ? author : `@${author}`}/video/${val}`;
      }
    }
  }

  return "";
}

function detectActiveTikTokUrl(): string {
  // 1. Direct post URL in browser address bar (when on /@user/video/123)
  if (isTikTokUrl(location.href)) {
    return location.href;
  }

  // 2. Open Modal post viewer (e.g. desktop full view popup)
  const modal = document.querySelector<HTMLElement>('[data-e2e="browse-video"]');
  if (modal) {
    const modalUrl = extractPostUrlFromContainer(modal);
    if (modalUrl) return modalUrl;
  }

  // 3. Fast detection via active/playing video in viewport center
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
  const vh = window.innerHeight;

  let bestVideoAnchorUrl = "";
  let minCenterDistance = Number.POSITIVE_INFINITY;

  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    // Must be in vertical viewport
    if (rect.bottom <= 0 || rect.top >= vh) continue;

    const centerY = rect.top + rect.height / 2;
    const distance = Math.abs(vh / 2 - centerY);

    const isPlaying = !video.paused && video.readyState >= 2;
    const weightedDistance = isPlaying ? distance * 0.4 : distance;

    if (weightedDistance < minCenterDistance) {
      const container =
        (video.closest(
          '[data-e2e="recommend-list-item-container"], [data-e2e="feed-active"], article, [class*="DivItemContainer"], [class*="ItemContainer"]',
        ) as HTMLElement | null) ||
        video.parentElement?.parentElement?.parentElement ||
        null;

      if (container) {
        const postUrl = extractPostUrlFromContainer(container);
        if (postUrl) {
          minCenterDistance = weightedDistance;
          bestVideoAnchorUrl = postUrl;
        }
      }
    }
  }

  if (bestVideoAnchorUrl) {
    return bestVideoAnchorUrl;
  }

  // 4. Fallback: scan any item container on page
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-e2e="recommend-list-item-container"], article, [class*="DivItemContainer"]',
    ),
  );
  for (const c of containers) {
    const rect = c.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < vh) {
      const url = extractPostUrlFromContainer(c);
      if (url) return url;
    }
  }

  return "";
}

function injectDownloadButtons(): void {
  // Find all Share buttons in TikTok's action bar
  const shareButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[data-e2e="share-icon"], button[data-e2e="feed-share-icon"], button[aria-label*="Share"], button[aria-label*="Teilen"]',
    ),
  );

  for (const shareBtn of shareButtons) {
    const shareWrapper =
      (shareBtn.closest(
        '[class*="ActionItem"], [class*="DivActionItemContainer"], [class*="ActionItemContainer"]',
      ) as HTMLElement | null) || shareBtn.parentElement;

    if (!shareWrapper) continue;
    const parentBar = shareWrapper.parentElement;
    if (!parentBar) continue;

    // Avoid duplicate injections
    if (parentBar.querySelector(`.${INJECTED_CLASS}`)) continue;

    const itemContainer =
      (shareBtn.closest(
        '[data-e2e="recommend-list-item-container"], [data-e2e="browse-video"], article, [class*="DivItemContainer"], [class*="ItemContainer"]',
      ) as HTMLElement | null) || parentBar.parentElement?.parentElement;

    // Create action item matching TikTok's native style
    const actionWrapper = document.createElement("div");
    actionWrapper.className = INJECTED_CLASS;
    actionWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      margin-top: 10px;
      user-select: none;
      z-index: 10;
    `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Download without Watermark");
    btn.setAttribute("title", "Download without Watermark");
    btn.style.cssText = `
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    `;
    btn.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    `;

    const label = document.createElement("span");
    label.innerText = "Download";
    label.style.cssText = `
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      margin-top: 5px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: -0.01em;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
    `;

    btn.onmouseenter = () => {
      btn.style.transform = "scale(1.08)";
      btn.style.background = "#ffffff";
      btn.style.color = "#000000";
    };
    btn.onmouseleave = () => {
      btn.style.transform = "scale(1)";
      btn.style.background = "rgba(255, 255, 255, 0.12)";
      btn.style.color = "#ffffff";
    };

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (btn.disabled) return;

      let postUrl = itemContainer ? extractPostUrlFromContainer(itemContainer) : "";
      if (!postUrl) {
        postUrl = detectActiveTikTokUrl();
      }
      if (!postUrl && isTikTokUrl(location.href)) {
        postUrl = location.href;
      }

      if (!postUrl) {
        label.innerText = "No URL";
        setTimeout(() => { label.innerText = "Download"; }, 2000);
        return;
      }

      btn.disabled = true;
      label.innerText = "Fetching...";
      btn.style.opacity = "0.7";

      try {
        const resolveRes = await sendMessage<ResolveResult>({
          type: "media/resolve",
          url: postUrl,
          reason: "in-page-button",
        });

        label.innerText = "Saving...";

        await sendMessage({
          type: "downloads/start",
          request: {
            kind: resolveRes.media.contentType === "images" ? "images" : "video",
            media: resolveRes.media,
            saveAs: false,
          },
        });

        label.innerText = "Saved ✓";
        label.style.color = "#4ade80";
        btn.style.borderColor = "#4ade80";
        btn.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
      } catch (err) {
        label.innerText = "Error";
        label.style.color = "#f87171";
        logger.error("In-page download failed", err);
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.style.opacity = "1";
          btn.style.borderColor = "rgba(255, 255, 255, 0.2)";
          label.innerText = "Download";
          label.style.color = "#ffffff";
          btn.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          `;
        }, 3000);
      }
    });

    actionWrapper.appendChild(btn);
    actionWrapper.appendChild(label);

    // Insert right after the share wrapper in the action bar
    if (shareWrapper.nextSibling) {
      parentBar.insertBefore(actionWrapper, shareWrapper.nextSibling);
    } else {
      parentBar.appendChild(actionWrapper);
    }
  }
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

  // Always keep injected buttons up to date on new DOM items
  injectDownloadButtons();

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

  // Rapid 250ms interval check for SPA state changes and newly rendered videos
  locationPollId = window.setInterval(() => {
    scheduleRefresh();
  }, 350);
}

async function init(): Promise<void> {
  await loadSettings();
  await processPageState();
  observeUrlChanges();
}

init().catch((error) => logger.error("Content script bootstrap failed", error));
