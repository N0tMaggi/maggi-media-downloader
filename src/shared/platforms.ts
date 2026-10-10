import {
  detectTikTokContentType,
  isTikTokUrl,
  normalizeTikTokUrl,
} from "./tiktok";
import {
  detectTwitterContentType,
  isTwitterUrl,
  normalizeTwitterUrl,
} from "./twitter";
import type { ContentType } from "./types";

export type SupportedPlatform = "tiktok" | "twitter" | "unknown";

export function detectPlatform(url: string): SupportedPlatform {
  if (isTikTokUrl(url)) return "tiktok";
  if (isTwitterUrl(url)) return "twitter";
  return "unknown";
}

export function isSupportedMediaUrl(url: string): boolean {
  return isTikTokUrl(url) || isTwitterUrl(url);
}

export function normalizeMediaUrl(url: string): string {
  if (isTwitterUrl(url)) {
    return normalizeTwitterUrl(url);
  }
  if (isTikTokUrl(url)) {
    return normalizeTikTokUrl(url);
  }
  return url.trim();
}

export function detectMediaContentType(url: string): ContentType {
  if (isTwitterUrl(url)) {
    return detectTwitterContentType(url);
  }
  if (isTikTokUrl(url)) {
    return detectTikTokContentType(url);
  }
  return "unknown";
}

export function describeContentType(type: ContentType): string {
  switch (type) {
    case "video":
      return "Video";
    case "images":
      return "Photos";
    default:
      return "Media";
  }
}
