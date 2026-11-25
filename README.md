# agy-prompt-rewriter

English · [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Google Antigravity](https://img.shields.io/badge/Google%20Antigravity-MCP%20App%20%2B%20Skill-4f46e5.svg)](https://antigravity.google)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg)](https://nodejs.org/)
[![Zero Runtime Deps](https://img.shields.io/badge/Runtime%20Deps-Zero-0284c7.svg)](./package.json)

Turn a rough, half-formed chat draft into a clear, structured, execution-ready prompt right inside Google Antigravity. **Rewrite only — never executes tasks, never asks follow-up questions.** The result lands in an inline editable card so you can tweak wording, undo to your original draft, or send it to execute in one click.

- **Inline Editable Card + Pure SVG Toolbar**: Running `/prompt-rewriter` renders a dedicated editor directly beneath the reply — edit in place, undo (`↩`), re-enhance (`✨`), copy (`📋`), or send to the active conversation (`➤`).
- **3-Engine Routing + Quick Switcher**: Uses your local `agy` lightweight model by default so your main model context and quota stay untouched, with optional External API (OpenAI / Gemini / Ollama) and Current Session routing (auto-engaged for images and `@` attachments).
- **Zero Runtime Dependencies**: Pre-built `dist/mcp-server.mjs` and single-file `dist/app.html` are committed — clone and enable with zero `npm install`.

```text
Please install and enable the Google Antigravity plugin agy-prompt-rewriter for me:
1. Clone https://github.com/Bzwlc/agy-prompt-rewriter.git into the global plugin directory (~/.gemini/config/plugins/agy-prompt-rewriter on macOS/Linux, or %USERPROFILE%\.gemini\config\plugins\agy-prompt-rewriter on Windows);
2. Run `agy plugin enable agy-prompt-rewriter`;
3. Run `agy plugin validate --strict` to verify the installation and report the result.
```

**Contents**: [Quick Start](#quick-start) · [Who It Is For](#who-it-is-for) · [What It Does](#what-it-does) · [Usage](#usage) · [Settings and Engines](#settings-and-engines) · [How It Works and Security](#how-it-works-and-security) · [FAQ and Limitations](#faq-and-limitations) · [Development](#development)

---

## Quick Start

Requirements: **Google Antigravity** (`agy` CLI, Desktop 2.0, or IDE) and **Node.js >= 20**.

### Option 1: Let Your AI Assistant Install It (Recommended)

Copy and send the prompt below to Antigravity (or your AI coding assistant) to clone, enable, and validate automatically:

```text
Please install and enable the Google Antigravity plugin agy-prompt-rewriter for me:
1. Clone https://github.com/Bzwlc/agy-prompt-rewriter.git into the global Antigravity plugins directory:
   - macOS / Linux: `~/.gemini/config/plugins/agy-prompt-rewriter`
   - Windows: `%USERPROFILE%\.gemini\config\plugins\agy-prompt-rewriter`
   (If the directory already exists, verify the remote and run `git pull --ff-only`.)
2. Run `agy plugin enable agy-prompt-rewriter`.
3. Run `agy plugin validate --strict <plugin-dir>` to verify the manifest, skill, and MCP server bundle.
4. Report the installed path, validation status, and how to test `/prompt-rewriter`.
```

### Option 2: Manual Global Install via Terminal

```bash
# macOS / Linux
git clone https://github.com/Bzwlc/agy-prompt-rewriter.git ~/.gemini/config/plugins/agy-prompt-rewriter
agy plugin enable agy-prompt-rewriter
agy plugin validate --strict ~/.gemini/config/plugins/agy-prompt-rewriter
```

```powershell
# Windows (PowerShell)
git clone https://github.com/Bzwlc/agy-prompt-rewriter.git "$env:USERPROFILE\.gemini\config\plugins\agy-prompt-rewriter"
agy plugin enable agy-prompt-rewriter
agy plugin validate --strict "$env:USERPROFILE\.gemini\config\plugins\agy-prompt-rewriter"
```

> Pre-built `dist/mcp-server.mjs` and `dist/app.html` are committed in the repository, so end users need **zero `npm install`**.

### Other Installation Options

- **Via `agy` CLI from a local checkout**:
  ```bash
  agy plugin install /path/to/agy-prompt-rewriter
  agy plugin enable agy-prompt-rewriter
  ```
- **Project-scoped (team sharing)**: Copy this repository into `.agents/plugins/agy-prompt-rewriter/` inside your project repo.

### Try It Once

1. Send in Antigravity chat: `/prompt-rewriter Add rate limiting to our API so it doesn't get flooded`
2. Edit directly inside the inline card if needed, then click `➤` at the bottom right to send and execute.
3. Open **Extensions → Prompt Rewriter** in the left sidebar whenever you want to configure API keys, custom rules, or mode defaults.

---

## Who It Is For

**Good fit**

- Developers who drop a quick one-line idea into chat and are tired of getting hit with clarifying questions or off-target implementations.
- Teams who want prompts expanded with clear Goals, I/O, and Verification Boundaries without burning their flagship session model on prompt polishing.
- Users who want full control over the rewritten text — editable in place, revertible in one click, and customizable with reusable engineering rules.

**Not a fit**

- Users who expect `/prompt-rewriter` to immediately edit files or run commands — this plugin strictly **rewrites only and never executes**.
- Users who prefer back-and-forth interactive Q&A to narrow down requirements — this plugin outputs **zero follow-up questions** and instructs the executor to choose conservative defaults and state assumptions.

---

## What It Does

One-line drafts usually miss three things: **Goal, Output Format, and Boundaries / Verification**. Sending that raw line straight to an agent forces it to guess or stop to ask questions. `agy-prompt-rewriter` turns your rough note into an execution-ready specification first.

**What you type**

> `/prompt-rewriter Add rate limiting to our API so it doesn't get flooded`

**What lands in the inline card (Standard mode example)**

> Goal: Add request rate limiting to the existing HTTP API endpoints to protect the service from burst traffic and abuse.
>
> Scope & Approach:
> 1. Inspect the existing router and middleware setup and add a rate-limiting middleware without breaking current endpoint signatures;
> 2. Reuse existing project utilities or a lightweight token-bucket / sliding-window limiter (defaulting to in-memory per-instance counters unless a shared store is already configured);
> 3. Return HTTP `429 Too Many Requests` with a structured JSON error message and a `Retry-After` header when limits are exceeded.
>
> Boundaries & Verification:
> - Keep changes minimal and leave health-check or static routes exempt (for unspecified thresholds, window sizes, or allowlists, adopt conservative defaults and state your assumptions briefly);
> - Add or run tests verifying normal traffic passes and excessive requests receive `429`.

- **Editable in place**: The output sits inside a live `<textarea>` so you can adjust thresholds, file paths, or constraints before clicking `➤`.
- **No stray questions**: `sanitizeRewrittenOutput` strips accidental outer markdown fences, meta prefixes, and trailing follow-up questions automatically.

---

## Usage

### 1. Triggering a Rewrite

Any of the following triggers the skill (rendering the inline MCP App card when connected, or falling back to a clean fenced `markdown` block if MCP is unavailable):

- Slash command: `/prompt-rewriter <your draft>`
- Natural language: `rewrite this prompt: ...`, `polish this prompt: ...`, `帮我改写提示词：...`, `详细改写 ...`, `精简改写 ...`

### 2. Using the Inline Card (`show_rewriter_card`)

The inline card renders **only the rewrite workbench**:

| Area | Control | Behavior |
| :--- | :--- | :--- |
| Top bar | Mode / Rule selector | Switch between `Standard`, `Intent-First`, `Concise`, or any enabled custom rule |
| Top bar | Engine badge | Displays the active engine (`⚡ gemini-3.8-flash-low`, `🌐 gpt-4o-mini`, `💬 Current Session`) |
| Top bar | `⚙` Quick Switcher | Opens an anchored popover (`popover="auto"`) to switch **Engine**, **Built-in Model**, or **Default Mode** on the fly (dismisses on outside click or `Esc`) |
| Editor | Auto-sizing `<textarea>` | Edit the rewritten prompt or refine your original draft directly |
| Bottom bar | `↩` / `↪` Undo / Redo | Revert to the initial draft (`↩`), then toggle back to the rewritten version (`↪`) |
| Bottom bar | `✨` Re-enhance | Re-run rewriting on the current text with the selected mode/rule; click again while running to cancel |
| Bottom bar | `📋` Copy prompt | Copy editor contents to clipboard (`✓` feedback) |
| Bottom bar | `➤` Send to conversation | Calls `app.sendMessage` to submit the finalized prompt into the active chat |

### 3. Comparing the Three Modes (Example: `Write a script to clean up old log files`)

| Mode | Trigger | Typical Expansion | Output Style on `Write a script to clean up old log files` |
| :--- | :--- | :--- | :--- |
| **Standard (Default)** | Default / `Standard` | ~`1.5×–3×` | Adds target directory scope, mtime retention threshold, safe `--dry-run` default, and verification steps |
| **Intent-First** | `deep`, `intent-first`, `详细改写`, `意图优先` | ~`2×–4×` | Expands across 6 dimensions: Goal, Inputs & Context, Scope, Approach, Output Format, and Acceptance Criteria (e.g., archive vs. delete, structured summary log, safety guards, tests) |
| **Concise** | `concise`, `精简改写`, `简短改写` | ~`1×–1.5×` | Keeps phrasing tight while locking down core constraints (retention days, active-log exclusion, safe deletion) |

---

## Settings and Engines

Open **Extensions → Prompt Rewriter** in the left sidebar (`open_rewriter` `global` entrypoint) for the dedicated full Settings page. Preferences persist to `${PLUGIN_DATA}/settings.json`.

### Rewrite Engines

| Engine | ID | When to Use |
| :--- | :--- | :--- |
| **Antigravity Built-in Light Model** (Default) | `agy-cli` | Zero external keys; discovers models via `agy models` (default `gemini-3.8-flash-low`) and executes `agy -p` without using main-session quota |
| **External Custom API** | `external-api` | OpenAI-compatible (including local Ollama) or Google Gemini `:generateContent` endpoints with built-in connection test and `env:VAR_NAME` key support |
| **Current Session Model** | `host-session` | Zero-config direct rewrite using the active conversation model with full chat context, image, and `@` attachment awareness |

> **Smart Image & Attachment Routing**: `agy-cli` and `external-api` are text-only channels. When your prompt includes uploaded images or `@`-mentioned files/conversations, `/prompt-rewriter` automatically routes that turn to `host-session` so the active model can inspect the visuals and context directly before rendering the inline card (clicking `✨` inside the card afterward runs the configured independent engine on the text in the editor).

### Persisted Settings Reference

| Setting | Default | Description |
| :--- | :--- | :--- |
| `engine` | `"agy-cli"` | Active engine (`agy-cli` / `external-api` / `host-session`) |
| `agyModel` | `"gemini-3.8-flash-low"` | Model ID for `agy-cli` (refreshable from Settings) |
| `agyTimeoutSec` | `30` | CLI timeout in seconds (`5`–`120`) |
| `externalApi.format` | `"openai"` | Protocol: `openai` (`/chat/completions`) or `gemini` (`:generateContent`) |
| `externalApi.baseUrl` | `"https://api.openai.com/v1"` | Base URL (e.g., `http://localhost:11434/v1` for local Ollama) |
| `externalApi.model` | `"gpt-4o-mini"` | External model identifier |
| `externalApi.apiKey` | `""` | API key or `env:VAR_NAME` (leave blank for unauthenticated local endpoints) |
| `externalApi.timeoutSec` | `20` | HTTP timeout in seconds (`5`–`120`) |
| `defaultMode` | `"standard"` | Default rewrite mode (`standard` / `intent-first` / `concise`, with a collapsible comparison guide in Settings) |
| `language` | `"auto"` | Output language (`auto` / `zh-CN` / `en`) |
| `fallbackToHostOnError` | `true` | Auto-fallback to `host-session` in chat if an independent engine fails |
| `customRules` | `[]` | Up to `10` custom rules (`4000` chars max each) with create, edit, toggle, and delete controls |

---

## How It Works and Security

### Architecture

- **Skill Workflow ([skills/prompt-rewriter/SKILL.md](./skills/prompt-rewriter/SKILL.md))**: Enforces rewrite-only, zero-question constraints and orchestrates preference loading, image/attachment smart routing, and fallback handling.
- **Stdio MCP Server ([src/server/index.ts](./src/server/index.ts))**: Zero-dependency JSON-RPC server (NDJSON & `Content-Length` framing) exposing `show_rewriter_card`, `open_rewriter`, `get_rewriter_config`, and app-only (`visibility: ["app"]`) tools (`app_get_state`, `app_rewrite`, `app_save_settings`, `app_test_connection`).
- **Engines & Output Sanitization ([src/server/engines.ts](./src/server/engines.ts), [src/shared/prompt-rules.ts](./src/shared/prompt-rules.ts))**: Handles `agy` CLI execution, OpenAI/Gemini HTTP calls, system prompt compilation, and fence/question cleanup.
- **Surface-Split UI ([src/ui/app.ts](./src/ui/app.ts), [src/ui/styles.css](./src/ui/styles.css))**: Bundled into a single self-contained `dist/app.html` served at `ui://prompt-rewriter/app.html` (`data-surface="inline"`) and `ui://prompt-rewriter/settings.html` (`data-surface="global"`).

### Security & Privacy

- **Secrets stay out of model context**: API keys are stored solely in `${PLUGIN_DATA}/settings.json` (`0600` on POSIX). Model-visible tool outputs return masked keys only (e.g., `sk-****5678` or `env:VAR_NAME`).
- **Strict CSP & Redaction**: `dist/app.html` loads zero external scripts or styles; external API calls are made exclusively by the local Node.js server with `[REDACTED]` scrubbing on error messages.

---

## FAQ and Limitations

- **Why does `⚙` open a quick-switch popover instead of jumping to the left sidebar?**
  Antigravity's MCP App iframe host currently provides no API to programmatically focus a `global` sidebar extension tab from an inline card. The `⚙` popover lets you switch engine, model, and default mode immediately without leaving chat, while **Extensions → Prompt Rewriter** holds full settings like API keys and custom rules.
- **How are uploaded images or `@` attachments handled?**
  When detected on a `/prompt-rewriter` message, the skill routes rewriting directly to `host-session` so the current model can read the image/attachments. Independent engines (`agy-cli` / `external-api`) remain text-only.
- **What if `agy` CLI is not installed or missing from `PATH`?**
  Switch the engine to **External Custom API** or **Current Session Model** in Settings (or rely on automatic fallback when `fallbackToHostOnError` is enabled).
- **Can it run without the MCP Server?**
  Yes — in a plain skill-only setup, it falls back to outputting a clean fenced `markdown` prompt block.

---

## Development

```bash
npm install
npm run typecheck                  # Strict TypeScript check
npm run build                      # Build dist/mcp-server.mjs and single-file dist/app.html
npm test                           # Run MCP protocol, key-masking, and sanitizer tests
agy plugin validate --strict .     # Strict manifest, skill, and MCP config validation
```

---

## Acknowledgements & License

- Inspired by [huaguoxingkong/dsh-prompt-rewriter](https://github.com/huaguoxingkong/dsh-prompt-rewriter) (built for DeepSeek Harness).
- Licensed under the [MIT License](./LICENSE).
