import { describe, expect, it } from "vitest";
import { applyFilenameTemplate, buildDownloadFilename } from "../filename";
import type { ResolvedMedia } from "../types";

const media: ResolvedMedia = {
  sourceUrl: "https://www.tiktok.com/@creator/video/123",
  normalizedUrl: "https://www.tiktok.com/@creator/video/123",
  contentType: "video",
  author: "creator",
  id: "123",
  video: { url: "https://cdn.example/video.mp4" },
  images: [],
  music: {
    url: "https://cdn.example/audio.mp3",
    title: "sound",
    author: "creator",
  },
  thumbnail: null,
  providerMeta: {
    provider: "test",
    resolvedAt: 1,
  },
};

describe("filename utils", () => {
  it("applies supported tokens", () => {
    expect(applyFilenameTemplate("{author}-{id}-{type}", media, "video")).toBe(
      "creator-123-video",
    );
  });

  it("adds image indexes and extensions", () => {
    expect(buildDownloadFilename("{author}-{index}", media, "images", 1)).toBe(
      "creator-2.jpg",
    );
  });
});
