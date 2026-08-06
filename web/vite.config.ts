import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = "http://localhost:8766";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/twitch": { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
