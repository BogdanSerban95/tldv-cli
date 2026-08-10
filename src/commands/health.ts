import { Command } from "commander";

import { createContext } from "../context.js";

export function healthCommand(): Command {
  return new Command("health")
    .description("check that the tl;dv API is reachable (no API key needed)")
    .option("--json", "print the raw API payload")
    .action(async (options: { json?: boolean }, self: Command) => {
      const ctx = createContext(self, { requireKey: false });
      const started = Date.now();
      const payload = await ctx.api.health();
      const elapsed = Date.now() - started;

      if (options.json) {
        ctx.out.json(payload);
        return;
      }
      ctx.out.success(`${ctx.config.baseUrl} is up (${elapsed}ms)`);
    });
}
