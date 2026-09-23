import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const studioRoot = path.join(projectRoot, "dataset-studio");
export default defineConfig({
  root: path.join(projectRoot, "docker"),
  publicDir: path.join(studioRoot, "public"),
  plugins: [react()],
  resolve: { alias: { "@": studioRoot } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
  build: { outDir: path.join(projectRoot, "dist-ui"), emptyOutDir: true },
});
