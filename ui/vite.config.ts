import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 18790,
    proxy: {
      "/api": "http://localhost:18789",
      "/ws": {
        target: "ws://localhost:18789",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist/control-ui",
    emptyOutDir: true,
    sourcemap: true,
  },
});
