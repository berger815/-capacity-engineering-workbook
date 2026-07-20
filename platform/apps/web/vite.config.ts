import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const localAssessmentMode = process.env.VITE_LOCAL_ASSESSMENT === "true" || process.env.VITE_STATIC_DEMO === "true";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  define: {
    // Backward-compatible compile alias while the runtime API contract migrates from the old demo terminology.
    "import.meta.env.VITE_STATIC_DEMO": JSON.stringify(localAssessmentMode ? "true" : "false"),
  },
  plugins: [react()],
  server: {
    port: 4173,
    proxy: {
      "/health": "http://127.0.0.1:3000",
      "/v1": "http://127.0.0.1:3000",
    },
  },
  preview: {
    port: 4173,
  },
});
