/**
 * API key and endpoint resolution.
 *
 * Environment beats the config file, so a shell export can override a stored key without
 * anyone editing a file — the usual CI and "second account" escape hatch.
 */

import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_BASE_URL = "https://pasta.tldv.io";
export const API_KEYS_URL = "https://tldv.io/app/settings/personal-settings/api-keys";
export const ENV_API_KEY = "TLDV_API_KEY";
export const ENV_BASE_URL = "TLDV_BASE_URL";

export type KeySource = "env" | "file" | "none";

export interface Config {
  apiKey: string | undefined;
  baseUrl: string;
  source: KeySource;
  path: string;
}

interface StoredConfig {
  apiKey?: string;
  baseUrl?: string;
}

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg?.trim() ? xdg : join(homedir(), ".config");
  return join(base, "tldv");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

function readStored(): StoredConfig {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    return {
      apiKey: typeof record.apiKey === "string" ? record.apiKey : undefined,
      baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : undefined,
    };
  } catch {
    // A missing or corrupt config is not an error: the env var may still carry the key.
    return {};
  }
}

export function loadConfig(): Config {
  const stored = readStored();
  const envKey = process.env[ENV_API_KEY]?.trim();
  const storedKey = stored.apiKey?.trim();

  let apiKey: string | undefined;
  let source: KeySource = "none";
  if (envKey) {
    apiKey = envKey;
    source = "env";
  } else if (storedKey) {
    apiKey = storedKey;
    source = "file";
  }

  const baseUrl = process.env[ENV_BASE_URL]?.trim() || stored.baseUrl || DEFAULT_BASE_URL;

  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), source, path: configPath() };
}

export function saveApiKey(apiKey: string): string {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const stored = readStored();
  const next: StoredConfig = { apiKey };
  if (stored.baseUrl && stored.baseUrl !== DEFAULT_BASE_URL) next.baseUrl = stored.baseUrl;

  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  // writeFileSync's mode only applies on create; enforce it for an existing file too.
  chmodSync(path, 0o600);
  return path;
}

/** Returns false when there was no stored key to remove. */
export function clearApiKey(): boolean {
  const stored = readStored();
  if (!stored.apiKey) return false;
  rmSync(configPath(), { force: true });
  return true;
}

export function redactKey(apiKey: string): string {
  if (apiKey.length <= 8) return "*".repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${"*".repeat(Math.min(apiKey.length - 8, 24))}${apiKey.slice(-4)}`;
}
