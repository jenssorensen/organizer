import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
  ],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://localhost:3532",
    },
  },
});
