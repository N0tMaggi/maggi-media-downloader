import { DEFAULT_SETTINGS } from "./settings";
import type {
  CacheEntry,
  ExtensionSettings,
  PageContext,
  RecentJob,
  StorageShape,
} from "./types";

export const CACHE_TTL_MS = 1000 * 60 * 60;
const MAX_RECENT_JOBS = 8;

const STORAGE_DEFAULTS: StorageShape = {
  settings: DEFAULT_SETTINGS,
  cache: {},
  recentJobs: [],
  pageContexts: {},
};

function storageGet<T extends keyof StorageShape>(
  key: T,
): Promise<StorageShape[T]> {
  return chrome.storage.local
    .get({ [key]: STORAGE_DEFAULTS[key] })
    .then((result) => result[key] as StorageShape[T]);
}

function storageSet<T extends keyof StorageShape>(
  key: T,
  value: StorageShape[T],
): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}

export async function getSettings(): Promise<ExtensionSettings> {
  const settings = await storageGet("settings");
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    defaultSaveAs: {
      ...DEFAULT_SETTINGS.defaultSaveAs,
      ...settings.defaultSaveAs,
    },
  };
}

export async function updateSettings(
  patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next = {
    ...current,
    ...patch,
    defaultSaveAs: {
      ...current.defaultSaveAs,
      ...patch.defaultSaveAs,
    },
  };
  await storageSet("settings", next);
  return next;
}

export async function getCachedMedia(key: string): Promise<CacheEntry | null> {
  const cache = await storageGet("cache");
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete cache[key];
    await storageSet("cache", cache);
    return null;
  }
  return entry;
}

export async function setCachedMedia(key: string, entry: CacheEntry): Promise<void> {
  const cache = await storageGet("cache");
  cache[key] = entry;
  await storageSet("cache", cache);
}

export async function getRecentJobs(limit = MAX_RECENT_JOBS): Promise<RecentJob[]> {
  const jobs = await storageGet("recentJobs");
  return jobs.slice(0, limit);
}

export async function pushRecentJob(job: RecentJob): Promise<void> {
  const jobs = await storageGet("recentJobs");
  const next = [job, ...jobs].slice(0, MAX_RECENT_JOBS);
  await storageSet("recentJobs", next);
}

export async function setPageContext(context: PageContext): Promise<void> {
  const pageContexts = await storageGet("pageContexts");
  pageContexts[String(context.tabId)] = context;
  await storageSet("pageContexts", pageContexts);
}

export async function getPageContext(tabId: number): Promise<PageContext | null> {
  const pageContexts = await storageGet("pageContexts");
  return pageContexts[String(tabId)] ?? null;
}

export async function clearPageContext(tabId: number): Promise<void> {
  const pageContexts = await storageGet("pageContexts");
  delete pageContexts[String(tabId)];
  await storageSet("pageContexts", pageContexts);
}
