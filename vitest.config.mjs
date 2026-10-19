import { defineConfig } from "vitest/config";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The folder this file lives in (the "client" folder)
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Makes "@/lib/fare" work in tests, just like in the app
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    // Runs before every test file: installs the fakes
    setupFiles: ["./tests/setup.js"],
  },
});