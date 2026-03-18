import { describe, expect, it } from "vitest";
import { mapProviderPayload } from "../provider";

describe("provider mapping", () => {
  it("maps video payloads to resolved media", () => {
    const media = mapProviderPayload(
      {
        status: "success",
        result: {
          id: "123",
          author: { username: "creator" },
          video: { playAddr: ["https://cdn.example/video.mp4"] },
          music: {
            playUrl: ["https://cdn.example/audio.mp3"],
            title: "track",
            author: "creator",
          },
        },
      },
      "https://www.tiktok.com/@creator/video/123",
    );

    expect(media.contentType).toBe("video");
    expect(media.video?.url).toBe("https://cdn.example/video.mp4");
    expect(media.music?.title).toBe("track");
  });

  it("rejects invalid payloads", () => {
    expect(() =>
      mapProviderPayload(
        {
          status: "error",
        },
        "https://www.tiktok.com/@creator/video/123",
      ),
    ).toThrow("Provider returned an invalid response.");
  });
});
