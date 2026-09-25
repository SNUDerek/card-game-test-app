import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/cards": "http://localhost:2567",
      "/api": "http://localhost:2567",
      // Mirrors the nginx rule in client/nginx.conf.template, so the default
      // "same origin" endpoint resolves identically in dev and in Docker.
      "/colyseus": {
        target: "http://localhost:2567",
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ""),
      },
    },
  },
});
