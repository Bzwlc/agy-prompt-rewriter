// Built by scripts/build.mjs — zero-dependency MCP App server for agy-prompt-rewriter


// src/server/index.ts
import { existsSync as existsSync2, promises as fs2 } from "node:fs";
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// src/shared/prompt-rules.ts
function languageDirective(language) {
  if (language === "zh-CN") {
    return "Write the rewritten prompt in Simplified Chinese regardless of minor foreign terms.";
  }
  if (language === "en") {
    return "Write the rewritten prompt in clear, natural English.";
  }
  return "Write the rewritten prompt in the same primary language as the user's draft (Simplified Chinese for Chinese drafts, English for English drafts).";
}
function modeInstructions(mode) {
  if (mode === "concise") {
    return [
      "Mode: CONCISE.",
      "- Fix typos, remove ambiguity, and tighten scope/boundaries while keeping the prompt compact (~1x to 1.5x original length).",
      "- Keep only essential constraints; do not pad into multi-section prose."
    ].join("\n");
  }
  if (mode === "intent-first") {
    return [
      "Mode: INTENT-FIRST (DEEP).",
      "- Infer the user's underlying engineering or writing intent and expand into a thorough, structured execution prompt (~2x to 4x original length; avoid pointless fluff).",
      "- Cover relevant dimensions clearly: Goal, Inputs & Context, Scope & Approach, Output Format, and Boundaries & Acceptance Criteria.",
      "- Where minor implementation choices are unspecified, instruct the executor to adopt sensible defaults and state its assumptions."
    ].join("\n");
  }
  return [
    "Mode: STANDARD.",
    "- Expand the rough draft into a balanced, execution-ready prompt (~1.5x to 3x original length).",
    "- Clarify Goal, Scope & Approach, Output Format, and key Boundaries/Verification expectations without over-engineering.",
    "- For minor unspecified details, tell the executor to pick conservative defaults and state assumptions briefly."
  ].join("\n");
}
function buildRewriteSystemPrompt(mode, language, customRule) {
  const parts = [
    "You are a prompt rewriter for an AI coding & productivity assistant.",
    "Rewrite the user's rough draft into a clear, actionable, execution-ready prompt while preserving the user's exact intent.",
    "",
    "Hard rules:",
    "1. REWRITE ONLY \u2014 NEVER answer the user's request, write code to fulfill it, or pretend to execute tools.",
    "2. ZERO FOLLOW-UP QUESTIONS \u2014 Do not include any questions asking the user for clarification.",
    "3. PRESERVE SPECIFICS \u2014 Keep all user-mentioned file paths, symbol names, libraries, URLs, and constraints verbatim. Never invent unseen file paths or APIs.",
    `4. LANGUAGE \u2014 ${languageDirective(language)}`,
    "5. OUTPUT FORMAT \u2014 Return ONLY the rewritten prompt text directly. Do NOT wrap the output in triple backticks, quotes, or meta-commentary.",
    "",
    modeInstructions(mode)
  ];
  if (customRule && customRule.enabled && customRule.content.trim()) {
    parts.push(
      "",
      `Custom Rule ("${customRule.name}"):`,
      customRule.content.trim()
    );
  }
  return parts.join("\n");
}
function sanitizeRewrittenOutput(rawText, originalDraft) {
  let text = String(rawText ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    return originalDraft;
  }
  const fenceMatch = /^```(?:markdown|md|text|prompt)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  text = text.replace(/^(?:以下是改写后的提示词|改写后的提示词|Rewritten prompt)\s*[:：]\s*\n?/i, "").trim();
  const lines = text.split("\n");
  while (lines.length > 1) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    const looksLikeFollowupQuestion = /[?？]\s*$/.test(last) && /^(?:请问|能否|是否|你需要|你希望|方便|可以告诉|would you|could you|do you want|which|what|should i)/i.test(last);
    if (looksLikeFollowupQuestion) {
      lines.pop();
      continue;
    }
    break;
  }
  const cleaned = lines.join("\n").trim();
  if (!cleaned) {
    return originalDraft;
  }
  if (!cleaned.includes("\n") && /[?？]\s*$/.test(cleaned) && !/[?？]\s*$/.test(originalDraft.trim())) {
    return originalDraft;
  }
  return cleaned;
}

// src/server/engines.ts
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os2 from "node:os";
import path2 from "node:path";
import { promisify } from "node:util";

// src/server/storage.ts
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// src/shared/types.ts
var MAX_CUSTOM_RULES = 10;
var MAX_CUSTOM_RULE_CHARS = 4e3;
var DEFAULT_SETTINGS = {
  engine: "agy-cli",
  agyModel: "gemini-3.8-flash-low",
  agyTimeoutSec: 30,
  defaultMode: "standard",
  language: "auto",
  activeCustomRuleId: "",
  fallbackToHostOnError: true,
  externalApi: {
    format: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
    timeoutSec: 20
  },
  customRules: []
};

// src/server/storage.ts
var VALID_ENGINES = /* @__PURE__ */ new Set(["agy-cli", "external-api", "host-session"]);
var VALID_MODES = /* @__PURE__ */ new Set(["standard", "intent-first", "concise"]);
var VALID_LANGUAGES = /* @__PURE__ */ new Set(["auto", "zh-CN", "en"]);
var VALID_FORMATS = /* @__PURE__ */ new Set(["openai", "gemini"]);
function resolveDefaultDataDir() {
  const home = os.homedir();
  return path.join(home, ".gemini", "cache", "agy-prompt-rewriter");
}
function maskApiKey(raw) {
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
function resolveApiKey(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("env:")) {
    const varName = trimmed.slice(4).trim();
    return varName ? String(process.env[varName] || "").trim() : "";
  }
  return trimmed;
}
function toPublicSettings(stored) {
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
      timeoutSec: stored.externalApi.timeoutSec
    },
    customRules: stored.customRules.map((r) => ({ ...r }))
  };
}
function clampTimeout(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(120, Math.round(n)));
}
function sanitizeCustomRules(raw, fallback) {
  if (!Array.isArray(raw)) return fallback;
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item;
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
      enabled: Boolean(rec.enabled)
    });
    if (out.length >= MAX_CUSTOM_RULES) break;
  }
  return out;
}
function normalizeStoredSettings(raw) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const ext = obj.externalApi && typeof obj.externalApi === "object" && !Array.isArray(obj.externalApi) ? obj.externalApi : {};
  const engine = VALID_ENGINES.has(obj.engine) ? obj.engine : DEFAULT_SETTINGS.engine;
  const defaultMode = VALID_MODES.has(obj.defaultMode) ? obj.defaultMode : DEFAULT_SETTINGS.defaultMode;
  const language = VALID_LANGUAGES.has(obj.language) ? obj.language : DEFAULT_SETTINGS.language;
  const format = VALID_FORMATS.has(ext.format) ? ext.format : DEFAULT_SETTINGS.externalApi.format;
  const customRules = sanitizeCustomRules(obj.customRules, []);
  const requestedRuleId = String(obj.activeCustomRuleId || "").trim();
  const activeCustomRuleId = customRules.some((r) => r.id === requestedRuleId && r.enabled) ? requestedRuleId : "";
  return {
    engine,
    agyModel: String(obj.agyModel || DEFAULT_SETTINGS.agyModel).trim() || DEFAULT_SETTINGS.agyModel,
    agyTimeoutSec: clampTimeout(obj.agyTimeoutSec, DEFAULT_SETTINGS.agyTimeoutSec),
    defaultMode,
    language,
    activeCustomRuleId,
    fallbackToHostOnError: typeof obj.fallbackToHostOnError === "boolean" ? obj.fallbackToHostOnError : DEFAULT_SETTINGS.fallbackToHostOnError,
    externalApi: {
      format,
      baseUrl: String(ext.baseUrl ?? DEFAULT_SETTINGS.externalApi.baseUrl).trim(),
      model: String(ext.model ?? DEFAULT_SETTINGS.externalApi.model).trim(),
      apiKey: String(ext.apiKey ?? "").trim(),
      timeoutSec: clampTimeout(ext.timeoutSec, DEFAULT_SETTINGS.externalApi.timeoutSec)
    },
    customRules
  };
}
function mergeSettingsPatch(existing, patch) {
  const nextExt = patch.externalApi || {};
  let nextApiKey = existing.externalApi.apiKey;
  if (nextExt.clearApiKey) {
    nextApiKey = "";
  } else if (typeof nextExt.apiKey === "string") {
    const candidate = nextExt.apiKey.trim();
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
      apiKey: nextApiKey
    },
    customRules: patch.customRules !== void 0 ? patch.customRules : existing.customRules
  });
}
var SettingsStore = class {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, "settings.json");
  }
  dataDir;
  filePath;
  cached = null;
  async load() {
    if (this.cached) return this.cached;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.cached = normalizeStoredSettings(JSON.parse(raw));
    } catch {
      this.cached = normalizeStoredSettings(DEFAULT_SETTINGS);
    }
    return this.cached;
  }
  async save(next) {
    const normalized = normalizeStoredSettings(next);
    await fs.mkdir(this.dataDir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    const payload = `${JSON.stringify(normalized, null, 2)}
`;
    await fs.writeFile(tmpPath, payload, { encoding: "utf8", mode: 384 });
    try {
      await fs.rename(tmpPath, this.filePath);
    } catch {
      try {
        await fs.copyFile(tmpPath, this.filePath);
      } finally {
        await fs.rm(tmpPath, { force: true }).catch(() => {
        });
      }
    }
    if (process.platform !== "win32") {
      await fs.chmod(this.filePath, 384).catch(() => {
      });
    }
    this.cached = normalized;
    return normalized;
  }
  async update(patch) {
    const current = await this.load();
    const merged = mergeSettingsPatch(current, patch);
    return this.save(merged);
  }
};

// src/server/engines.ts
var execFileAsync = promisify(execFile);
var RECOMMENDED_LIGHT_MODELS = /* @__PURE__ */ new Set([
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-high",
  "gemini-4-hydrogen-low",
  "gemini-4-hydrogen-medium",
  "gpt-oss-120b-medium"
]);
var cachedAgyBin;
var cachedModels = null;
function parseAgyModelsOutput(stdout) {
  const models = [];
  const seen = /* @__PURE__ */ new Set();
  for (const rawLine of String(stdout || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^fetching available models/i.test(line)) continue;
    const parts = line.split(/\t+/);
    const id = parts[0]?.trim() || "";
    if (!id || seen.has(id) || /\s/.test(id)) continue;
    seen.add(id);
    const label = parts.slice(1).join(" ").trim() || id;
    models.push({
      id,
      label,
      recommended: RECOMMENDED_LIGHT_MODELS.has(id)
    });
  }
  return models.sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)));
}
async function findAgyExecutable(forceRefresh = false) {
  if (!forceRefresh && cachedAgyBin !== void 0) {
    return cachedAgyBin;
  }
  if (process.platform === "win32") {
    const candidates = [];
    try {
      const { stdout } = await execFileAsync("where.exe", ["agy"], {
        windowsHide: true,
        timeout: 4e3
      });
      for (const line of stdout.split(/\r?\n/)) {
        const p = line.trim();
        if (p) candidates.push(p);
      }
    } catch {
    }
    const localAppData = process.env.LOCALAPPDATA || path2.join(os2.homedir(), "AppData", "Local");
    candidates.push(path2.join(localAppData, "agy", "bin", "agy.exe"));
    const exeMatch = candidates.find((p) => p.toLowerCase().endsWith(".exe") && existsSync(p));
    if (exeMatch) {
      cachedAgyBin = exeMatch;
      return exeMatch;
    }
    const anyMatch = candidates.find((p) => existsSync(p));
    cachedAgyBin = anyMatch || null;
    return cachedAgyBin;
  }
  try {
    const { stdout } = await execFileAsync("which", ["agy"], { timeout: 4e3 });
    const found = stdout.split(/\r?\n/)[0]?.trim();
    if (found && existsSync(found)) {
      cachedAgyBin = found;
      return found;
    }
  } catch {
  }
  cachedAgyBin = null;
  return null;
}
async function listAgyModels(forceRefresh = false) {
  if (!forceRefresh && cachedModels && cachedModels.expiresAt > Date.now()) {
    return cachedModels.status;
  }
  const exe = await findAgyExecutable(forceRefresh);
  if (!exe) {
    const status = {
      available: false,
      executable: "",
      models: [],
      error: "\u672A\u68C0\u6D4B\u5230\u672C\u673A agy CLI \u53EF\u6267\u884C\u6587\u4EF6"
    };
    cachedModels = { expiresAt: Date.now() + 6e4, status };
    return status;
  }
  try {
    const res = await execAgy(exe, ["models"], 12e3);
    const models = parseAgyModelsOutput(`${res.stdout}
${res.stderr}`);
    const status = models.length > 0 ? { available: true, executable: exe, models } : {
      available: false,
      executable: exe,
      models: [],
      error: res.stderr.trim() || "agy models \u672A\u8FD4\u56DE\u53EF\u7528\u6A21\u578B"
    };
    cachedModels = { expiresAt: Date.now() + 5 * 6e4, status };
    return status;
  } catch (err) {
    const status = {
      available: false,
      executable: exe,
      models: [],
      error: err instanceof Error ? err.message : String(err)
    };
    cachedModels = { expiresAt: Date.now() + 3e4, status };
    return status;
  }
}
function execAgy(executable, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const isCmd = process.platform === "win32" && !executable.toLowerCase().endsWith(".exe");
    const child = isCmd ? spawn("cmd.exe", ["/d", "/s", "/c", executable, ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }) : spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`agy CLI \u6267\u884C\u8D85\u65F6 (${Math.round(timeoutMs / 1e3)}s)`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
async function runAgyCliRewrite(params) {
  const started = Date.now();
  const exe = await findAgyExecutable();
  if (!exe) {
    throw new Error("\u672A\u627E\u5230\u672C\u673A agy CLI\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u6539\u7528\u300C\u5916\u63A5\u81EA\u5B9A\u4E49 API\u300D\u6216\u300C\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\u300D");
  }
  const combinedPrompt = [
    params.systemPrompt,
    "",
    "<draft_to_rewrite>",
    params.draft,
    "</draft_to_rewrite>"
  ].join("\n");
  const args = [
    "-p",
    combinedPrompt,
    "--model",
    params.model,
    "--disable-slash-commands",
    "--output-format",
    "text",
    "--print-timeout",
    `${params.timeoutSec}s`
  ];
  const res = await execAgy(exe, args, (params.timeoutSec + 5) * 1e3);
  if (res.code !== 0 && !res.stdout.trim()) {
    const errDetail = res.stderr.trim() || `exit code ${res.code}`;
    throw new Error(`agy CLI \u6539\u5199\u5931\u8D25: ${errDetail.slice(0, 260)}`);
  }
  const cleaned = sanitizeRewrittenOutput(res.stdout, params.draft);
  return {
    text: cleaned,
    engineUsed: `agy:${params.model}`,
    durationMs: Date.now() - started
  };
}
function redactSecret(msg, secret) {
  if (!secret || secret.length < 4) return msg;
  return msg.split(secret).join("[REDACTED]");
}
function extractOpenAiText(json) {
  const obj = json;
  if (typeof obj?.output_text === "string") return obj.output_text;
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => typeof part?.text === "string" ? part.text : "").join("");
  }
  return "";
}
function extractGeminiText(json) {
  const obj = json;
  const parts = obj?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => typeof p?.text === "string" ? p.text : "").join("");
}
async function runExternalApiRewrite(params) {
  const started = Date.now();
  const { format, baseUrl, model, timeoutSec } = params.config;
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  if (!cleanBase || !/^https?:\/\//i.test(cleanBase)) {
    throw new Error("\u5916\u63A5 API \u7684 Base URL \u65E0\u6548\uFF08\u9700\u4EE5 http:// \u6216 https:// \u5F00\u5934\uFF09");
  }
  if (!model.trim()) {
    throw new Error("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u5916\u63A5 API \u7684\u6A21\u578B\u540D\u79F0");
  }
  const secret = resolveApiKey(params.config.apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1e3);
  try {
    let url;
    const headers = { "Content-Type": "application/json" };
    let body;
    if (format === "gemini") {
      if (!secret) {
        throw new Error("Gemini API \u9700\u8981\u914D\u7F6E API Key\uFF08\u6216 env:GEMINI_API_KEY\uFF09");
      }
      url = `${cleanBase}/models/${encodeURIComponent(model.trim())}:generateContent`;
      headers["x-goog-api-key"] = secret;
      body = {
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.draft }] }],
        generationConfig: { temperature: 0.3 }
      };
    } else {
      url = cleanBase.endsWith("/chat/completions") ? cleanBase : `${cleanBase}/chat/completions`;
      if (secret) {
        headers.Authorization = `Bearer ${secret}`;
      }
      body = {
        model: model.trim(),
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.draft }
        ],
        temperature: 0.3
      };
    }
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const rawBody = await response.text();
    if (!response.ok) {
      let detail = rawBody.slice(0, 240);
      try {
        const parsedErr = JSON.parse(rawBody);
        if (parsedErr?.error?.message) detail = parsedErr.error.message;
      } catch {
      }
      throw new Error(`HTTP ${response.status}: ${redactSecret(detail, secret)}`);
    }
    const json = JSON.parse(rawBody);
    const rawText = format === "gemini" ? extractGeminiText(json) : extractOpenAiText(json);
    if (!rawText.trim()) {
      throw new Error("\u5916\u63A5 API \u8FD4\u56DE\u5185\u5BB9\u4E3A\u7A7A");
    }
    return {
      text: sanitizeRewrittenOutput(rawText, params.draft),
      engineUsed: `api:${model.trim()}`,
      durationMs: Date.now() - started
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`\u5916\u63A5 API \u8BF7\u6C42\u8D85\u65F6 (${timeoutSec}s)`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(redactSecret(msg, secret));
  } finally {
    clearTimeout(timer);
  }
}
async function testEngineConnection(settings) {
  const started = Date.now();
  if (settings.engine === "agy-cli") {
    const status = await listAgyModels(true);
    if (!status.available) {
      return {
        ok: false,
        message: status.error || "agy CLI \u4E0D\u53EF\u7528",
        durationMs: Date.now() - started
      };
    }
    const hasSelected = status.models.some((m) => m.id === settings.agyModel);
    return {
      ok: true,
      message: hasSelected ? `agy CLI \u5DF2\u5C31\u7EEA\uFF08\u68C0\u6D4B\u5230 ${status.models.length} \u4E2A\u6A21\u578B\uFF0C\u5DF2\u9009 ${settings.agyModel}\uFF09` : `agy CLI \u5DF2\u5C31\u7EEA\uFF08\u68C0\u6D4B\u5230 ${status.models.length} \u4E2A\u6A21\u578B\uFF1B\u5F53\u524D\u6240\u9009 ${settings.agyModel} \u672A\u5728\u5217\u8868\u4E2D\uFF09`,
      durationMs: Date.now() - started
    };
  }
  if (settings.engine === "external-api") {
    try {
      const res = await runExternalApiRewrite({
        draft: "ping",
        systemPrompt: "Reply with the exact word OK and nothing else.",
        config: {
          ...settings.externalApi,
          timeoutSec: Math.min(15, settings.externalApi.timeoutSec)
        }
      });
      return {
        ok: true,
        message: `\u8FDE\u63A5\u6210\u529F\uFF08${res.engineUsed}\uFF0C\u8017\u65F6 ${res.durationMs}ms\uFF09`,
        durationMs: res.durationMs
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started
      };
    }
  }
  return {
    ok: true,
    message: "\u5F53\u524D\u914D\u7F6E\u4E3A\u590D\u7528 Antigravity \u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\uFF0C\u65E0\u9700\u5916\u90E8\u8FDE\u63A5\u6D4B\u8BD5",
    durationMs: Date.now() - started
  };
}

// src/server/index.ts
var APP_URI = "ui://prompt-rewriter/app.html";
var SETTINGS_URI = "ui://prompt-rewriter/settings.html";
var APP_MIME_TYPE = "text/html;profile=mcp-app";
var MAX_FRAME_BYTES = 64 * 1024 * 1024;
var SERVER_INFO = { name: "agy-prompt-rewriter", version: "0.2.0" };
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
function parseCliArgs(argv) {
  let dataDir = process.env.AGY_REWRITER_DATA_DIR?.trim() || "";
  let htmlPath = process.env.AGY_REWRITER_APP_HTML?.trim() || "";
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--data-dir" && argv[i + 1]) {
      dataDir = argv[++i];
    } else if (a.startsWith("--data-dir=")) {
      dataDir = a.slice("--data-dir=".length);
    } else if (a === "--html" && argv[i + 1]) {
      htmlPath = argv[++i];
    } else if (a.startsWith("--html=")) {
      htmlPath = a.slice("--html=".length);
    }
  }
  return {
    dataDir: dataDir ? path3.resolve(dataDir) : resolveDefaultDataDir(),
    htmlPath: htmlPath ? path3.resolve(htmlPath) : resolveDefaultHtmlPath()
  };
}
function resolveDefaultHtmlPath() {
  const sameDir = path3.join(__dirname, "app.html");
  if (existsSync2(sameDir)) return sameDir;
  return path3.resolve(__dirname, "../../dist/app.html");
}
var VALID_MODES2 = /* @__PURE__ */ new Set(["standard", "intent-first", "concise"]);
var VALID_LANGUAGES2 = /* @__PURE__ */ new Set(["auto", "zh-CN", "en"]);
function pickMode(raw, fallback) {
  return VALID_MODES2.has(raw) ? raw : fallback;
}
function pickLanguage(raw, fallback) {
  return VALID_LANGUAGES2.has(raw) ? raw : fallback;
}
function resolveActiveRule(settings, customRuleId) {
  const id = (customRuleId ?? settings.activeCustomRuleId ?? "").trim();
  if (!id) return null;
  return settings.customRules.find((r) => r.id === id && r.enabled) || null;
}
var REWRITER_PANEL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    originalPrompt: {
      type: "string",
      description: "Optional rough user prompt draft."
    },
    rewrittenPrompt: {
      type: "string",
      description: "Optional rewritten prompt produced by the host model."
    },
    mode: {
      type: "string",
      enum: ["standard", "intent-first", "concise"],
      description: "Optional rewrite mode override."
    },
    customRuleId: {
      type: "string",
      description: "Optional enabled custom rule ID."
    },
    autoRun: {
      type: "boolean",
      description: "When true and engine is agy-cli or external-api, execute the rewrite server-side before returning."
    },
    engineUsed: {
      type: "string",
      description: "Optional label describing which model/engine produced rewrittenPrompt."
    },
    fallbackNote: {
      type: "string",
      description: "Optional note displayed when host fallback occurred."
    }
  },
  additionalProperties: false
};
function buildToolList() {
  return [
    {
      name: "show_rewriter_card",
      title: "Prompt Rewriter Card",
      description: "Render the inline editable Prompt Rewriter card directly in the conversation, or run independent rewrite engines (agy-cli / external-api) on a draft.",
      inputSchema: REWRITER_PANEL_INPUT_SCHEMA,
      _meta: {
        ui: { resourceUri: APP_URI }
      }
    },
    {
      name: "open_rewriter",
      title: "Prompt Rewriter",
      description: "Open the Prompt Rewriter sidebar Settings page.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      _meta: {
        ui: { resourceUri: SETTINGS_URI },
        "com.google.antigravity/ui": {
          entrypoints: [
            { type: "global", title: "Prompt Rewriter" }
          ]
        }
      }
    },
    {
      name: "get_rewriter_config",
      title: "Get Prompt Rewriter Config",
      description: "Read saved Prompt Rewriter engine preference, rewrite mode, enabled custom rules, and compiled system instructions (API keys are never returned).",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["standard", "intent-first", "concise"]
          },
          customRuleId: { type: "string" }
        },
        additionalProperties: false
      }
    },
    {
      name: "app_get_state",
      title: "Get App State",
      description: "Internal UI state loader for Prompt Rewriter MCP App.",
      inputSchema: {
        type: "object",
        properties: {
          refreshModels: { type: "boolean" }
        },
        additionalProperties: false
      },
      _meta: {
        ui: { visibility: ["app"] }
      }
    },
    {
      name: "app_rewrite",
      title: "Run Prompt Rewrite",
      description: "Internal UI tool that executes prompt rewriting using the active independent engine.",
      inputSchema: {
        type: "object",
        properties: {
          draft: { type: "string" },
          mode: { type: "string", enum: ["standard", "intent-first", "concise"] },
          language: { type: "string", enum: ["auto", "zh-CN", "en"] },
          customRuleId: { type: "string" }
        },
        required: ["draft"],
        additionalProperties: false
      },
      _meta: {
        ui: { visibility: ["app"] }
      }
    },
    {
      name: "app_save_settings",
      title: "Save Settings",
      description: "Internal UI tool that persists Prompt Rewriter settings.",
      inputSchema: {
        type: "object",
        properties: {
          settings: { type: "object" }
        },
        required: ["settings"],
        additionalProperties: false
      },
      _meta: {
        ui: { visibility: ["app"] }
      }
    },
    {
      name: "app_test_connection",
      title: "Test Engine Connection",
      description: "Internal UI tool that tests the configured rewrite engine.",
      inputSchema: {
        type: "object",
        properties: {
          settings: { type: "object" }
        },
        additionalProperties: false
      },
      _meta: {
        ui: { visibility: ["app"] }
      }
    }
  ];
}
async function runServer() {
  const { dataDir, htmlPath } = parseCliArgs(process.argv);
  const store = new SettingsStore(dataDir);
  let lastPanelState = {
    originalPrompt: "",
    rewrittenPrompt: "",
    mode: "standard",
    customRuleId: "",
    engineUsed: ""
  };
  let outputFraming = "ndjson";
  function sendJson(msg) {
    const body = JSON.stringify(msg);
    if (outputFraming === "content-length") {
      const byteLen = Buffer.byteLength(body, "utf8");
      process.stdout.write(`Content-Length: ${byteLen}\r
\r
${body}`);
    } else {
      process.stdout.write(`${body}
`);
    }
  }
  function sendResult(id, result) {
    if (id === void 0) return;
    sendJson({ jsonrpc: "2.0", id, result });
  }
  function sendError(id, code, message) {
    if (id === void 0) return;
    sendJson({ jsonrpc: "2.0", id, error: { code, message } });
  }
  async function executeIndependentRewrite(settings, draft, mode, language, customRuleId) {
    const rule = resolveActiveRule(settings, customRuleId);
    const systemPrompt = buildRewriteSystemPrompt(mode, language, rule);
    if (settings.engine === "agy-cli") {
      return runAgyCliRewrite({
        draft,
        systemPrompt,
        model: settings.agyModel,
        timeoutSec: settings.agyTimeoutSec
      });
    }
    if (settings.engine === "external-api") {
      return runExternalApiRewrite({
        draft,
        systemPrompt,
        config: settings.externalApi
      });
    }
    throw new Error("\u5F53\u524D\u5F15\u64CE\u8BBE\u7F6E\u4E3A\u300C\u590D\u7528\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\u300D\uFF0C\u8BF7\u5728\u5BF9\u8BDD\u4E2D\u4F7F\u7528 /prompt-rewriter \u89E6\u53D1\u6539\u5199\uFF0C\u6216\u5728\u8BBE\u7F6E\u4E2D\u5207\u6362\u4E3A\u81EA\u5E26\u8F7B\u91CF\u6A21\u578B / \u5916\u63A5 API");
  }
  async function handleRewriterPanelCall(args, surface) {
    const settings = await store.load();
    const originalPrompt = typeof args.originalPrompt === "string" ? args.originalPrompt : "";
    const mode = pickMode(args.mode, settings.defaultMode);
    const customRuleId = typeof args.customRuleId === "string" ? args.customRuleId : settings.activeCustomRuleId;
    let rewrittenPrompt = typeof args.rewrittenPrompt === "string" ? args.rewrittenPrompt : "";
    let engineUsed = typeof args.engineUsed === "string" ? args.engineUsed : "";
    const fallbackNote = typeof args.fallbackNote === "string" ? args.fallbackNote : "";
    let durationMs;
    if (args.autoRun === true && originalPrompt.trim() && !rewrittenPrompt) {
      if (settings.engine === "agy-cli" || settings.engine === "external-api") {
        try {
          const res = await executeIndependentRewrite(
            settings,
            originalPrompt,
            mode,
            settings.language,
            customRuleId
          );
          rewrittenPrompt = res.text;
          engineUsed = res.engineUsed;
          durationMs = res.durationMs;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Independent engine (${settings.engine}) failed: ${errMsg}. fallbackToHostOnError=${settings.fallbackToHostOnError}`
              }
            ]
          };
        }
      }
    }
    let activeState = lastPanelState;
    if (originalPrompt || rewrittenPrompt) {
      activeState = {
        originalPrompt,
        rewrittenPrompt: rewrittenPrompt || originalPrompt,
        mode,
        customRuleId,
        engineUsed: engineUsed || settings.engine,
        durationMs,
        fallbackNote
      };
      lastPanelState = activeState;
    }
    const publicSettings = toPublicSettings(settings);
    const agyCli = await listAgyModels(false);
    const defaultView = surface === "inline" ? "editor" : "settings";
    const summaryText = surface === "inline" ? `Rendered inline Prompt Rewriter card (${activeState.engineUsed || settings.engine}).` : "Opened Prompt Rewriter settings.";
    return {
      content: [{ type: "text", text: summaryText }],
      structuredContent: {
        surface,
        defaultView,
        panelState: activeState,
        settings: publicSettings,
        agyCli
      }
    };
  }
  async function handleToolCall(name, args) {
    if (name === "get_rewriter_config") {
      const settings = await store.load();
      const mode = pickMode(args.mode, settings.defaultMode);
      const customRuleId = typeof args.customRuleId === "string" ? args.customRuleId : settings.activeCustomRuleId;
      const rule = resolveActiveRule(settings, customRuleId);
      const compiledSystemPrompt = buildRewriteSystemPrompt(mode, settings.language, rule);
      const publicSettings = toPublicSettings(settings);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                settings: publicSettings,
                resolvedMode: mode,
                activeCustomRule: rule ? { id: rule.id, name: rule.name } : null,
                compiledSystemPrompt
              },
              null,
              2
            )
          }
        ],
        structuredContent: {
          settings: publicSettings,
          resolvedMode: mode,
          activeCustomRule: rule ? { id: rule.id, name: rule.name } : null,
          compiledSystemPrompt
        }
      };
    }
    if (name === "show_rewriter_card") {
      return handleRewriterPanelCall(args, "inline");
    }
    if (name === "open_rewriter") {
      return handleRewriterPanelCall(args, "global");
    }
    if (name === "app_get_state") {
      const settings = await store.load();
      const agyCli = await listAgyModels(Boolean(args.refreshModels));
      return {
        content: [{ type: "text", text: "ok" }],
        structuredContent: {
          panelState: lastPanelState,
          settings: toPublicSettings(settings),
          agyCli
        }
      };
    }
    if (name === "app_save_settings") {
      const patch = args.settings || {};
      const saved = await store.update(patch);
      return {
        content: [{ type: "text", text: "saved" }],
        structuredContent: {
          settings: toPublicSettings(saved)
        }
      };
    }
    if (name === "app_test_connection") {
      const current = await store.load();
      const candidate = args.settings ? await store.update(args.settings) : current;
      const result = await testEngineConnection(candidate);
      const agyCli = await listAgyModels(candidate.engine === "agy-cli");
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: {
          ...result,
          settings: toPublicSettings(candidate),
          agyCli
        }
      };
    }
    if (name === "app_rewrite") {
      const settings = await store.load();
      const draft = String(args.draft || "").trim();
      if (!draft) {
        return {
          content: [{ type: "text", text: "\u8349\u7A3F\u4E3A\u7A7A" }],
          structuredContent: { ok: false, error: "\u8BF7\u5148\u5728\u6587\u672C\u6846\u4E2D\u8F93\u5165\u9700\u8981\u6539\u5199\u7684\u8349\u7A3F" }
        };
      }
      const mode = pickMode(args.mode, settings.defaultMode);
      const language = pickLanguage(args.language, settings.language);
      const customRuleId = typeof args.customRuleId === "string" ? args.customRuleId : settings.activeCustomRuleId;
      try {
        const res = await executeIndependentRewrite(settings, draft, mode, language, customRuleId);
        lastPanelState = {
          originalPrompt: draft,
          rewrittenPrompt: res.text,
          mode,
          customRuleId,
          engineUsed: res.engineUsed,
          durationMs: res.durationMs
        };
        return {
          content: [{ type: "text", text: "ok" }],
          structuredContent: {
            ok: true,
            panelState: lastPanelState
          }
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: errMsg }],
          structuredContent: {
            ok: false,
            error: errMsg
          }
        };
      }
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  async function handleMessage(msg) {
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") {
      if (msg && msg.id !== void 0) {
        sendError(msg.id, -32600, "Invalid Request");
      }
      return;
    }
    const { id, method, params = {} } = msg;
    try {
      if (method === "initialize") {
        const clientProto = typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-03-26";
        sendResult(id, {
          protocolVersion: clientProto,
          capabilities: {
            tools: {},
            resources: {}
          },
          serverInfo: SERVER_INFO
        });
        return;
      }
      if (method === "notifications/initialized" || method === "notifications/cancelled") {
        return;
      }
      if (method === "ping") {
        sendResult(id, {});
        return;
      }
      if (method === "tools/list") {
        sendResult(id, { tools: buildToolList() });
        return;
      }
      if (method === "tools/call") {
        const toolName = String(params.name || "");
        const toolArgs = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {};
        const result = await handleToolCall(toolName, toolArgs);
        sendResult(id, result);
        return;
      }
      if (method === "resources/list") {
        sendResult(id, {
          resources: [
            {
              uri: APP_URI,
              name: "Prompt Rewriter Card",
              description: "Inline editable Prompt Rewriter card for chat conversations",
              mimeType: APP_MIME_TYPE
            },
            {
              uri: SETTINGS_URI,
              name: "Prompt Rewriter Settings",
              description: "Sidebar settings page for agy-prompt-rewriter",
              mimeType: APP_MIME_TYPE
            }
          ]
        });
        return;
      }
      if (method === "resources/read") {
        const uri = String(params.uri || "");
        if (uri !== APP_URI && uri !== SETTINGS_URI) {
          sendError(id, -32002, `Resource not found: ${uri}`);
          return;
        }
        const surface = uri === SETTINGS_URI ? "global" : "inline";
        const rawHtml = await fs2.readFile(htmlPath, "utf8");
        const html = rawHtml.replace(/<body(\s|>)/i, `<body data-surface="${surface}"$1`);
        sendResult(id, {
          contents: [
            {
              uri,
              mimeType: APP_MIME_TYPE,
              text: html,
              _meta: {
                ui: {
                  prefersBorder: false
                }
              }
            }
          ]
        });
        return;
      }
      if (id !== void 0) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (id !== void 0) {
        sendError(id, -32603, errMsg);
      }
    }
  }
  let buffer = Buffer.alloc(0);
  let discardingOversizedLine = false;
  let queue = Promise.resolve();
  function enqueueMessage(rawJson) {
    queue = queue.then(async () => {
      try {
        const parsed = JSON.parse(rawJson);
        await handleMessage(parsed);
      } catch {
        sendError(null, -32700, "Parse error");
      }
    });
  }
  function processBuffer() {
    while (buffer.length > 0) {
      if (discardingOversizedLine) {
        const nl2 = buffer.indexOf(10);
        if (nl2 === -1) {
          buffer = Buffer.alloc(0);
          return;
        }
        buffer = buffer.subarray(nl2 + 1);
        discardingOversizedLine = false;
        continue;
      }
      const headPreview = buffer.subarray(0, Math.min(buffer.length, 32)).toString("latin1");
      if (/^Content-Length:/i.test(headPreview)) {
        outputFraming = "content-length";
        let headerEnd = buffer.indexOf("\r\n\r\n");
        let sepLen = 4;
        if (headerEnd === -1) {
          headerEnd = buffer.indexOf("\n\n");
          sepLen = 2;
        }
        if (headerEnd === -1) {
          if (buffer.length > 8192) {
            buffer = Buffer.alloc(0);
            sendError(null, -32600, "Header too large");
          }
          return;
        }
        const headerText = buffer.subarray(0, headerEnd).toString("latin1");
        const match = /^Content-Length:\s*(\d+)\s*$/im.exec(headerText);
        if (!match) {
          buffer = buffer.subarray(headerEnd + sepLen);
          sendError(null, -32600, "Invalid Content-Length header");
          continue;
        }
        const contentLen = Number.parseInt(match[1], 10);
        if (!Number.isFinite(contentLen) || contentLen < 0 || contentLen > MAX_FRAME_BYTES) {
          buffer = buffer.subarray(headerEnd + sepLen);
          sendError(null, -32600, "Frame exceeds 64 MiB limit");
          continue;
        }
        const totalNeed = headerEnd + sepLen + contentLen;
        if (buffer.length < totalNeed) {
          return;
        }
        const payload = buffer.subarray(headerEnd + sepLen, totalNeed).toString("utf8");
        buffer = buffer.subarray(totalNeed);
        enqueueMessage(payload);
        continue;
      }
      const nl = buffer.indexOf(10);
      if (nl === -1) {
        if (buffer.length > MAX_FRAME_BYTES) {
          buffer = Buffer.alloc(0);
          discardingOversizedLine = true;
          sendError(null, -32600, "NDJSON frame exceeds 64 MiB limit");
        }
        return;
      }
      if (nl > MAX_FRAME_BYTES) {
        buffer = buffer.subarray(nl + 1);
        sendError(null, -32600, "NDJSON frame exceeds 64 MiB limit");
        continue;
      }
      outputFraming = "ndjson";
      const line = buffer.subarray(0, nl).toString("utf8").trim();
      buffer = buffer.subarray(nl + 1);
      if (line) {
        enqueueMessage(line);
      }
    }
  }
  function shutdown() {
    queue.finally(() => {
      const timer = setTimeout(() => process.exit(0), 100);
      timer.unref();
      process.stdout.end(() => process.exit(0));
    });
  }
  process.stdin.on("data", (chunk) => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
    processBuffer();
  });
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.stdin.on("error", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  if (process.platform === "win32") {
    process.on("SIGBREAK", shutdown);
  }
}
runServer().catch((err) => {
  process.stderr.write(`agy-prompt-rewriter server error: ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
});
