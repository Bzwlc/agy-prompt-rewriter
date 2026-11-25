import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { sanitizeRewrittenOutput } from "../shared/prompt-rules.js";
import type {
  AgyCliStatus,
  AgyModelInfo,
  ExternalApiConfig,
  StoredSettings,
} from "../shared/types.js";
import { resolveApiKey } from "./storage.js";

const execFileAsync = promisify(execFile);

const RECOMMENDED_LIGHT_MODELS = new Set([
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-high",
  "gemini-4-hydrogen-low",
  "gemini-4-hydrogen-medium",
  "gpt-oss-120b-medium",
]);

let cachedAgyBin: string | null | undefined;
let cachedModels: { expiresAt: number; status: AgyCliStatus } | null = null;

/**
 * Parse `agy models` stdout lines (`<id>\t<displayName>`) into structured model entries.
 */
export function parseAgyModelsOutput(stdout: string): AgyModelInfo[] {
  const models: AgyModelInfo[] = [];
  const seen = new Set<string>();
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
      recommended: RECOMMENDED_LIGHT_MODELS.has(id),
    });
  }
  return models.sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)));
}

/**
 * Locate the native `agy` executable without shell interpolation.
 */
export async function findAgyExecutable(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedAgyBin !== undefined) {
    return cachedAgyBin;
  }

  if (process.platform === "win32") {
    const candidates: string[] = [];
    try {
      const { stdout } = await execFileAsync("where.exe", ["agy"], {
        windowsHide: true,
        timeout: 4000,
      });
      for (const line of stdout.split(/\r?\n/)) {
        const p = line.trim();
        if (p) candidates.push(p);
      }
    } catch {
      // Fall through to well-known paths.
    }
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    candidates.push(path.join(localAppData, "agy", "bin", "agy.exe"));

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
    const { stdout } = await execFileAsync("which", ["agy"], { timeout: 4000 });
    const found = stdout.split(/\r?\n/)[0]?.trim();
    if (found && existsSync(found)) {
      cachedAgyBin = found;
      return found;
    }
  } catch {
    // Ignore.
  }
  cachedAgyBin = null;
  return null;
}

export async function listAgyModels(forceRefresh = false): Promise<AgyCliStatus> {
  if (!forceRefresh && cachedModels && cachedModels.expiresAt > Date.now()) {
    return cachedModels.status;
  }

  const exe = await findAgyExecutable(forceRefresh);
  if (!exe) {
    const status: AgyCliStatus = {
      available: false,
      executable: "",
      models: [],
      error: "未检测到本机 agy CLI 可执行文件",
    };
    cachedModels = { expiresAt: Date.now() + 60_000, status };
    return status;
  }

  try {
    const res = await execAgy(exe, ["models"], 12_000);
    const models = parseAgyModelsOutput(`${res.stdout}\n${res.stderr}`);
    const status: AgyCliStatus =
      models.length > 0
        ? { available: true, executable: exe, models }
        : {
            available: false,
            executable: exe,
            models: [],
            error: res.stderr.trim() || "agy models 未返回可用模型",
          };
    cachedModels = { expiresAt: Date.now() + 5 * 60_000, status };
    return status;
  } catch (err) {
    const status: AgyCliStatus = {
      available: false,
      executable: exe,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
    cachedModels = { expiresAt: Date.now() + 30_000, status };
    return status;
  }
}

function execAgy(
  executable: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const isCmd = process.platform === "win32" && !executable.toLowerCase().endsWith(".exe");
    const child = isCmd
      ? spawn("cmd.exe", ["/d", "/s", "/c", executable, ...args], {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn(executable, args, {
          windowsHide: true,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`agy CLI 执行超时 (${Math.round(timeoutMs / 1000)}s)`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
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

export async function runAgyCliRewrite(params: {
  draft: string;
  systemPrompt: string;
  model: string;
  timeoutSec: number;
}): Promise<{ text: string; engineUsed: string; durationMs: number }> {
  const started = Date.now();
  const exe = await findAgyExecutable();
  if (!exe) {
    throw new Error("未找到本机 agy CLI，请在设置中改用「外接自定义 API」或「当前会话模型」");
  }

  const combinedPrompt = [
    params.systemPrompt,
    "",
    "<draft_to_rewrite>",
    params.draft,
    "</draft_to_rewrite>",
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
    `${params.timeoutSec}s`,
  ];

  const res = await execAgy(exe, args, (params.timeoutSec + 5) * 1000);
  if (res.code !== 0 && !res.stdout.trim()) {
    const errDetail = res.stderr.trim() || `exit code ${res.code}`;
    throw new Error(`agy CLI 改写失败: ${errDetail.slice(0, 260)}`);
  }

  const cleaned = sanitizeRewrittenOutput(res.stdout, params.draft);
  return {
    text: cleaned,
    engineUsed: `agy:${params.model}`,
    durationMs: Date.now() - started,
  };
}

function redactSecret(msg: string, secret: string): string {
  if (!secret || secret.length < 4) return msg;
  return msg.split(secret).join("[REDACTED]");
}

function extractOpenAiText(json: unknown): string {
  const obj = json as {
    choices?: Array<{ message?: { content?: unknown } }>;
    output_text?: string;
  };
  if (typeof obj?.output_text === "string") return obj.output_text;
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof (part as { text?: unknown })?.text === "string" ? (part as { text: string }).text : ""))
      .join("");
  }
  return "";
}

function extractGeminiText(json: unknown): string {
  const obj = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = obj?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
}

function extractAnthropicText(json: unknown): string {
  const obj = json as {
    content?: Array<{ type?: string; text?: string }>;
  };
  if (!Array.isArray(obj?.content)) return "";
  return obj.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

export async function runExternalApiRewrite(params: {
  draft: string;
  systemPrompt: string;
  config: ExternalApiConfig;
}): Promise<{ text: string; engineUsed: string; durationMs: number }> {
  const started = Date.now();
  const { format, baseUrl, model, timeoutSec } = params.config;
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  if (!cleanBase || !/^https?:\/\//i.test(cleanBase)) {
    throw new Error("外接 API 的 Base URL 无效（需以 http:// 或 https:// 开头）");
  }
  if (!model.trim()) {
    throw new Error("请先在设置中填写外接 API 的模型名称");
  }

  const secret = resolveApiKey(params.config.apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    let url: string;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: unknown;

    if (format === "gemini") {
      if (!secret) {
        throw new Error("Gemini API 需要配置 API Key（或 env:GEMINI_API_KEY）");
      }
      url = `${cleanBase}/models/${encodeURIComponent(model.trim())}:generateContent`;
      headers["x-goog-api-key"] = secret;
      body = {
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: params.draft }] }],
        generationConfig: { temperature: 0.3 },
      };
    } else if (format === "anthropic") {
      url = cleanBase.endsWith("/messages")
        ? cleanBase
        : cleanBase.endsWith("/v1")
          ? `${cleanBase}/messages`
          : `${cleanBase}/v1/messages`;
      headers["anthropic-version"] = "2023-06-01";
      if (secret) {
        headers["x-api-key"] = secret;
      }
      body = {
        model: model.trim(),
        max_tokens: 2048,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.draft }],
        temperature: 0.3,
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
          { role: "user", content: params.draft },
        ],
        temperature: 0.3,
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const rawBody = await response.text();
    if (!response.ok) {
      let detail = rawBody.slice(0, 240);
      try {
        const parsedErr = JSON.parse(rawBody) as { error?: { message?: string } };
        if (parsedErr?.error?.message) detail = parsedErr.error.message;
      } catch {
        // Keep raw snippet.
      }
      throw new Error(`HTTP ${response.status}: ${redactSecret(detail, secret)}`);
    }

    const json = JSON.parse(rawBody) as unknown;
    const rawText =
      format === "gemini"
        ? extractGeminiText(json)
        : format === "anthropic"
          ? extractAnthropicText(json)
          : extractOpenAiText(json);
    if (!rawText.trim()) {
      throw new Error("外接 API 返回内容为空");
    }

    return {
      text: sanitizeRewrittenOutput(rawText, params.draft),
      engineUsed: `api:${model.trim()}`,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`外接 API 请求超时 (${timeoutSec}s)`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(redactSecret(msg, secret));
  } finally {
    clearTimeout(timer);
  }
}

export async function testEngineConnection(
  settings: StoredSettings,
): Promise<{ ok: boolean; message: string; durationMs: number }> {
  const started = Date.now();
  if (settings.engine === "agy-cli") {
    const status = await listAgyModels(true);
    if (!status.available) {
      return {
        ok: false,
        message: status.error || "agy CLI 不可用",
        durationMs: Date.now() - started,
      };
    }
    const hasSelected = status.models.some((m) => m.id === settings.agyModel);
    return {
      ok: true,
      message: hasSelected
        ? `agy CLI 已就绪（检测到 ${status.models.length} 个模型，已选 ${settings.agyModel}）`
        : `agy CLI 已就绪（检测到 ${status.models.length} 个模型；当前所选 ${settings.agyModel} 未在列表中）`,
      durationMs: Date.now() - started,
    };
  }

  if (settings.engine === "external-api") {
    try {
      const res = await runExternalApiRewrite({
        draft: "ping",
        systemPrompt: "Reply with the exact word OK and nothing else.",
        config: {
          ...settings.externalApi,
          timeoutSec: Math.min(15, settings.externalApi.timeoutSec),
        },
      });
      return {
        ok: true,
        message: `连接成功（${res.engineUsed}，耗时 ${res.durationMs}ms）`,
        durationMs: res.durationMs,
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      };
    }
  }

  return {
    ok: true,
    message: "当前配置为复用 Antigravity 当前会话模型，无需外部连接测试",
    durationMs: Date.now() - started,
  };
}
