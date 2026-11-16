import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// The browser calls the API on the page's own origin, so dev needs no CORS.
const apiTarget = "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    strictPort: true,
    proxy: {
      // Effect's RPC client posts to `/rpc/`, with the trailing slash.
      "^/rpc/?$": apiTarget,
      "^/health$": apiTarget,
    },
  },
});
