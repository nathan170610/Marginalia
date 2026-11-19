import { defineConfig } from "vite";
import path from "node:path";
export default defineConfig({
  root: "src/renderer",
  base: "./",
  build: { outDir: "../../dist/renderer", emptyOutDir: true },
  test: { root: path.resolve("."), include: ["test/**/*.test.ts"] },
});
