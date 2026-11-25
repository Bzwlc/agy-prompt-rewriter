import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function loadUnitModules() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-rewriter-unit-"));
  const rulesOut = path.join(tmpDir, "prompt-rules.mjs");
  const enginesOut = path.join(tmpDir, "engines.mjs");

  await build({
    entryPoints: [path.join(ROOT, "src/shared/prompt-rules.ts")],
    outfile: rulesOut,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
  await build({
    entryPoints: [path.join(ROOT, "src/server/engines.ts")],
    outfile: enginesOut,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });

  const rulesMod = await import(pathToFileURL(rulesOut).href);
  const enginesMod = await import(pathToFileURL(enginesOut).href);
  return {
    rulesMod,
    enginesMod,
    cleanup: () => fs.rm(tmpDir, { recursive: true, force: true }),
  };
}

function createMcpClient(dataDir, extraEnv = {}) {
  const serverPath = path.join(ROOT, "dist/mcp-server.mjs");
  const child = spawn(process.execPath, [serverPath, "--data-dir", dataDir], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
  });

  let buf = "";
  let nextId = 1;
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    while (true) {
      const nl = buf.indexOf("\n");
      if (nl === -1) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        } else {
          resolve(msg.result);
        }
      }
    }
  });

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, 15_000);
      pending.set(id, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async function close() {
    child.stdin.end();
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        child.kill();
        resolve();
      }, 2000);
      child.once("close", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  return { request, notify, close };
}

test("unit: parseAgyModelsOutput and sanitizeRewrittenOutput", async () => {
  const { rulesMod, enginesMod, cleanup } = await loadUnitModules();
  try {
    const parsed = enginesMod.parseAgyModelsOutput(
      [
        "Fetching available models...",
        "gemini-4-neon-high\tGemini 4 Neon (High)",
        "gemini-3.8-flash-low\tGemini 3.8 Flash (Low)",
        "gemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)",
        "gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)",
        "gpt-oss-120b-medium\tGPT-OSS 120B (Medium)",
      ].join("\n"),
    );
    assert.equal(parsed.length, 5);
    assert.equal(parsed[0].id, "gemini-3.8-flash-low");
    assert.equal(parsed[0].recommended, true);
    assert.equal(parsed[1].id, "gemini-4-hydrogen-low");
    assert.equal(parsed[1].recommended, true);
    assert.equal(parsed[2].id, "gemini-4-hydrogen-medium");
    assert.equal(parsed[2].recommended, true);
    assert.equal(parsed[3].id, "gpt-oss-120b-medium");
    assert.equal(parsed[3].recommended, true);
    assert.equal(parsed[4].id, "gemini-4-neon-high");
    assert.equal(parsed[4].recommended, false);

    const fenced = "```markdown\n目标：导出 Excel\n请问需要导出哪些字段？\n```";
    const cleaned = rulesMod.sanitizeRewrittenOutput(fenced, "导出 Excel");
    assert.equal(cleaned, "目标：导出 Excel");

    const pureQuestion = "你希望使用哪个库？";
    assert.equal(rulesMod.sanitizeRewrittenOutput(pureQuestion, "导出 Excel"), "导出 Excel");
  } finally {
    await cleanup();
  }
});

test("MCP server: initialize, UI resource, entrypoints, settings persistence, and key masking", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "agy-rewriter-data-"));
  const client = createMcpClient(dataDir, { TEST_PROMPT_KEY: "env-secret-value-9999" });

  try {
    const init = await client.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    assert.equal(init.serverInfo.name, "agy-prompt-rewriter");
    assert.equal(init.serverInfo.version, "0.2.0");
    client.notify("notifications/initialized", {});

    const toolsRes = await client.request("tools/list");
    const toolsByName = new Map(toolsRes.tools.map((t) => [t.name, t]));
    assert.ok(toolsByName.has("show_rewriter_card"));
    assert.ok(toolsByName.has("open_rewriter"));
    assert.ok(toolsByName.has("get_rewriter_config"));
    assert.ok(toolsByName.has("app_get_state"));
    assert.ok(toolsByName.has("app_rewrite"));
    assert.ok(toolsByName.has("app_save_settings"));
    assert.ok(toolsByName.has("app_test_connection"));

    const inlineTool = toolsByName.get("show_rewriter_card");
    assert.equal(inlineTool._meta.ui.resourceUri, "ui://prompt-rewriter/app.html");
    assert.equal(inlineTool._meta["com.google.antigravity/ui"], undefined);

    const openTool = toolsByName.get("open_rewriter");
    assert.equal(openTool._meta.ui.resourceUri, "ui://prompt-rewriter/settings.html");
    assert.deepEqual(
      openTool._meta["com.google.antigravity/ui"].entrypoints.map((e) => e.type),
      ["global"],
    );
    assert.deepEqual(toolsByName.get("app_save_settings")._meta.ui.visibility, ["app"]);

    const resList = await client.request("resources/list");
    const resUris = resList.resources.map((r) => r.uri);
    assert.deepEqual(resUris, ["ui://prompt-rewriter/app.html", "ui://prompt-rewriter/settings.html"]);
    assert.equal(resList.resources[0].mimeType, "text/html;profile=mcp-app");
    assert.equal(resList.resources[1].mimeType, "text/html;profile=mcp-app");

    const resRead = await client.request("resources/read", {
      uri: "ui://prompt-rewriter/app.html",
    });
    const htmlItem = resRead.contents[0];
    assert.equal(htmlItem.uri, "ui://prompt-rewriter/app.html");
    assert.equal(htmlItem.mimeType, "text/html;profile=mcp-app");
    assert.equal(htmlItem._meta.ui.prefersBorder, false);
    assert.ok(htmlItem.text.includes('data-surface="inline"'));
    assert.ok(htmlItem.text.includes("<svg"));
    assert.ok(htmlItem.text.includes("quick-settings-popover"));
    assert.ok(htmlItem.text.includes("popovertarget"));
    assert.ok(!htmlItem.text.includes("global-tabs"));
    assert.ok(!htmlItem.text.includes("quick-mode-select"));
    assert.ok(htmlItem.text.includes('name="color-scheme"'));
    assert.ok(htmlItem.text.includes("::picker(select)"));
    assert.ok(!/改写工作台|\\u6539\\u5199\\u5de5\\u4f5c\\u53f0/i.test(htmlItem.text));
    assert.ok(!htmlItem.text.includes("preferLightSubagent"));
    assert.ok(!/子代理档位|\\u5b50\\u4ee3\\u7406\\u6863\\u4f4d/i.test(htmlItem.text));
    assert.ok(/改写完成|\\u6539\\u5199\\u5b8c\\u6210/i.test(htmlItem.text));
    assert.ok(!/<script[^>]+src=["']https?:/i.test(htmlItem.text));

    const settingsRead = await client.request("resources/read", {
      uri: "ui://prompt-rewriter/settings.html",
    });
    const settingsHtmlItem = settingsRead.contents[0];
    assert.equal(settingsHtmlItem.uri, "ui://prompt-rewriter/settings.html");
    assert.equal(settingsHtmlItem.mimeType, "text/html;profile=mcp-app");
    assert.ok(settingsHtmlItem.text.includes('data-surface="global"'));
    assert.ok(settingsHtmlItem.text.includes("mode-guide-toggle"));
    assert.ok(settingsHtmlItem.text.includes("mode-guide-card"));
    assert.ok(/三种改写模式有什么区别|\\u4e09\\u79cd\\u6539\\u5199\\u6a21\\u5f0f/i.test(settingsHtmlItem.text));

    // Empty {} launch for sidebar global entrypoint
    const emptyOpen = await client.request("tools/call", {
      name: "open_rewriter",
      arguments: {},
    });
    assert.ok(!emptyOpen.isError);
    assert.equal(emptyOpen.structuredContent.surface, "global");
    assert.equal(emptyOpen.structuredContent.defaultView, "settings");
    assert.ok(emptyOpen.structuredContent.settings);

    // Inline card launch in conversation
    const inlineOpen = await client.request("tools/call", {
      name: "show_rewriter_card",
      arguments: {
        originalPrompt: "写个脚本",
        rewrittenPrompt: "详细脚本要求",
        mode: "standard",
        engineUsed: "host-session",
      },
    });
    assert.ok(!inlineOpen.isError);
    assert.equal(inlineOpen.structuredContent.surface, "inline");
    assert.equal(inlineOpen.structuredContent.defaultView, "editor");
    assert.equal(inlineOpen.structuredContent.panelState.originalPrompt, "写个脚本");
    assert.equal(inlineOpen.structuredContent.panelState.rewrittenPrompt, "详细脚本要求");

    // Empty draft rewrite must return explicit error payload
    const emptyRewrite = await client.request("tools/call", {
      name: "app_rewrite",
      arguments: { draft: "   " },
    });
    assert.equal(emptyRewrite.structuredContent.ok, false);
    assert.ok(emptyRewrite.structuredContent.error);

    // Save settings with secret key + custom rule and verify masking
    const saveRes = await client.request("tools/call", {
      name: "app_save_settings",
      arguments: {
        settings: {
          engine: "external-api",
          defaultMode: "intent-first",
          externalApi: {
            format: "openai",
            baseUrl: "https://api.example.com/v1",
            model: "gpt-4o-mini",
            apiKey: "sk-secret-12345678",
          },
          customRules: [
            {
              id: "r1",
              name: "Python CLI",
              content: "Always include --dry-run flag.",
              enabled: true,
            },
          ],
          activeCustomRuleId: "r1",
        },
      },
    });

    const savedPublic = saveRes.structuredContent.settings;
    assert.equal(savedPublic.externalApi.apiKeyMasked, "sk-****5678");
    assert.equal(savedPublic.externalApi.hasApiKey, true);
    assert.equal(savedPublic.externalApi.apiKeySource, "stored");
    assert.equal("apiKey" in savedPublic.externalApi, false);

    // Partial update must preserve stored secret and never leak it
    await client.request("tools/call", {
      name: "app_save_settings",
      arguments: {
        settings: {
          language: "zh-CN",
          externalApi: {
            apiKey: "sk-****5678",
          },
        },
      },
    });

    const stateRes = await client.request("tools/call", {
      name: "app_get_state",
      arguments: {},
    });
    assert.equal(stateRes.structuredContent.settings.externalApi.apiKeyMasked, "sk-****5678");
    assert.equal("preferLightSubagent" in stateRes.structuredContent.settings, false);
    assert.equal("subagentTier" in stateRes.structuredContent.settings, false);

    const cfgRes = await client.request("tools/call", {
      name: "get_rewriter_config",
      arguments: {},
    });
    const serializedCfg = JSON.stringify(cfgRes);
    assert.ok(!serializedCfg.includes("sk-secret-12345678"));
    assert.equal("preferLightSubagent" in cfgRes.structuredContent.settings, false);
    assert.equal("subagentTier" in cfgRes.structuredContent.settings, false);
    assert.ok(cfgRes.structuredContent.compiledSystemPrompt.includes("Always include --dry-run flag."));

    // Support env:VAR_NAME without leaking value
    const envSave = await client.request("tools/call", {
      name: "app_save_settings",
      arguments: {
        settings: {
          externalApi: {
            apiKey: "env:TEST_PROMPT_KEY",
          },
        },
      },
    });
    const envPublic = envSave.structuredContent.settings.externalApi;
    assert.equal(envPublic.apiKeyMasked, "env:TEST_PROMPT_KEY");
    assert.equal(envPublic.hasApiKey, true);
    assert.equal(envPublic.apiKeySource, "env");
    assert.ok(!JSON.stringify(envSave).includes("env-secret-value-9999"));
  } finally {
    await client.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
