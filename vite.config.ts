import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pagesBase = process.env.BASE_PATH || "/";

export default defineConfig({
  base: pagesBase,
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
