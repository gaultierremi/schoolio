import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest configuration for Schoolio.
//
// Scope (v1):
//   - Unit tests for pure-server helpers under lib/api/* and lib/* utility funcs.
//   - Test files co-located next to source as <name>.test.ts.
//   - No DOM / no React component testing yet — those will land in a follow-up
//     PR with jsdom + @testing-library/react.
//
// Run:
//   npm test           — watch mode
//   npm run test:run   — one-shot (CI)
//   npm run test:coverage
//
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["node_modules", ".next", "supabase"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "node_modules",
        ".next",
        "lib/types.ts",
        "lib/types/**",
      ],
      reporter: ["text", "html", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
