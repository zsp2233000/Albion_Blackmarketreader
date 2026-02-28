import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "src/shared")
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
