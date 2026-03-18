import { normalizeTikTokUrl } from "./tiktok";
import type { ResolvedMedia } from "./types";

const API_ENDPOINT = "https://api.maggi.dev/v1/tiktok/tiktok.php";

interface ProviderApiPayload {
  status?: string;
  result?: {
    id?: string;
    author?: {
      username?: string;
    };
    video?: {
      playAddr?: string[];
      cover?: string[];
      dynamicCover?: string[];
    };
    images?: string[];
    music?: {
      playUrl?: string[];
      title?: string;
      author?: string;
    };
  };
}

export interface ProviderClient {
  resolveMedia(url: string): Promise<ResolvedMedia>;
}

export function mapProviderPayload(
  payload: ProviderApiPayload,
  sourceUrl: string,
): ResolvedMedia {
  if (payload.status !== "success" || !payload.result) {
    throw new Error("Provider returned an invalid response.");
  }

  const result = payload.result;
  const videoUrl = result.video?.playAddr?.[0] ?? null;
  const images = (result.images ?? []).map((url) => ({ url }));
  const musicUrl = result.music?.playUrl?.[0] ?? null;
  const normalizedUrl = normalizeTikTokUrl(sourceUrl);
  const contentType = images.length > 0 ? "images" : videoUrl ? "video" : "unknown";

  if (contentType === "unknown") {
    throw new Error("No downloadable media was found for this TikTok URL.");
  }

  return {
    sourceUrl,
    normalizedUrl,
    contentType,
    author: result.author?.username || "unknown",
    id: result.id || "tiktok-media",
    video: videoUrl ? { url: videoUrl } : null,
    images,
    music: musicUrl
      ? {
          url: musicUrl,
          title: result.music?.title || "tiktok-audio",
          author: result.music?.author || result.author?.username || "unknown",
        }
      : null,
    thumbnail:
      result.video?.cover?.[0] || result.video?.dynamicCover?.[0] || images[0]?.url || null,
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
    requestUrl.searchParams.set("api_key", "Demo");

    const response = await fetch(requestUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Provider request failed with HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as ProviderApiPayload;
    return mapProviderPayload(payload, normalizedUrl);
  }
}
