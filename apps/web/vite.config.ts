import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 8000,
    strictPort: true,
    fs: { allow: ["../.."] },
    proxy: {
      "/api": { target: "http://127.0.0.1:8001", changeOrigin: false },
      "/reports": { target: "http://127.0.0.1:8001", changeOrigin: false },
    },
  },
  build: { sourcemap: true },
});
