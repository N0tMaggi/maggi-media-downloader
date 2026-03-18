import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import webExtension from "@samrum/vite-plugin-web-extension";

const manifest = JSON.parse(
  readFileSync(resolve(__dirname, "manifest.json"), "utf-8"),
);

export default defineConfig({
  plugins: [
    webExtension({
      manifest,
      useDynamicUrlWebAccessibleResources: false,
      additionalInputs: {
        html: ["options.html"],
      },
    }),
  ],
  build: {
    target: "chrome114",
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
