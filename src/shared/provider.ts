import { normalizeTikTokUrl } from "./tiktok";
import type { ResolvedMedia } from "./types";

const API_ENDPOINT = "https://api.maggi.dev/tiktok";

interface AuthorPayload {
  username?: string;
  unique_id?: string;
  uniqueId?: string;
  nickname?: string;
  avatar?: string | string[];
  avatarThumb?: string | string[];
  avatarLarger?: string | string[];
  avatarMedium?: string | string[];
}

interface VideoPayload {
  playAddr?: string | string[];
  downloadAddr?: string | string[];
  cover?: string | string[];
  dynamicCover?: string | string[];
}

interface MusicPayload {
  playUrl?: string | string[];
  title?: string;
  author?: string;
}

interface ResultPayload {
  id?: string;
  title?: string;
  desc?: string;
  author?: AuthorPayload;
  video?: VideoPayload;
  images?: Array<string | { url: string }>;
  music?: MusicPayload;
}

interface ProviderApiPayload {
  status?: string;
  result?: ResultPayload;
  data?: ResultPayload;
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

export function mapProviderPayload(
  payload: ProviderApiPayload | Record<string, unknown>,
  sourceUrl: string,
): ResolvedMedia {
  const container = (payload as ProviderApiPayload).result ?? (payload as ProviderApiPayload).data ?? payload;
  const status = (payload as ProviderApiPayload).status;

  if (status === "error" || !container || typeof container !== "object") {
    throw new Error("Provider returned an invalid response.");
  }

  const result = container as ResultPayload;
  const videoUrl = firstString(result.video?.playAddr) ?? firstString(result.video?.downloadAddr);
  
  const rawImages = result.images ?? [];
  const images = rawImages.map((item) => {
    if (typeof item === "string") return { url: item };
    if (item && typeof item === "object" && "url" in item) return { url: String(item.url) };
    return { url: "" };
  }).filter((img) => Boolean(img.url));

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
      provider: "api.maggi.dev",
      resolvedAt: Date.now(),
    },
  };
}

export class MaggiProviderClient implements ProviderClient {
  async resolveMedia(url: string): Promise<ResolvedMedia> {
    const normalizedUrl = normalizeTikTokUrl(url);
    const requestUrl = new URL(API_ENDPOINT);
    requestUrl.searchParams.set("url", normalizedUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(requestUrl.toString(), {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Provider request failed with HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as ProviderApiPayload;
      return mapProviderPayload(payload, normalizedUrl);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Resolution timed out after 12 seconds. Please check your connection.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
