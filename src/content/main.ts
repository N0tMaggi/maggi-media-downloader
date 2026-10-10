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

export function getAuthorFromContainer(container: HTMLElement): string {
  const authorLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/@"]'));
  for (const link of authorLinks) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/@([A-Za-z0-9._]+)/);
    if (match) return `@${match[1]}`;
  }
  return "";
}

export function extractPostUrlFromContainer(container: HTMLElement): string {
  // A. Check all links in container
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href]"));
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/(?:@([A-Za-z0-9._]+)\/)?(?:video|v|photo)\/(\d{15,22})/);
    if (match) {
      const author = match[1] ? `@${match[1]}` : (getAuthorFromContainer(container) || "@tiktok");
      return `https://www.tiktok.com/${author}/video/${match[2]}`;
    }
  }

  // B. Check all element IDs in container (XGPlayer: id="xgwrapper-0-7424123456789012345")
  const allElements = [container, ...Array.from(container.querySelectorAll<HTMLElement>("*"))];
  for (const el of allElements) {
    if (el.id) {
      const idMatch = el.id.match(/\b(\d{18,21})\b/);
      if (idMatch) {
        const author = getAuthorFromContainer(container) || "@tiktok";
        return `https://www.tiktok.com/${author}/video/${idMatch[1]}`;
      }
    }
    for (const attr of el.getAttributeNames()) {
      const val = el.getAttribute(attr);
      if (val) {
        const match = val.match(/\b(\d{18,21})\b/);
        if (match) {
          const author = getAuthorFromContainer(container) || "@tiktok";
          return `https://www.tiktok.com/${author}/video/${match[1]}`;
        }
      }
    }
  }

  // C. Check HTML contents for TikTok 19-digit snowflake ID (starts with 7)
  const html = container.innerHTML;
  const digitMatch = html.match(/\b(7\d{18})\b/);
  if (digitMatch) {
    const author = getAuthorFromContainer(container) || "@tiktok";
    return `https://www.tiktok.com/${author}/video/${digitMatch[1]}`;
  }

  return "";
}

function findActiveVideoContainer(): HTMLElement | null {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"));
  const vh = window.innerHeight;

  // 1. Look for playing video in viewport
  const playingVideo = videos.find((v) => {
    const rect = v.getBoundingClientRect();
    return !v.paused && v.readyState >= 2 && rect.bottom > 0 && rect.top < vh;
  });

  // 2. Or video closest to center
  let targetVideo = playingVideo || null;
  if (!targetVideo) {
    let minDistance = Number.POSITIVE_INFINITY;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= vh) continue;
      const dist = Math.abs(vh / 2 - (rect.top + rect.height / 2));
      if (dist < minDistance) {
        minDistance = dist;
        targetVideo = video;
      }
    }
  }

  if (!targetVideo) return null;

  // Walk up from targetVideo to find the top-level feed item container
  let el: HTMLElement | null = targetVideo.parentElement;
  let bestContainer: HTMLElement | null = null;

  while (el && el !== document.body && el !== document.documentElement) {
    const hasAuthor = el.querySelector('a[href*="/@"]');
    const hasActions = el.querySelector(
      '[data-e2e*="share"], [data-e2e*="like"], [data-e2e*="comment"], [aria-label*="Teilen" i], [aria-label*="Share" i]',
    );
    if (hasAuthor || hasActions) {
      bestContainer = el;
      if (hasAuthor && hasActions) {
        return el;
      }
    }
    el = el.parentElement;
  }

  return bestContainer || targetVideo.parentElement;
}

export function detectActiveTikTokUrl(): string {
  // 1. Direct post URL in browser address bar (when URL is /@user/video/123)
  if (isTikTokUrl(location.href)) {
    return location.href;
  }

  // 2. Open Modal post viewer (e.g. desktop full view popup)
  const modal = document.querySelector<HTMLElement>('[data-e2e="browse-video"]');
  if (modal) {
    const modalUrl = extractPostUrlFromContainer(modal);
    if (modalUrl) return modalUrl;
  }

  // 3. Find active/playing video container on main feed
  const activeContainer = findActiveVideoContainer();
  if (activeContainer) {
    const postUrl = extractPostUrlFromContainer(activeContainer);
    if (postUrl) return postUrl;
  }

  // 4. Fallback: inspect any container on the page
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-e2e="recommend-list-item-container"], article, [class*="DivItemContainer"], [class*="ItemContainer"]',
    ),
  );
  const vh = window.innerHeight;
  for (const c of containers) {
    const rect = c.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < vh) {
      const url = extractPostUrlFromContainer(c);
      if (url) return url;
    }
  }

  return "";
}

function isCommentElement(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest(
    '[data-e2e*="comment-list"], [data-e2e*="comment-item"], [data-e2e*="comment-level"], [class*="CommentList"], [class*="CommentItem"], [class*="comment-item"], [class*="DivCommentList"], [class*="DivCommentItem"], [class*="DivCommentContainer"], [class*="CommentContainer"], [class*="CommentContent"], [data-e2e*="comment-like"]',
  );
}

function findActionRails(): HTMLElement[] {
  const rails: HTMLElement[] = [];

  // Exclusively target video action elements (never comments)
  const actionTriggers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-e2e="feed-share-icon"], [data-e2e="share-icon"], [data-e2e="video-share-container"], [data-e2e="share-button"], [data-e2e="feed-favorite-icon"], [data-e2e="feed-like-icon"], [data-e2e="feed-comment-icon"]',
    ),
  );

  // Also include modal share / action container if present
  const modal = document.querySelector<HTMLElement>('[data-e2e="browse-video"]');
  if (modal) {
    const modalShare = modal.querySelector<HTMLElement>(
      '[data-e2e*="share"], [class*="DivShare"], [class*="ShareContainer"]',
    );
    if (modalShare && !isCommentElement(modalShare)) {
      actionTriggers.push(modalShare);
    }
  }

  for (const el of actionTriggers) {
    if (isCommentElement(el)) continue;

    const rail =
      (el.closest(
        '[class*="ActionItemContainer"], [class*="DivActionItemContainer"], [class*="ActionBar"], [class*="Actions"]',
      ) as HTMLElement | null) || (el.parentElement?.parentElement as HTMLElement | null);

    if (rail && rail instanceof HTMLElement && !isCommentElement(rail) && !rails.includes(rail)) {
      rails.push(rail);
    }
  }

  return rails;
}

function injectDownloadButtons(): void {
  // 1. Instantly remove any rogue buttons inside comments or duplicates
  const allInjected = Array.from(document.querySelectorAll<HTMLElement>(`.${INJECTED_CLASS}`));
  const seenRails = new Set<HTMLElement>();
  for (const item of allInjected) {
    if (isCommentElement(item)) {
      item.remove();
      continue;
    }
    const parent = item.parentElement;
    if (!parent || seenRails.has(parent)) {
      item.remove();
    } else {
      seenRails.add(parent);
    }
  }

  // 2. Discover all legitimate video action rails on the page
  const rails = findActionRails();

  for (const actionRail of rails) {
    if (isCommentElement(actionRail)) continue;

    // Already has our button or is marked as injected? Skip immediately!
    if (
      actionRail.dataset.maggiInjected === "true" ||
      actionRail.querySelector(`.${INJECTED_CLASS}`) ||
      actionRail.closest(`[data-maggi-injected="true"]`)
    ) {
      continue;
    }

    actionRail.dataset.maggiInjected = "true";

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
      z-index: 9999;
    `;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", "Download without Watermark");
    btn.setAttribute("title", "Download without Watermark");
    btn.style.cssText = `
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.14);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
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
      btn.style.background = "rgba(255, 255, 255, 0.14)";
      btn.style.color = "#ffffff";
    };

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (btn.disabled) return;

      // Find the parent post container for this specific rail
      const feedContainer =
        (actionRail.closest(
          '[data-e2e="recommend-list-item-container"], [data-e2e="browse-video"], article, [class*="DivItemContainer"], [class*="ItemContainer"]',
        ) as HTMLElement | null) ||
        (actionRail.parentElement?.parentElement as HTMLElement | null) ||
        actionRail.parentElement;

      let postUrl = feedContainer ? extractPostUrlFromContainer(feedContainer) : "";
      if (!postUrl) {
        postUrl = detectActiveTikTokUrl();
      }
      if (!postUrl && isTikTokUrl(location.href)) {
        postUrl = location.href;
      }

      if (!postUrl) {
        label.innerText = "No URL";
        setTimeout(() => {
          label.innerText = "Download";
        }, 2000);
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
          btn.style.borderColor = "rgba(255, 255, 255, 0.25)";
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
    actionRail.appendChild(actionWrapper);
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

  // Fast 80ms response time on scrolling / navigation
  refreshTimeoutId = window.setTimeout(() => {
    refreshTimeoutId = null;
    void processPageState();
  }, 80);
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
  }, 300);
}

function bindDirectMessageListener(): void {
  // Listen for direct queries from popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "content/getActivePost") {
      const url = detectActiveTikTokUrl();
      sendResponse({ url });
    }
    return true;
  });
}

async function init(): Promise<void> {
  bindDirectMessageListener();
  await loadSettings();
  await processPageState();
  observeUrlChanges();
}

init().catch((error) => logger.error("Content script bootstrap failed", error));
