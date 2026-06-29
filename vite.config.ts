import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

function swVersionPlugin() {
  return {
    name: "sw-version-inject",
    closeBundle() {
      const swPath = resolve(process.cwd(), "dist/client/sw.js");
      if (!existsSync(swPath)) return;
      const version = Date.now().toString(36);
      const content = readFileSync(swPath, "utf-8");
      writeFileSync(swPath, content.replace(/__SW_VERSION__/g, version));
    },
  };
}

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "src/server.ts" },
    }),
    react(),
    swVersionPlugin(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ["**/node_modules/**", "**/.cache/**", "**/dist/**"],
    },
  },
});
