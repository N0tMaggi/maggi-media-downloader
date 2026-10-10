import { normalizeTikTokUrl } from "./tiktok";
import { isTwitterUrl, normalizeTwitterUrl, extractTwitterStatusId } from "./twitter";
import type { ResolvedMedia } from "./types";

const TIKTOK_API_ENDPOINT = "https://api.maggi.dev/tiktok";
const TWITTER_API_ENDPOINT = "https://api.maggi.dev/twitter";

// --- TikTok Types ---
interface TikTokAuthorPayload {
  username?: string;
  unique_id?: string;
  uniqueId?: string;
  nickname?: string;
  avatar?: string | string[];
  avatarThumb?: string | string[];
  avatarLarger?: string | string[];
  avatarMedium?: string | string[];
}

interface TikTokVideoPayload {
  playAddr?: string | string[];
  downloadAddr?: string | string[];
  cover?: string | string[];
  dynamicCover?: string | string[];
}

interface TikTokMusicPayload {
  playUrl?: string | string[];
  title?: string;
  author?: string;
}

interface TikTokResultPayload {
  id?: string;
  title?: string;
  desc?: string;
  author?: TikTokAuthorPayload;
  video?: TikTokVideoPayload;
  images?: Array<string | { url: string }>;
  music?: TikTokMusicPayload;
}

export interface TikTokApiPayload {
  status?: string;
  result?: TikTokResultPayload;
  data?: TikTokResultPayload;
  message?: string;
}

// --- Twitter Types ---
interface TwitterAuthor {
  name?: string;
  screenName?: string;
  avatarUrl?: string;
  url?: string;
}

interface TwitterVariant {
  bitrate?: number;
  content_type?: string;
  url: string;
}

interface TwitterMediaVideo {
  url?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  variants?: TwitterVariant[];
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
}

interface TwitterMediaPhoto {
  url?: string;
  width?: number;
  height?: number;
  altText?: string;
}

interface TwitterMediaGif {
  url?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
}

interface TwitterMedia {
  videos?: TwitterMediaVideo[];
  photos?: Array<string | TwitterMediaPhoto>;
  gifs?: TwitterMediaGif[];
}

interface TwitterResult {
  id?: string;
  url?: string;
  text?: string;
  type?: string;
  author?: TwitterAuthor;
  media?: TwitterMedia;
}

export interface TwitterApiPayload {
  status?: string;
  source?: string;
  result?: TwitterResult;
  data?: TwitterResult;
  downloadUrl?: string | null;
  message?: string;
  code?: string;
}

export interface ProviderClient {
  resolveMedia(url: string): Promise<ResolvedMedia>;
}

function firstString(value: string | string[] | undefined | null): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return typeof value === "string" ? value : null;
}

export function mapTikTokPayload(
  payload: TikTokApiPayload | Record<string, unknown>,
  sourceUrl: string,
): ResolvedMedia {
  const container = (payload as TikTokApiPayload).result ?? (payload as TikTokApiPayload).data ?? payload;
  const status = (payload as TikTokApiPayload).status;

  if (status === "error" || !container || typeof container !== "object") {
    throw new Error((payload as TikTokApiPayload).message || "TikTok provider returned an invalid response.");
  }

  const result = container as TikTokResultPayload;
  const videoUrl = firstString(result.video?.playAddr) ?? firstString(result.video?.downloadAddr);

  const rawImages = result.images ?? [];
  const images = rawImages
    .map((item) => {
      if (typeof item === "string") return { url: item };
      if (item && typeof item === "object" && "url" in item) return { url: String(item.url) };
      return { url: "" };
    })
    .filter((img) => Boolean(img.url));

  const musicUrl = firstString(result.music?.playUrl);
  const normalizedUrl = normalizeTikTokUrl(sourceUrl);
  const contentType = images.length > 0 ? "images" : videoUrl ? "video" : "unknown";

  if (contentType === "unknown") {
    throw new Error("No downloadable media was found for this TikTok URL.");
  }

  const username =
    result.author?.username ||
    result.author?.unique_id ||
    result.author?.uniqueId ||
    "unknown";

  const nickname = result.author?.nickname || username;
  const avatar =
    firstString(result.author?.avatar) ||
    firstString(result.author?.avatarLarger) ||
    firstString(result.author?.avatarMedium) ||
    firstString(result.author?.avatarThumb) ||
    null;

  const title = result.title || result.desc || null;
  const thumbnail =
    firstString(result.video?.cover) ||
    firstString(result.video?.dynamicCover) ||
    images[0]?.url ||
    null;

  return {
    sourceUrl,
    normalizedUrl,
    contentType,
    author: username,
    authorNickname: nickname,
    authorAvatar: avatar,
    title,
    id: result.id || "tiktok-media",
    video: videoUrl ? { url: videoUrl } : null,
    images,
    music: musicUrl
      ? {
          url: musicUrl,
          title: result.music?.title || "tiktok-audio",
          author: result.music?.author || username,
        }
      : null,
    thumbnail,
    providerMeta: {
      provider: "api.maggi.dev/tiktok",
      resolvedAt: Date.now(),
    },
  };
}

export function mapTwitterPayload(
  payload: TwitterApiPayload | Record<string, unknown>,
  sourceUrl: string,
): ResolvedMedia {
  const typed = payload as TwitterApiPayload;
  if (typed.status === "error") {
    throw new Error(typed.message || "Twitter extractor failed to resolve this tweet.");
  }

  const result = typed.result ?? typed.data ?? (payload as TwitterResult);
  if (!result || typeof result !== "object") {
    throw new Error("Invalid Twitter response payload.");
  }

  // 1. Photos
  const rawPhotos = result.media?.photos ?? [];
  const images = rawPhotos
    .map((item) => {
      if (typeof item === "string") return { url: item };
      if (item && typeof item === "object" && "url" in item && item.url) {
        return { url: item.url };
      }
      return { url: "" };
    })
    .filter((img) => Boolean(img.url));

  // 2. Video & GIFs
  let videoUrl: string | null = null;
  let videoThumbnail: string | null = null;

  if (Array.isArray(result.media?.videos) && result.media.videos.length > 0) {
    const video = result.media.videos[0];
    if (Array.isArray(video.variants) && video.variants.length > 0) {
      const sorted = video.variants
        .filter((v) => !v.content_type || v.content_type.includes("mp4") || v.url.includes(".mp4"))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      videoUrl = sorted[0]?.url || video.variants[0]?.url || video.url || null;
    } else {
      videoUrl = video.url || null;
    }
    videoThumbnail = video.thumbnail_url || video.thumbnailUrl || null;
  } else if (Array.isArray(result.media?.gifs) && result.media.gifs.length > 0) {
    const gif = result.media.gifs[0];
    videoUrl = gif.url || null;
    videoThumbnail = gif.thumbnail_url || gif.thumbnailUrl || null;
  } else if (typed.downloadUrl) {
    videoUrl = typed.downloadUrl;
  }

  const normalizedUrl = normalizeTwitterUrl(sourceUrl);
  const contentType = images.length > 0 ? "images" : videoUrl ? "video" : "unknown";

  if (contentType === "unknown") {
    throw new Error("No downloadable video or photo media was found in this tweet.");
  }

  const authorScreen = result.author?.screenName || result.author?.name || "twitter_user";
  const authorNickname = result.author?.name || `@${authorScreen}`;
  const authorAvatar = result.author?.avatarUrl || null;
  const title = result.text || null;
  const id = result.id || extractTwitterStatusId(sourceUrl) || "tweet";
  const thumbnail = videoThumbnail || images[0]?.url || authorAvatar;

  return {
    sourceUrl,
    normalizedUrl,
    contentType,
    author: authorScreen,
    authorNickname,
    authorAvatar,
    title,
    id,
    video: videoUrl ? { url: videoUrl } : null,
    images,
    music: null,
    thumbnail,
    providerMeta: {
      provider: "api.maggi.dev/twitter",
      resolvedAt: Date.now(),
    },
  };
}

// Backward-compatibility export
export const mapProviderPayload = mapTikTokPayload;

export class MaggiProviderClient implements ProviderClient {
  async resolveMedia(url: string): Promise<ResolvedMedia> {
    if (isTwitterUrl(url)) {
      return this.resolveTwitter(url);
    }
    return this.resolveTikTok(url);
  }

  private async resolveTikTok(url: string): Promise<ResolvedMedia> {
    const normalizedUrl = normalizeTikTokUrl(url);
    const requestUrl = new URL(TIKTOK_API_ENDPOINT);
    requestUrl.searchParams.set("url", normalizedUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(requestUrl.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`TikTok provider request failed with HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as TikTokApiPayload;
      return mapTikTokPayload(payload, normalizedUrl);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Resolution timed out after 12 seconds. Please check your connection.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async resolveTwitter(url: string): Promise<ResolvedMedia> {
    const normalizedUrl = normalizeTwitterUrl(url);
    const requestUrl = new URL(TWITTER_API_ENDPOINT);
    requestUrl.searchParams.set("url", normalizedUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(requestUrl.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Twitter extractor failed with HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as TwitterApiPayload;
      return mapTwitterPayload(payload, normalizedUrl);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Twitter extractor request timed out after 12 seconds.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
