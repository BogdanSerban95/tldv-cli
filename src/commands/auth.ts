import { isCancel, password } from "@clack/prompts";
import { Command } from "commander";

import { HttpClient } from "../api/client.js";
import { TldvApi } from "../api/endpoints.js";
import { createOutput, globalsOf } from "../context.js";
import {
  API_KEYS_URL,
  clearApiKey,
  ENV_API_KEY,
  loadConfig,
  redactKey,
  saveApiKey,
} from "../core/config.js";
import { ApiError, TldvError, UsageError } from "../core/errors.js";
import type { Output } from "../ui/output.js";
import { createSpinner } from "../ui/spinner.js";
import { theme } from "../ui/theme.js";

export function authCommand(): Command {
  const auth = new Command("auth").description("manage the stored API key");

  auth
    .command("login")
    .description("store an API key")
    .option("--stdin", "read the key from stdin instead of prompting")
    .option("--no-check", "skip the validating request")
    .action(async (options: { stdin?: boolean; check?: boolean }, self: Command) => {
      const out = createOutput(globalsOf(self));
      const config = loadConfig();
      const apiKey = await readKey(options.stdin === true, out);

      if (options.check !== false) {
        await verify(apiKey, config.baseUrl, out);
      }

      const path = saveApiKey(apiKey);
      out.success(`Key saved to ${path}`);
      if (config.source === "env") {
        out.warn(`${ENV_API_KEY} is set and takes precedence over the stored key.`);
      }
    });

  auth
    .command("status")
    .description("show which key is in use and whether it works")
    .option("--no-check", "skip the validating request")
    .action(async (options: { check?: boolean }, self: Command) => {
      const out = createOutput(globalsOf(self));
      const config = loadConfig();

      if (!config.apiKey) {
        out.warn("No API key configured.");
        out.note(`Run \`tldv auth login\`, or set ${ENV_API_KEY}. Keys: ${API_KEYS_URL}`);
        return;
      }

      const origin = config.source === "env" ? `$${ENV_API_KEY}` : config.path;
      out.line(`${theme.dim("key   ")} ${redactKey(config.apiKey)}`);
      out.line(`${theme.dim("from  ")} ${origin}`);
      out.line(`${theme.dim("api   ")} ${config.baseUrl}`);

      if (options.check !== false) {
        await verify(config.apiKey, config.baseUrl, out);
        out.success("Key accepted by tl;dv.");
      }
    });

  auth
    .command("logout")
    .description("remove the stored API key")
    .action((_options: unknown, self: Command) => {
      const out = createOutput(globalsOf(self));
      const config = loadConfig();
      const removed = clearApiKey();
      if (removed) out.success("Stored key removed.");
      else out.info("No stored key to remove.");
      if (config.source === "env") {
        out.warn(`${ENV_API_KEY} is still set in this shell; unset it to finish logging out.`);
      }
    });

  return auth;
}

async function readKey(fromStdin: boolean, out: Output): Promise<string> {
  if (fromStdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const value = Buffer.concat(chunks).toString("utf8").trim();
    if (!value) throw new UsageError("No key on stdin.");
    return value;
  }

  if (!process.stdin.isTTY) {
    throw new UsageError(
      "No terminal available to prompt for the key.",
      "Pipe it in: `echo $KEY | tldv auth login --stdin`",
    );
  }

  out.note(`Create a key at ${API_KEYS_URL}`);
  const value = await password({
    message: "tl;dv API key",
    validate: (input) => (input?.trim() ? undefined : "Enter a key"),
  });
  if (isCancel(value)) throw new TldvError("Cancelled.");
  return value.trim();
}

/** One cheap authenticated call, so a bad key fails now rather than on the next command. */
async function verify(apiKey: string, baseUrl: string, out: Output): Promise<void> {
  const spinner = createSpinner("Checking the key…", out.isInteractive);
  const api = new TldvApi(new HttpClient({ apiKey, baseUrl, retries: 1 }));
  try {
    await api.listMeetings({ limit: 1, page: 1 });
    spinner.stop();
  } catch (error) {
    spinner.stop();
    if (error instanceof ApiError && error.status === 401) {
      throw new TldvError("tl;dv rejected that key.", {
        exitCode: error.exitCode,
        hint: `Copy it again from ${API_KEYS_URL}`,
      });
    }
    throw error;
  }
}
