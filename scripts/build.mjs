import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

async function main() {
  await fs.mkdir(DIST, { recursive: true });

  // 1. Bundle Node.js Stdio MCP Server (zero runtime dependencies)
  await build({
    entryPoints: [path.join(ROOT, "src/server/index.ts")],
    outfile: path.join(DIST, "mcp-server.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    minify: false,
    sourcemap: false,
    banner: {
      js: "// Built by scripts/build.mjs — zero-dependency MCP App server for agy-prompt-rewriter\n",
    },
  });

  // 2. Bundle UI script in memory and inline with CSS into a single self-contained HTML file
  const uiResult = await build({
    entryPoints: [path.join(ROOT, "src/ui/app.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    write: false,
    minify: true,
    sourcemap: false,
  });

  const bundledJs = uiResult.outputFiles[0].text.replace(/<\/script>/gi, "<\\/script>");
  const css = await fs.readFile(path.join(ROOT, "src/ui/styles.css"), "utf8");

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <title>Prompt Rewriter</title>
  <style>${css}</style>
</head>
<body>
  <script>${bundledJs}</script>
</body>
</html>
`;

  const htmlOut = path.join(DIST, "app.html");
  await fs.writeFile(htmlOut, html, "utf8");

  const htmlBytes = Buffer.byteLength(html, "utf8");
  const serverBytes = (await fs.stat(path.join(DIST, "mcp-server.mjs"))).size;
  if (htmlBytes >= 1024 * 1024) {
    throw new Error(`dist/app.html (${htmlBytes} bytes) exceeds 1 MiB safety budget`);
  }

  console.log(`Built dist/mcp-server.mjs (${serverBytes} bytes) and dist/app.html (${htmlBytes} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
