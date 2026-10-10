import { describe, expect, it } from "vitest";
import { mapProviderPayload, mapTwitterPayload } from "../provider";

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
    ).toThrow("TikTok provider returned an invalid response.");
  });

  it("maps twitter video and photo payloads cleanly", () => {
    const tweetMedia = mapTwitterPayload(
      {
        status: "success",
        source: "fxtwitter",
        result: {
          id: "20",
          text: "just setting up my twttr with video",
          author: {
            name: "Jack Dorsey",
            screenName: "jack",
            avatarUrl: "https://pbs.twimg.com/avatar.jpg",
          },
          media: {
            videos: [
              {
                url: "https://video.twimg.com/low.mp4",
                variants: [
                  { bitrate: 832000, content_type: "video/mp4", url: "https://video.twimg.com/high.mp4" },
                  { bitrate: 256000, content_type: "video/mp4", url: "https://video.twimg.com/low.mp4" },
                ],
                thumbnail_url: "https://pbs.twimg.com/thumb.jpg",
              },
            ],
            photos: [],
          },
        },
      },
      "https://x.com/jack/status/20",
    );

    expect(tweetMedia.contentType).toBe("video");
    expect(tweetMedia.video?.url).toBe("https://video.twimg.com/high.mp4");
    expect(tweetMedia.author).toBe("jack");
    expect(tweetMedia.authorNickname).toBe("Jack Dorsey");
    expect(tweetMedia.authorAvatar).toBe("https://pbs.twimg.com/avatar.jpg");
    expect(tweetMedia.thumbnail).toBe("https://pbs.twimg.com/thumb.jpg");
  });

  it("maps twitter photo sets", () => {
    const tweetPhotos = mapTwitterPayload(
      {
        status: "success",
        result: {
          id: "100",
          text: "some photos",
          author: { screenName: "photographer" },
          media: {
            photos: [
              { url: "https://pbs.twimg.com/photo1.jpg" },
              { url: "https://pbs.twimg.com/photo2.jpg" },
            ],
          },
        },
      },
      "https://x.com/photographer/status/100",
    );

    expect(tweetPhotos.contentType).toBe("images");
    expect(tweetPhotos.images).toHaveLength(2);
    expect(tweetPhotos.images[0].url).toBe("https://pbs.twimg.com/photo1.jpg");
  });
});
