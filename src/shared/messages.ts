import type {
  DownloadRequest,
  ExtensionSettings,
  PageContext,
  RecentJob,
} from "./types";

export type ExtensionMessage =
  | { type: "page/contextDetected"; context: Omit<PageContext, "tabId"> }
  | { type: "page/contextCleared" }
  | { type: "page/getContext"; tabId?: number }
  | { type: "media/resolve"; url: string; reason?: string }
  | { type: "downloads/start"; request: DownloadRequest }
  | { type: "settings/get" }
  | { type: "settings/update"; settings: Partial<ExtensionSettings> }
  | { type: "jobs/listRecent"; limit?: number };

export type ExtensionEvent =
  | { type: "page/contextUpdated"; context: PageContext }
  | { type: "page/contextRemoved"; tabId: number };

export type MessageResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface SettingsResponse {
  settings: ExtensionSettings;
}

export interface RecentJobsResponse {
  jobs: RecentJob[];
}

export function ok<T>(data: T): MessageResponse<T> {
  return { ok: true, data };
}

export function fail<T>(error: string): MessageResponse<T> {
  return { ok: false, error };
}
