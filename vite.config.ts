import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";

const isSitesBuild = process.env.STRYKER_SITES_BUILD === "1";
// Même variable que server/index.js pour que le proxy suive toujours le moteur local.
const apiPort = process.env.STRYKER_API_PORT || "3001";

export default defineConfig({
  plugins: [react(), ...(isSitesBuild ? [sites()] : [])],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
