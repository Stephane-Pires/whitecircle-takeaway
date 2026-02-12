import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      $lib: path.resolve(__dirname, "./src/lib"),
    },
  },
  test: {
    environment: "jsdom",
    ui: true,
  },
});
