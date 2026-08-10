import { defineConfig } from "tsup";

export default defineConfig({
  entry: { tldv: "src/bin.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  // Bundle dependencies so `npx tldv-cli` fetches one file instead of resolving a tree.
  noExternal: [/.*/],
  clean: true,
  sourcemap: true,
  minify: false,
  // Dependencies are CJS; bundling them into ESM leaves esbuild's `__require` shim, which
  // throws on `require("events")` unless a real require exists in module scope.
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __tldvCreateRequire } from 'node:module';",
      "const require = __tldvCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});
