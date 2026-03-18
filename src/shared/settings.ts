import type { ExtensionSettings } from "./types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: "system",
  filenameTemplate: "{author}-{id}-{type}",
  defaultSaveAs: {
    video: true,
    audio: true,
    images: false,
  },
  autoDetectActiveTab: true,
  showInPageAction: true,
  debugLogging: false,
};
