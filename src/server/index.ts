import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRewriteSystemPrompt } from "../shared/prompt-rules.js";
import type {
  OutputLanguage,
  RewriteMode,
  RewriterPanelState,
  SettingsPatch,
  StoredSettings,
} from "../shared/types.js";
import {
  listAgyModels,
  runAgyCliRewrite,
  runExternalApiRewrite,
  testEngineConnection,
} from "./engines.js";
import { resolveDefaultDataDir, SettingsStore, toPublicSettings } from "./storage.js";

const APP_URI = "ui://prompt-rewriter/app.html";
const SETTINGS_URI = "ui://prompt-rewriter/settings.html";
const APP_MIME_TYPE = "text/html;profile=mcp-app";
const MAX_FRAME_BYTES = 64 * 1024 * 1024;
const SERVER_INFO = { name: "agy-prompt-rewriter", version: "0.2.0" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseCliArgs(argv: string[]): { dataDir: string; htmlPath: string } {
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
    dataDir: dataDir ? path.resolve(dataDir) : resolveDefaultDataDir(),
    htmlPath: htmlPath ? path.resolve(htmlPath) : resolveDefaultHtmlPath(),
  };
}

function resolveDefaultHtmlPath(): string {
  const sameDir = path.join(__dirname, "app.html");
  if (existsSync(sameDir)) return sameDir;
  return path.resolve(__dirname, "../../dist/app.html");
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const VALID_MODES = new Set<RewriteMode>(["standard", "intent-first", "concise"]);
const VALID_LANGUAGES = new Set<OutputLanguage>(["auto", "zh-CN", "en"]);

function pickMode(raw: unknown, fallback: RewriteMode): RewriteMode {
  return VALID_MODES.has(raw as RewriteMode) ? (raw as RewriteMode) : fallback;
}

function pickLanguage(raw: unknown, fallback: OutputLanguage): OutputLanguage {
  return VALID_LANGUAGES.has(raw as OutputLanguage) ? (raw as OutputLanguage) : fallback;
}

function resolveActiveRule(settings: StoredSettings, customRuleId?: string) {
  const id = (customRuleId ?? settings.activeCustomRuleId ?? "").trim();
  if (!id) return null;
  return settings.customRules.find((r) => r.id === id && r.enabled) || null;
}

const REWRITER_PANEL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    originalPrompt: {
      type: "string",
      description: "Optional rough user prompt draft.",
    },
    rewrittenPrompt: {
      type: "string",
      description: "Optional rewritten prompt produced by the host model.",
    },
    mode: {
      type: "string",
      enum: ["standard", "intent-first", "concise"],
      description: "Optional rewrite mode override.",
    },
    customRuleId: {
      type: "string",
      description: "Optional enabled custom rule ID.",
    },
    autoRun: {
      type: "boolean",
      description:
        "When true and engine is agy-cli or external-api, execute the rewrite server-side before returning.",
    },
    engineUsed: {
      type: "string",
      description: "Optional label describing which model/engine produced rewrittenPrompt.",
    },
    fallbackNote: {
      type: "string",
      description: "Optional note displayed when host fallback occurred.",
    },
  },
  additionalProperties: false,
};

function buildToolList() {
  return [
    {
      name: "show_rewriter_card",
      title: "Prompt Rewriter Card",
      description:
        "Render the inline editable Prompt Rewriter card directly in the conversation, or run independent rewrite engines (agy-cli / external-api) on a draft.",
      inputSchema: REWRITER_PANEL_INPUT_SCHEMA,
      _meta: {
        ui: { resourceUri: APP_URI },
      },
    },
    {
      name: "open_rewriter",
      title: "Prompt Rewriter",
      description:
        "Open the Prompt Rewriter sidebar Settings page.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      _meta: {
        ui: { resourceUri: SETTINGS_URI },
        "com.google.antigravity/ui": {
          entrypoints: [
            { type: "global", title: "Prompt Rewriter" },
          ],
        },
      },
    },
    {
      name: "get_rewriter_config",
      title: "Get Prompt Rewriter Config",
      description:
        "Read saved Prompt Rewriter engine preference, rewrite mode, enabled custom rules, and compiled system instructions (API keys are never returned).",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["standard", "intent-first", "concise"],
          },
          customRuleId: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "app_get_state",
      title: "Get App State",
      description: "Internal UI state loader for Prompt Rewriter MCP App.",
      inputSchema: {
        type: "object",
        properties: {
          refreshModels: { type: "boolean" },
        },
        additionalProperties: false,
      },
      _meta: {
        ui: { visibility: ["app"] },
      },
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
          customRuleId: { type: "string" },
        },
        required: ["draft"],
        additionalProperties: false,
      },
      _meta: {
        ui: { visibility: ["app"] },
      },
    },
    {
      name: "app_save_settings",
      title: "Save Settings",
      description: "Internal UI tool that persists Prompt Rewriter settings.",
      inputSchema: {
        type: "object",
        properties: {
          settings: { type: "object" },
        },
        required: ["settings"],
        additionalProperties: false,
      },
      _meta: {
        ui: { visibility: ["app"] },
      },
    },
    {
      name: "app_test_connection",
      title: "Test Engine Connection",
      description: "Internal UI tool that tests the configured rewrite engine.",
      inputSchema: {
        type: "object",
        properties: {
          settings: { type: "object" },
        },
        additionalProperties: false,
      },
      _meta: {
        ui: { visibility: ["app"] },
      },
    },
  ];
}

async function runServer() {
  const { dataDir, htmlPath } = parseCliArgs(process.argv);
  const store = new SettingsStore(dataDir);

  let lastPanelState: RewriterPanelState = {
    originalPrompt: "",
    rewrittenPrompt: "",
    mode: "standard",
    customRuleId: "",
    engineUsed: "",
  };

  let outputFraming: "ndjson" | "content-length" = "ndjson";

  function sendJson(msg: Record<string, unknown>) {
    const body = JSON.stringify(msg);
    if (outputFraming === "content-length") {
      const byteLen = Buffer.byteLength(body, "utf8");
      process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${body}`);
    } else {
      process.stdout.write(`${body}\n`);
    }
  }

  function sendResult(id: string | number | null | undefined, result: unknown) {
    if (id === undefined) return;
    sendJson({ jsonrpc: "2.0", id, result });
  }

  function sendError(id: string | number | null | undefined, code: number, message: string) {
    if (id === undefined) return;
    sendJson({ jsonrpc: "2.0", id, error: { code, message } });
  }

  async function executeIndependentRewrite(
    settings: StoredSettings,
    draft: string,
    mode: RewriteMode,
    language: OutputLanguage,
    customRuleId?: string,
  ): Promise<{ text: string; engineUsed: string; durationMs: number }> {
    const rule = resolveActiveRule(settings, customRuleId);
    const systemPrompt = buildRewriteSystemPrompt(mode, language, rule);

    if (settings.engine === "agy-cli") {
      return runAgyCliRewrite({
        draft,
        systemPrompt,
        model: settings.agyModel,
        timeoutSec: settings.agyTimeoutSec,
      });
    }
    if (settings.engine === "external-api") {
      return runExternalApiRewrite({
        draft,
        systemPrompt,
        config: settings.externalApi,
      });
    }
    throw new Error("当前引擎设置为「复用当前会话模型」，请在对话中使用 /prompt-rewriter 触发改写，或在设置中切换为自带轻量模型 / 外接 API");
  }

  async function handleRewriterPanelCall(
    args: Record<string, unknown>,
    surface: "inline" | "global",
  ) {
    const settings = await store.load();
    const originalPrompt = typeof args.originalPrompt === "string" ? args.originalPrompt : "";
    const mode = pickMode(args.mode, settings.defaultMode);
    const customRuleId =
      typeof args.customRuleId === "string" ? args.customRuleId : settings.activeCustomRuleId;
    let rewrittenPrompt = typeof args.rewrittenPrompt === "string" ? args.rewrittenPrompt : "";
    let engineUsed = typeof args.engineUsed === "string" ? args.engineUsed : "";
    const fallbackNote = typeof args.fallbackNote === "string" ? args.fallbackNote : "";
    let durationMs: number | undefined;

    if (args.autoRun === true && originalPrompt.trim() && !rewrittenPrompt) {
      if (settings.engine === "agy-cli" || settings.engine === "external-api") {
        try {
          const res = await executeIndependentRewrite(
            settings,
            originalPrompt,
            mode,
            settings.language,
            customRuleId,
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
                text: `Independent engine (${settings.engine}) failed: ${errMsg}. fallbackToHostOnError=${settings.fallbackToHostOnError}`,
              },
            ],
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
        fallbackNote,
      };
      lastPanelState = activeState;
    }

    const publicSettings = toPublicSettings(settings);
    const agyCli = await listAgyModels(false);
    const defaultView = surface === "inline" ? "editor" : "settings";
    const summaryText =
      surface === "inline"
        ? `Rendered inline Prompt Rewriter card (${activeState.engineUsed || settings.engine}).`
        : "Opened Prompt Rewriter settings.";

    return {
      content: [{ type: "text", text: summaryText }],
      structuredContent: {
        surface,
        defaultView,
        panelState: activeState,
        settings: publicSettings,
        agyCli,
      },
    };
  }

  async function handleToolCall(name: string, args: Record<string, unknown>) {
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
                compiledSystemPrompt,
              },
              null,
              2,
            ),
          },
        ],
        structuredContent: {
          settings: publicSettings,
          resolvedMode: mode,
          activeCustomRule: rule ? { id: rule.id, name: rule.name } : null,
          compiledSystemPrompt,
        },
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
          agyCli,
        },
      };
    }

    if (name === "app_save_settings") {
      const patch = (args.settings || {}) as SettingsPatch;
      const saved = await store.update(patch);
      return {
        content: [{ type: "text", text: "saved" }],
        structuredContent: {
          settings: toPublicSettings(saved),
        },
      };
    }

    if (name === "app_test_connection") {
      const current = await store.load();
      const candidate = args.settings
        ? await store.update(args.settings as SettingsPatch)
        : current;
      const result = await testEngineConnection(candidate);
      const agyCli = await listAgyModels(candidate.engine === "agy-cli");
      return {
        content: [{ type: "text", text: result.message }],
        structuredContent: {
          ...result,
          settings: toPublicSettings(candidate),
          agyCli,
        },
      };
    }

    if (name === "app_rewrite") {
      const settings = await store.load();
      const draft = String(args.draft || "").trim();
      if (!draft) {
        return {
          content: [{ type: "text", text: "草稿为空" }],
          structuredContent: { ok: false, error: "请先在文本框中输入需要改写的草稿" },
        };
      }
      const mode = pickMode(args.mode, settings.defaultMode);
      const language = pickLanguage(args.language, settings.language);
      const customRuleId =
        typeof args.customRuleId === "string" ? args.customRuleId : settings.activeCustomRuleId;

      try {
        const res = await executeIndependentRewrite(settings, draft, mode, language, customRuleId);
        lastPanelState = {
          originalPrompt: draft,
          rewrittenPrompt: res.text,
          mode,
          customRuleId,
          engineUsed: res.engineUsed,
          durationMs: res.durationMs,
        };
        return {
          content: [{ type: "text", text: "ok" }],
          structuredContent: {
            ok: true,
            panelState: lastPanelState,
          },
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: errMsg }],
          structuredContent: {
            ok: false,
            error: errMsg,
          },
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  async function handleMessage(msg: JsonRpcRequest) {
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") {
      if (msg && msg.id !== undefined) {
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
            resources: {},
          },
          serverInfo: SERVER_INFO,
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
        const toolArgs =
          params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
            ? (params.arguments as Record<string, unknown>)
            : {};
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
              mimeType: APP_MIME_TYPE,
            },
            {
              uri: SETTINGS_URI,
              name: "Prompt Rewriter Settings",
              description: "Sidebar settings page for agy-prompt-rewriter",
              mimeType: APP_MIME_TYPE,
            },
          ],
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
        const rawHtml = await fs.readFile(htmlPath, "utf8");
        const html = rawHtml.replace(/<body(\s|>)/i, `<body data-surface="${surface}"$1`);
        sendResult(id, {
          contents: [
            {
              uri,
              mimeType: APP_MIME_TYPE,
              text: html,
              _meta: {
                ui: {
                  prefersBorder: false,
                },
              },
            },
          ],
        });
        return;
      }

      if (id !== undefined) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (id !== undefined) {
        sendError(id, -32603, errMsg);
      }
    }
  }

  let buffer: Buffer = Buffer.alloc(0);
  let discardingOversizedLine = false;
  let queue: Promise<void> = Promise.resolve();

  function enqueueMessage(rawJson: string) {
    queue = queue.then(async () => {
      try {
        const parsed = JSON.parse(rawJson) as JsonRpcRequest;
        await handleMessage(parsed);
      } catch {
        sendError(null, -32700, "Parse error");
      }
    });
  }

  function processBuffer() {
    while (buffer.length > 0) {
      if (discardingOversizedLine) {
        const nl = buffer.indexOf(0x0a);
        if (nl === -1) {
          buffer = Buffer.alloc(0);
          return;
        }
        buffer = buffer.subarray(nl + 1);
        discardingOversizedLine = false;
        continue;
      }

      // Skip leading whitespace in NDJSON mode if not starting with Content-Length.
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

      const nl = buffer.indexOf(0x0a);
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

  process.stdin.on("data", (chunk: Buffer) => {
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
  process.stderr.write(`agy-prompt-rewriter server error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
