import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("node_modules/katex")
          ) {
            return "markdown-math-vendor";
          }

          if (
            id.includes("node_modules/react-markdown")
            || id.includes("node_modules/rehype-autolink-headings")
            || id.includes("node_modules/rehype-sanitize")
            || id.includes("node_modules/rehype-slug")
            || id.includes("node_modules/rehype-raw")
            || id.includes("node_modules/remark-gfm")
            || id.includes("node_modules/remark-emoji")
            || id.includes("node_modules/remark-github-blockquote-alert")
          ) {
            return "markdown-vendor";
          }

          if (
            id.includes("node_modules/react-syntax-highlighter")
            || id.includes("node_modules/refractor")
            || id.includes("node_modules/prismjs")
          ) {
            return "syntax-vendor";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:3532",
    },
  },
});
