import type { ContentType } from "./types";

const PATTERNS = {
  video:
    /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/)?(?:video|v)\/\d+(?:[/?].*)?$/i,
  photo:
    /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/)?photo\/\d+(?:[/?].*)?$/i,
  short: /^https?:\/\/(vm|vt|m)\.tiktok\.com\/[\w/]+(?:\?.*)?$/i,
};

export function normalizeTikTokUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    ["is_copy_url", "is_from_webapp_v1", "lang"].forEach((key) =>
      parsed.searchParams.delete(key),
    );
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function isTikTokUrl(url: string): boolean {
  const normalized = normalizeTikTokUrl(url);
  return Object.values(PATTERNS).some((pattern) => pattern.test(normalized));
}

export function detectTikTokContentType(url: string): ContentType {
  const normalized = normalizeTikTokUrl(url);
  if (PATTERNS.video.test(normalized) || PATTERNS.short.test(normalized)) {
    return "video";
  }
  if (PATTERNS.photo.test(normalized)) {
    return "images";
  }
  return "unknown";
}

export function describeContentType(type: ContentType): string {
  switch (type) {
    case "video":
      return "Video";
    case "images":
      return "Photo set";
    default:
      return "Unknown";
  }
}
