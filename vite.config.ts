import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri expects a fixed dev-server port and serves the built frontend from
// `frontend/dist` (see backend/tauri.conf.json). The Vite root is `frontend/`.
export default defineConfig({
  root: "frontend",
  plugins: [react(), tailwindcss()],
  // Prevent Vite from clobbering Rust compiler output in the terminal.
  clearScreen: false,
  // Expose TAURI_* env vars to the frontend alongside the default VITE_ prefix.
  envPrefix: ["VITE_", "TAURI_"],
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    watch: {
      // Don't watch the Rust side; tauri-cli handles that.
      ignored: ["**/backend/**", "**/target/**"],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // WebView2 on Windows tracks Edge/Chromium; target a modern baseline.
    target: "chrome110",
    sourcemap: false,
  },
});
