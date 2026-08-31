import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from "@openai/sites-vite-plugin";

const isSitesBuild = process.env.STRYKER_SITES_BUILD === "1";

export default defineConfig({
  plugins: [react(), ...(isSitesBuild ? [sites()] : [])],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
