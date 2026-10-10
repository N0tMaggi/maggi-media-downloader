import type { ContentType } from "./types";

const TWITTER_PATTERNS = {
  status:
    /^https?:\/\/(?:(?:www|mobile|m)\.)?(?:twitter\.com|x\.com)\/(?:([A-Za-z0-9_]{1,15})\/status(?:es)?\/|i\/(?:web\/)?status\/)(\d+)(?:[/?#].*)?$/i,
  mediaSuffix:
    /^https?:\/\/(?:(?:www|mobile|m)\.)?(?:twitter\.com|x\.com)\/(?:[A-Za-z0-9_]{1,15}\/status(?:es)?\/|i\/(?:web\/)?status\/)\d+\/(?:video|photo)\/\d+/i,
};

export function isTwitterUrl(url: string): boolean {
  if (!url) return false;
  return (
    TWITTER_PATTERNS.status.test(url.trim()) ||
    TWITTER_PATTERNS.mediaSuffix.test(url.trim())
  );
}

export function extractTwitterStatusId(url: string): string | null {
  const match = url.trim().match(/(?:status(?:es)?\/)(\d+)/i);
  return match ? match[1] : null;
}

export function extractTwitterUsername(url: string): string | null {
  const match = url
    .trim()
    .match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status/i);
  return match ? match[1] : null;
}

export function normalizeTwitterUrl(url: string): string {
  try {
    const trimmed = url.trim();
    const id = extractTwitterStatusId(trimmed);
    const username = extractTwitterUsername(trimmed) || "i";
    if (id) {
      return `https://x.com/${username}/status/${id}`;
    }

    const parsed = new URL(trimmed);
    parsed.host = "x.com";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function detectTwitterContentType(url: string): ContentType {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.includes("/photo/")) {
    return "images";
  }
  if (trimmed.includes("/video/")) {
    return "video";
  }
  return "unknown";
}
