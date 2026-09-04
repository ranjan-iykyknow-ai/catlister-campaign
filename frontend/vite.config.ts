import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot } from "vite";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(frontendRoot, "src"),
    },
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(frontendRoot)],
    },
    proxy: {
      "/v1": "http://127.0.0.1:8000",
      "/healthcheck": "http://127.0.0.1:8000",
    },
  },
});
