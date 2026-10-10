import { describe, expect, it } from "vitest";
import {
  extractTwitterStatusId,
  extractTwitterUsername,
  isTwitterUrl,
  normalizeTwitterUrl,
} from "../twitter";

describe("twitter url handling", () => {
  it("detects valid x.com and twitter.com status urls", () => {
    expect(isTwitterUrl("https://x.com/jack/status/20")).toBe(true);
    expect(isTwitterUrl("https://twitter.com/jack/status/20?s=20")).toBe(true);
    expect(isTwitterUrl("https://x.com/i/status/1785514660343734621")).toBe(true);
    expect(isTwitterUrl("https://mobile.twitter.com/user/status/123456789")).toBe(true);
    expect(isTwitterUrl("https://x.com/user/status/123456789/video/1")).toBe(true);
    expect(isTwitterUrl("https://x.com/user/status/123456789/photo/1")).toBe(true);
    expect(isTwitterUrl("https://tiktok.com/@user/video/123")).toBe(false);
    expect(isTwitterUrl("https://x.com/home")).toBe(false);
  });

  it("extracts status id and username", () => {
    expect(extractTwitterStatusId("https://x.com/jack/status/20")).toBe("20");
    expect(extractTwitterUsername("https://x.com/jack/status/20")).toBe("jack");
    expect(extractTwitterStatusId("https://x.com/i/status/9876543210")).toBe("9876543210");
  });

  it("normalizes twitter urls cleanly", () => {
    expect(normalizeTwitterUrl("https://twitter.com/jack/status/20?s=20&t=abc#ref")).toBe(
      "https://x.com/jack/status/20",
    );
    expect(normalizeTwitterUrl("https://x.com/i/status/12345?foo=bar")).toBe(
      "https://x.com/i/status/12345",
    );
  });
});
