import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  MAX_CUSTOM_RULES,
  MAX_CUSTOM_RULE_CHARS,
  type CustomRule,
  type ExternalApiFormat,
  type OutputLanguage,
  type PublicSettings,
  type RewriteMode,
  type SettingsPatch,
  type StoredSettings,
  type EngineType,
} from "../shared/types.js";

const VALID_ENGINES = new Set<EngineType>(["agy-cli", "external-api", "host-session"]);
const VALID_MODES = new Set<RewriteMode>(["standard", "intent-first", "concise"]);
const VALID_LANGUAGES = new Set<OutputLanguage>(["auto", "zh-CN", "en"]);
const VALID_FORMATS = new Set<ExternalApiFormat>(["openai", "gemini", "anthropic"]);

export function resolveDefaultDataDir(): string {
  const home = os.homedir();
  return path.join(home, ".gemini", "cache", "agy-prompt-rewriter");
}

/**
 * Mask an API key for UI display and model-visible inspection.
 * Supports `env:VAR_NAME` references verbatim without exposing any secret value.
 */
export function maskApiKey(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("env:")) {
    return `env:${trimmed.slice(4).trim()}`;
  }
  if (trimmed.length <= 8) {
    return "****";
  }
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

/**
 * Resolve the actual secret key from stored plaintext or an `env:VAR_NAME` pointer.
 */
export function resolveApiKey(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("env:")) {
    const varName = trimmed.slice(4).trim();
    return varName ? String(process.env[varName] || "").trim() : "";
  }
  return trimmed;
}

export function toPublicSettings(stored: StoredSettings): PublicSettings {
  const rawKey = String(stored.externalApi.apiKey || "").trim();
  const isEnv = rawKey.toLowerCase().startsWith("env:");
  const resolved = resolveApiKey(rawKey);
  return {
    engine: stored.engine,
    agyModel: stored.agyModel,
    agyTimeoutSec: stored.agyTimeoutSec,
    defaultMode: stored.defaultMode,
    language: stored.language,
    activeCustomRuleId: stored.activeCustomRuleId,
    fallbackToHostOnError: stored.fallbackToHostOnError,
    externalApi: {
      format: stored.externalApi.format,
      baseUrl: stored.externalApi.baseUrl,
      model: stored.externalApi.model,
      apiKeyMasked: maskApiKey(rawKey),
      hasApiKey: Boolean(resolved),
      apiKeySource: !rawKey ? "none" : isEnv ? "env" : "stored",
      timeoutSec: stored.externalApi.timeoutSec,
    },
    customRules: stored.customRules.map((r) => ({ ...r })),
  };
}

function clampTimeout(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(120, Math.round(n)));
}

function sanitizeCustomRules(raw: unknown, fallback: CustomRule[]): CustomRule[] {
  if (!Array.isArray(raw)) return fallback;
  const out: CustomRule[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = String(rec.id || "").trim() || `rule-${out.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = String(rec.name || "").trim().slice(0, 80);
    const content = String(rec.content || "").trim().slice(0, MAX_CUSTOM_RULE_CHARS);
    if (!name || !content) continue;
    out.push({
      id,
      name,
      content,
      enabled: Boolean(rec.enabled),
    });
    if (out.length >= MAX_CUSTOM_RULES) break;
  }
  return out;
}

export function normalizeStoredSettings(raw: unknown): StoredSettings {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ext =
    obj.externalApi && typeof obj.externalApi === "object" && !Array.isArray(obj.externalApi)
      ? (obj.externalApi as Record<string, unknown>)
      : {};

  const engine = VALID_ENGINES.has(obj.engine as EngineType)
    ? (obj.engine as EngineType)
    : DEFAULT_SETTINGS.engine;
  const defaultMode = VALID_MODES.has(obj.defaultMode as RewriteMode)
    ? (obj.defaultMode as RewriteMode)
    : DEFAULT_SETTINGS.defaultMode;
  const language = VALID_LANGUAGES.has(obj.language as OutputLanguage)
    ? (obj.language as OutputLanguage)
    : DEFAULT_SETTINGS.language;
  const format = VALID_FORMATS.has(ext.format as ExternalApiFormat)
    ? (ext.format as ExternalApiFormat)
    : DEFAULT_SETTINGS.externalApi.format;

  const customRules = sanitizeCustomRules(obj.customRules, []);
  const requestedRuleId = String(obj.activeCustomRuleId || "").trim();
  const activeCustomRuleId = customRules.some((r) => r.id === requestedRuleId && r.enabled)
    ? requestedRuleId
    : "";

  return {
    engine,
    agyModel: String(obj.agyModel || DEFAULT_SETTINGS.agyModel).trim() || DEFAULT_SETTINGS.agyModel,
    agyTimeoutSec: clampTimeout(obj.agyTimeoutSec, DEFAULT_SETTINGS.agyTimeoutSec),
    defaultMode,
    language,
    activeCustomRuleId,
    fallbackToHostOnError:
      typeof obj.fallbackToHostOnError === "boolean"
        ? obj.fallbackToHostOnError
        : DEFAULT_SETTINGS.fallbackToHostOnError,
    externalApi: {
      format,
      baseUrl: String(ext.baseUrl ?? DEFAULT_SETTINGS.externalApi.baseUrl).trim(),
      model: String(ext.model ?? DEFAULT_SETTINGS.externalApi.model).trim(),
      apiKey: String(ext.apiKey ?? "").trim(),
      timeoutSec: clampTimeout(ext.timeoutSec, DEFAULT_SETTINGS.externalApi.timeoutSec),
    },
    customRules,
  };
}

export function mergeSettingsPatch(existing: StoredSettings, patch: SettingsPatch): StoredSettings {
  const nextExt = patch.externalApi || {};
  let nextApiKey = existing.externalApi.apiKey;
  if (nextExt.clearApiKey) {
    nextApiKey = "";
  } else if (typeof nextExt.apiKey === "string") {
    const candidate = nextExt.apiKey.trim();
    // Ignore UI-echoed masked placeholders so partial saves never clobber real keys.
    if (candidate && !candidate.includes("****")) {
      nextApiKey = candidate;
    }
  }

  return normalizeStoredSettings({
    ...existing,
    ...patch,
    externalApi: {
      ...existing.externalApi,
      ...nextExt,
      apiKey: nextApiKey,
    },
    customRules: patch.customRules !== undefined ? patch.customRules : existing.customRules,
  });
}

export class SettingsStore {
  private readonly filePath: string;
  private cached: StoredSettings | null = null;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, "settings.json");
  }

  async load(): Promise<StoredSettings> {
    if (this.cached) return this.cached;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.cached = normalizeStoredSettings(JSON.parse(raw));
    } catch {
      this.cached = normalizeStoredSettings(DEFAULT_SETTINGS);
    }
    return this.cached;
  }

  async save(next: StoredSettings): Promise<StoredSettings> {
    const normalized = normalizeStoredSettings(next);
    await fs.mkdir(this.dataDir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    const payload = `${JSON.stringify(normalized, null, 2)}\n`;
    await fs.writeFile(tmpPath, payload, { encoding: "utf8", mode: 0o600 });
    try {
      await fs.rename(tmpPath, this.filePath);
    } catch {
      try {
        await fs.copyFile(tmpPath, this.filePath);
      } finally {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
      }
    }
    if (process.platform !== "win32") {
      await fs.chmod(this.filePath, 0o600).catch(() => {});
    }
    this.cached = normalized;
    return normalized;
  }

  async update(patch: SettingsPatch): Promise<StoredSettings> {
    const current = await this.load();
    const merged = mergeSettingsPatch(current, patch);
    return this.save(merged);
  }
}
