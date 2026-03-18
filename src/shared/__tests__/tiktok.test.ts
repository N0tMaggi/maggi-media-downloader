import { describe, expect, it } from "vitest";
import {
  detectTikTokContentType,
  isTikTokUrl,
  normalizeTikTokUrl,
} from "../tiktok";

describe("tiktok utils", () => {
  it("normalizes removable query parameters", () => {
    expect(
      normalizeTikTokUrl(
        "https://www.tiktok.com/@creator/video/123?is_copy_url=1&lang=en#fragment",
      ),
    ).toBe("https://www.tiktok.com/@creator/video/123");
  });

  it("detects supported TikTok URLs", () => {
    expect(isTikTokUrl("https://www.tiktok.com/@creator/video/123")).toBe(true);
    expect(isTikTokUrl("https://www.tiktok.com/@creator/photo/123")).toBe(true);
    expect(isTikTokUrl("https://example.com/post")).toBe(false);
  });

  it("maps urls to content types", () => {
    expect(detectTikTokContentType("https://www.tiktok.com/@creator/video/123")).toBe(
      "video",
    );
    expect(detectTikTokContentType("https://www.tiktok.com/@creator/photo/123")).toBe(
      "images",
    );
  });
});
