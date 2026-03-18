import type { DownloadKind, ResolvedMedia } from "./types";

function sanitizeSegment(segment: string): string {
  return segment
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extensionFor(kind: DownloadKind): string {
  switch (kind) {
    case "audio":
      return "mp3";
    case "images":
      return "jpg";
    default:
      return "mp4";
  }
}

export function applyFilenameTemplate(
  template: string,
  media: ResolvedMedia,
  kind: DownloadKind,
  index?: number,
): string {
  const raw = template
    .replaceAll("{author}", media.author || "unknown")
    .replaceAll("{id}", media.id || "tiktok")
    .replaceAll("{type}", kind)
    .replaceAll("{index}", typeof index === "number" ? String(index + 1) : "")
    .replaceAll("{title}", media.music?.title || media.id || "download");

  return sanitizeSegment(raw) || `tiktok-${kind}`;
}

export function buildDownloadFilename(
  template: string,
  media: ResolvedMedia,
  kind: DownloadKind,
  index?: number,
): string {
  const base = applyFilenameTemplate(template, media, kind, index);
  return `${base}.${extensionFor(kind)}`;
}
