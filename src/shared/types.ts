export type ContentType = "video" | "images" | "unknown";
export type ThemeMode = "light" | "dark" | "system";
export type DownloadKind = "video" | "audio" | "images";

export interface MediaAsset {
  url: string;
}

export interface MusicAsset {
  url: string;
  title: string;
  author: string;
}

export interface ProviderMeta {
  provider: string;
  resolvedAt: number;
}

export interface ResolvedMedia {
  sourceUrl: string;
  normalizedUrl: string;
  contentType: ContentType;
  author: string;
  id: string;
  video: MediaAsset | null;
  images: MediaAsset[];
  music: MusicAsset | null;
  thumbnail: string | null;
  providerMeta: ProviderMeta;
}

export interface PageContext {
  tabId: number;
  url: string;
  normalizedUrl: string;
  contentType: ContentType;
  detectedAt: number;
}

export interface ResolveResult {
  media: ResolvedMedia;
  cacheHit: boolean;
  cacheAge: number;
}

export interface SaveAsDefaults {
  video: boolean;
  audio: boolean;
  images: boolean;
}

export interface ExtensionSettings {
  theme: ThemeMode;
  filenameTemplate: string;
  defaultSaveAs: SaveAsDefaults;
  autoDetectActiveTab: boolean;
  showInPageAction: boolean;
  debugLogging: boolean;
}

export interface RecentJob {
  id: string;
  kind: DownloadKind;
  filename: string;
  sourceUrl: string;
  createdAt: number;
  status: "started" | "failed";
  downloadIds: number[];
}

export interface DownloadRequest {
  kind: DownloadKind;
  media: ResolvedMedia;
  saveAs?: boolean;
}

export interface CacheEntry {
  media: ResolvedMedia;
  timestamp: number;
}

export interface StorageShape {
  settings: ExtensionSettings;
  cache: Record<string, CacheEntry>;
  recentJobs: RecentJob[];
  pageContexts: Record<string, PageContext>;
}
