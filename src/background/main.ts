import { buildDownloadFilename } from "../shared/filename";
import { createLogger, setDebugLogging } from "../shared/logger";
import { fail, ok, type ExtensionEvent, type ExtensionMessage } from "../shared/messages";
import { MaggiProviderClient } from "../shared/provider";
import {
  CACHE_TTL_MS,
  clearPageContext,
  getCachedMedia,
  getPageContext,
  getRecentJobs,
  getSettings,
  pushRecentJob,
  setCachedMedia,
  setPageContext,
  updateSettings,
} from "../shared/storage";
import { normalizeMediaUrl } from "../shared/platforms";
import type { DownloadKind, DownloadRequest, PageContext, ResolvedMedia } from "../shared/types";

const logger = createLogger("background");
const provider = new MaggiProviderClient();

function emitEvent(event: ExtensionEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {
    // No open popup/options listener is expected most of the time.
  });
}

async function bootstrapLogging(): Promise<void> {
  const settings = await getSettings();
  setDebugLogging(settings.debugLogging);
}

function createJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveMedia(url: string) {
  const normalized = normalizeMediaUrl(url);
  const cached = await getCachedMedia(normalized);

  if (cached) {
    return {
      media: cached.media,
      cacheHit: true,
      cacheAge: Date.now() - cached.timestamp,
    };
  }

  const media = await provider.resolveMedia(normalized);
  await setCachedMedia(normalized, { media, timestamp: Date.now() });
  return {
    media,
    cacheHit: false,
    cacheAge: 0,
  };
}

async function downloadAsset(
  url: string,
  filename: string,
  saveAs: boolean,
): Promise<number> {
  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs,
  });

  if (typeof downloadId !== "number") {
    throw new Error("The browser rejected the download request.");
  }

  return downloadId;
}

function selectAssetUrls(
  media: ResolvedMedia,
  kind: DownloadKind,
  itemIndex?: number,
): { url: string; index?: number }[] {
  switch (kind) {
    case "audio":
      return media.music?.url ? [{ url: media.music.url }] : [];
    case "images":
      if (typeof itemIndex === "number" && media.images[itemIndex]) {
        return [{ url: media.images[itemIndex].url, index: itemIndex }];
      }
      return media.images.map((image, index) => ({ url: image.url, index }));
    default:
      return media.video?.url ? [{ url: media.video.url }] : [];
  }
}

async function startDownloads(request: DownloadRequest) {
  const settings = await getSettings();
  const assets = selectAssetUrls(request.media, request.kind, request.itemIndex);
  if (!assets.length) {
    throw new Error(`No ${request.kind} asset is available for this post.`);
  }

  const saveAs = request.saveAs ?? settings.defaultSaveAs[request.kind];
  const downloadIds: number[] = [];

  for (const asset of assets) {
    const filename = buildDownloadFilename(
      settings.filenameTemplate,
      request.media,
      request.kind,
      asset.index,
    );
    const downloadId = await downloadAsset(asset.url, filename, saveAs);
    downloadIds.push(downloadId);
  }

  const primaryIndex = assets[0]?.index;
  await pushRecentJob({
    id: createJobId(),
    kind: request.kind,
    filename: buildDownloadFilename(
      settings.filenameTemplate,
      request.media,
      request.kind,
      primaryIndex,
    ),
    sourceUrl: request.media.sourceUrl,
    createdAt: Date.now(),
    status: "started",
    downloadIds,
  });

  return { downloadIds, saveAs };
}

async function getActiveTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return typeof tab?.id === "number" ? tab.id : null;
}

async function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
) {
  switch (message.type) {
    case "page/contextDetected": {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") {
        return ok({ stored: false });
      }

      const context: PageContext = { ...message.context, tabId };
      await setPageContext(context);
      emitEvent({ type: "page/contextUpdated", context });
      return ok({ stored: true });
    }
    case "page/contextCleared": {
      const tabId = sender.tab?.id;
      if (typeof tabId !== "number") {
        return ok({ cleared: false });
      }
      await clearPageContext(tabId);
      emitEvent({ type: "page/contextRemoved", tabId });
      return ok({ cleared: true });
    }
    case "page/getContext": {
      const tabId = message.tabId ?? (await getActiveTabId());
      const context = typeof tabId === "number" ? await getPageContext(tabId) : null;
      return ok({ context });
    }
    case "media/resolve": {
      const result = await resolveMedia(message.url);
      return ok(result);
    }
    case "downloads/start": {
      const result = await startDownloads(message.request);
      return ok(result);
    }
    case "settings/get": {
      const settings = await getSettings();
      return ok({ settings });
    }
    case "settings/update": {
      const settings = await updateSettings(message.settings);
      setDebugLogging(settings.debugLogging);
      return ok({ settings });
    }
    case "jobs/listRecent": {
      const jobs = await getRecentJobs(message.limit);
      return ok({ jobs });
    }
    default:
      return fail("Unsupported message type.");
  }
}

chrome.runtime.onInstalled.addListener(() => {
  bootstrapLogging().catch((error) => logger.error("Failed to bootstrap logging", error));
});

chrome.runtime.onStartup.addListener(() => {
  bootstrapLogging().catch((error) => logger.error("Failed to bootstrap logging", error));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearPageContext(tabId).catch((error) =>
    logger.error("Failed to clear page context", error),
  );
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch(async (error: unknown) => {
      const settings = await getSettings().catch(() => null);
      setDebugLogging(!!settings?.debugLogging);
      logger.error("Message handling failed", error);
      sendResponse(
        fail(error instanceof Error ? error.message : "Unexpected background error."),
      );
    });

  return true;
});

bootstrapLogging().catch((error) => logger.error("Initial logging bootstrap failed", error));
logger.info(`Background ready. Cache TTL ${CACHE_TTL_MS}ms.`);
