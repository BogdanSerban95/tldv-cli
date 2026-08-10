import { defineConfig } from "tsup";

export default defineConfig({
  entry: { tldv: "src/bin.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  // Dependencies stay external. Inlining them would mean redistributing their MIT/ISC text
  // alongside the package, and npm resolves five pure-JS packages fast enough that the
  // single-file build is not worth that obligation.
  clean: true,
  sourcemap: true,
  minify: false,
  banner: { js: "#!/usr/bin/env node" },
});
