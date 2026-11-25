# agy-prompt-rewriter

[English](./README.md) · 简体中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Google Antigravity](https://img.shields.io/badge/Google%20Antigravity-MCP%20App%20%2B%20Skill-4f46e5.svg)](https://antigravity.google)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933.svg)](https://nodejs.org/)
[![Zero Runtime Deps](https://img.shields.io/badge/Runtime%20Deps-Zero-0284c7.svg)](./package.json)

把对话里那句口语化、没头没尾的需求草稿，变成目标清晰、格式明确、边界完整的**可执行提示词**。**只改写，不执行、不反问**；结果直接落进对话内联可编辑卡片，想微调随时改，不满意一键退回原草稿。

- **对话内联卡片 + 极简纯图标工具栏**：发送 `/prompt-rewriter` 后直接在回复下方渲染编辑器，支持原地微调、退回草稿（`↩`）、重跑（`✨`）、复制（`📋`）与一键发送执行（`➤`）。
- **三引擎自由路由 + 快捷切换**：默认用本机 `agy` 轻量模型改写不占主模型额度；也支持外接 OpenAI / Gemini / Ollama API，或直接使用当前会话模型（带图 / `@` 附件自动智能路由）。
- **开箱即用，零运行期依赖**：仓库已提交预构建产物 `dist/mcp-server.mjs` 与单文件 `dist/app.html`，克隆即可启用，无需安装任何第三方运行时依赖。

```text
请帮我安装并启用 Google Antigravity 插件 agy-prompt-rewriter：
1. 将 https://github.com/Bzwlc/agy-prompt-rewriter.git 克隆到本机全局插件目录（macOS/Linux 为 ~/.gemini/config/plugins/agy-prompt-rewriter，Windows 为 %USERPROFILE%\.gemini\config\plugins\agy-prompt-rewriter）；
2. 执行 `agy plugin enable agy-prompt-rewriter` 启用插件；
3. 运行 `agy plugin validate --strict` 校验安装结果并向我汇报状态。
```

**目录**：[30 秒上手](#30-秒上手) · [适合谁与不适合谁](#适合谁与不适合谁) · [这是什么](#这是什么) · [用法](#用法) · [设置与三引擎路由](#设置与三引擎路由) · [工作原理与隐私安全](#工作原理与隐私安全) · [常见问题与已知限制](#常见问题与已知限制) · [本地开发](#本地开发)

---

## 30 秒上手

前提环境：**Google Antigravity**（`agy` CLI、Desktop 2.0 或 IDE）以及 **Node.js >= 20**。

### 方式一：让 AI 助手自动安装（推荐）

直接复制下面整段指令发给你的 Antigravity 或任意 AI 编程助手即可完成安装、启用与校验：

```text
请帮我安装并启用 Google Antigravity 插件 agy-prompt-rewriter：
1. 将仓库 https://github.com/Bzwlc/agy-prompt-rewriter.git 克隆到 Antigravity 全局插件目录：
   - macOS / Linux：`~/.gemini/config/plugins/agy-prompt-rewriter`
   - Windows：`%USERPROFILE%\.gemini\config\plugins\agy-prompt-rewriter`
   （若目录已存在，先确认是否为同一仓库并执行 `git pull --ff-only` 更新）
2. 运行 `agy plugin enable agy-prompt-rewriter` 启用插件。
3. 运行 `agy plugin validate --strict <插件目录>` 验证配置与产物完整性。
4. 完成后告诉我安装路径、验证结果以及接下来如何用 `/prompt-rewriter` 测试。
```

### 方式二：终端手动全局安装（所有项目通用）

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

> 仓库已附带预构建产物 `dist/mcp-server.mjs` 与 `dist/app.html`，终端用户安装时**无需执行 `npm install`**。

### 其他安装方式

- **通过 `agy` CLI 从本地目录安装**：
  ```bash
  agy plugin install /path/to/agy-prompt-rewriter
  agy plugin enable agy-prompt-rewriter
  ```
- **按项目安装（团队仓库共享）**：将本仓库目录复制到目标项目的 `.agents/plugins/agy-prompt-rewriter/` 下即可随仓库分发。

### 装好后试一次

1. 在 Antigravity 对话中发送：`/prompt-rewriter 给接口加个限流，别被刷挂了`
2. 回复下方会直接出现可编辑的内联卡片；按需微调后点右下角 `➤` 即可发送到当前对话执行。
3. 如需配置外接 API Key、自定义规则或查看三种模式说明，可在左侧控制栏打开 **扩展插件 → Prompt Rewriter**。

---

## 适合谁与不适合谁

**适合**

- 经常只有一两句模糊想法、直接丢给 AI 容易被反问或跑偏的开发者。
- 希望把提示词补全目标、输入输出和边界验收，但又不愿高阶主模型为“润色一句话”白白消耗上下文与额度的人。
- 需要改写结果可控——能当场手动改字句、能一键退回原草稿、还能把常用工程约束沉淀成自定义规则的人。

**不适合**

- 想在触发改写时就顺便把代码改完、把命令跑完的人——本插件严格遵守**只改写、不执行**。
- 期望 AI 通过多轮追问慢慢套需求的人——它**零反问**，缺省细节会要求后续执行者采用保守默认并显式声明假设。

---

## 这是什么

一句话草稿通常缺三样东西：**目标、输出格式、边界与验收条件**。直接发送给主模型，模型要么靠猜导致返工，要么先反问你一串问题。`agy-prompt-rewriter` 在真正动手执行前，先把草稿整理成“可一次执行”的清晰指令。

**你输入的草稿**

> `/prompt-rewriter 给接口加个限流，别被刷挂了`

**卡片里生成的改写结果（标准模式示例）**

> 目标：为现有 HTTP 服务的核心 API 接口接入请求限流保护，防止高频突发流量导致服务过载。
>
> 范围与方法：
> 1. 先定位当前路由注册与中间件挂载位置，在尽量不破坏现有接口签名的前提下新增限流中间件；
> 2. 优先复用项目既有技术栈或轻量令牌桶 / 滑动窗口方案（若支持多实例可预留存储扩展口，单实例默认内存计数）；
> 3. 对触发限流的请求统一返回 HTTP `429 Too Many Requests` 及清晰的 JSON 错误提示，并附带 `Retry-After` 响应头。
>
> 边界与验收：
> - 仅修改必要文件，保持静态资源或健康检查等明确免限流路径不受影响（未指明的阈值、时间窗口及白名单策略请采用保守默认值并在结果中简要说明假设）；
> - 补充或运行自动化测试/本地验证，确认正常请求放行、超限请求正确拦截并返回 `429`。

- **改完还能自己改**：结果就在内联卡片的文本框里，删改几行、补充具体路径后再发送执行。
- **不会夹带反问**：即使模型偶尔输出了末尾追问句或外层代码块包裹，服务端清理逻辑（`sanitizeRewrittenOutput`）也会自动剥离，避免破坏执行流。

---

## 用法

### 1. 在对话中触发改写

以下任意方式均可触发（优先走 MCP App 内联卡片；未连接 MCP 时自动降级为纯文本代码块输出）：

- 斜杠命令：`/prompt-rewriter <你的草稿>`
- 自然语言触发：`帮我改写提示词：...`、`增强一下这段需求：...`、`详细改写 ...`、`精简改写 ...`

### 2. 使用内联卡片（`show_rewriter_card`）

卡片**只承载改写工作区**，界面保持紧凑专注：

| 区域 | 控件 | 说明 |
| :--- | :--- | :--- |
| 顶部栏 | 模式 / 自定义规则下拉框 | 快速切换 `标准`、`意图优先`、`精简` 或已启用的自定义规则 |
| 顶部栏 | 引擎徽标 | 显示当前生效引擎（如 `⚡ gemini-3.8-flash-low`、`🌐 gpt-4o-mini`、`💬 当前会话模型`） |
| 顶部栏 | `⚙` 快捷切换按钮 | 原位弹出轻量浮层，随时切换 **改写引擎**、**自带轻量模型** 与 **默认模式**，点击空白处或按 `Esc` 收起 |
| 编辑区 | 自适应多行文本框 | 直接微调改写后的提示词，或编辑原始草稿 |
| 底部栏 | `↩` / `↪` 退回与恢复 | 一键退回初始草稿；退回后图标变为 `↪`，再次点击可恢复改写结果 |
| 底部栏 | `✨` 重新改写 | 按当前文本框内容与所选模式/规则原地重新改写；运行中再点一次可取消等待 |
| 底部栏 | `📋` 复制提示词 | 复制当前文本框内容，成功后图标短暂变为 `✓` |
| 底部栏 | `➤` 发送到当前对话执行 | 通过 MCP App `sendMessage` 直接把最终提示词发进当前对话开始执行 |

### 3. 三种改写模式效果对比（以「写个脚本清理过期日志」为例）

| 模式 | 触发方式 | 典型扩展幅度 | 效果特点（对 `写个脚本清理过期日志` 的处理差异） |
| :--- | :--- | :--- | :--- |
| **标准（默认）** | 默认 / 下拉选「标准」 | 约 `1.5×–3×` | 明确扫描目录、按修改时间判定阈值、默认先支持 `--dry-run` 预览与保留策略，并要求验证清理结果 |
| **意图优先** | `详细改写`、`意图优先`、`deep` | 约 `2×–4×` | 按目标、输入与上下文、范围与实现方法、输出格式、边界与验收标准六维展开（如归档压缩 vs 删除、日志分级输出、误删防护与测试验证） |
| **精简** | `精简改写`、`简短改写`、`concise` | 约 `1×–1.5×` | 保持紧凑篇幅，只收紧「过期天数阈值、安全删除保护、禁止误删当前写入中的日志」等核心约束 |

---

## 设置与三引擎路由

在 Antigravity 左侧控制栏点击 **扩展插件 → Prompt Rewriter**（`open_rewriter` 全局入口），即可打开独立的完整设置页。所有配置自动持久化到 `${PLUGIN_DATA}/settings.json`。

### 改写引擎

| 引擎 | 标识 | 适用场景与特点 |
| :--- | :--- | :--- |
| **Antigravity 自带轻量模型**（默认） | `agy-cli` | 免外部 API Key，通过 `agy models` 自动枚举可用模型（默认 `gemini-3.8-flash-low`），调用 `agy -p` 独立完成纯文本改写，不消耗当前主会话额度 |
| **外接自定义 API** | `external-api` | 支持 OpenAI 兼容接口（含本地 Ollama）与 Google Gemini 原生 `:generateContent` 接口；支持「测试连接」与明文/`env:变量名` 凭据 |
| **当前会话模型** | `host-session` | 零配置，直接由当前 Antigravity 对话模型改写，可结合当前会话历史、上传图片与 `@` 附件 |

> **图片与附件智能路由**：`agy-cli` 与 `external-api` 属于纯文本独立改写通道。当你在对话里上传了图片，或用 `@` 引用了文件/历史对话并触发 `/prompt-rewriter` 时，即使当前配置为独立引擎，插件也会自动路由到 `host-session` 直接看图/读上下文改写，并在卡片状态栏给出提示（若之后在卡片内点击 `✨` 重新改写，则会按纯文本框内容调用当前配置的独立引擎）。

### 完整配置项一览

| 设置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `engine` | `"agy-cli"` | 改写引擎：`agy-cli` / `external-api` / `host-session` |
| `agyModel` | `"gemini-3.8-flash-low"` | `agy-cli` 使用的模型 ID（支持界面内一键刷新列表） |
| `agyTimeoutSec` | `30` | `agy-cli` 执行超时秒数（`5`–`120` 秒） |
| `externalApi.format` | `"openai"` | 接口协议：`openai`（`/chat/completions`）或 `gemini`（`:generateContent`） |
| `externalApi.baseUrl` | `"https://api.openai.com/v1"` | 外接 API 基础地址（如本地 Ollama 可填 `http://localhost:11434/v1`） |
| `externalApi.model` | `"gpt-4o-mini"` | 外接 API 模型名称 |
| `externalApi.apiKey` | `""` | API Key 明文或 `env:变量名`（本地免鉴权服务可留空） |
| `externalApi.timeoutSec` | `20` | 外接 API 请求超时秒数（`5`–`120` 秒） |
| `defaultMode` | `"standard"` | 默认改写模式：`standard` / `intent-first` / `concise`（设置页内置可展开的三种模式对比卡片） |
| `language` | `"auto"` | 输出语言：`auto`（跟随草稿）/ `zh-CN` / `en` |
| `fallbackToHostOnError` | `true` | 独立引擎失败时是否自动回退到当前会话模型（仅对话内生效） |
| `customRules` | `[]` | 自定义规则列表：最多 `10` 条，单条正文上限 `4000` 字，支持新增、编辑、启停与删除 |

---

## 工作原理与隐私安全

### 模块组成

- **Skill 工作流（[skills/prompt-rewriter/SKILL.md](./skills/prompt-rewriter/SKILL.md)）**：约束「只改写不执行、零反问、保留用户路径与附件引用」，并负责偏好读取、图片/附件智能路由与失败回退。
- **Stdio MCP Server（[src/server/index.ts](./src/server/index.ts)）**：零依赖 JSON-RPC（支持 NDJSON 与 `Content-Length` 帧），对外暴露 `show_rewriter_card`、`open_rewriter`、`get_rewriter_config`，以及仅限 App UI 内部调用（`visibility: ["app"]`）的 `app_get_state`、`app_rewrite`、`app_save_settings`、`app_test_connection`。
- **独立引擎与规则清理（[src/server/engines.ts](./src/server/engines.ts)、[src/shared/prompt-rules.ts](./src/shared/prompt-rules.ts)）**：封装 `agy` CLI 探测/调用、OpenAI/Gemini HTTP 请求、模式与自定义规则系统提示词拼装，以及输出清理。
- **双视图隔离前端（[src/ui/app.ts](./src/ui/app.ts)、[src/ui/styles.css](./src/ui/styles.css)）**：打包为单文件 `dist/app.html`，通过 `ui://prompt-rewriter/app.html`（`data-surface="inline"`）与 `ui://prompt-rewriter/settings.html`（`data-surface="global"`）分别渲染对话内联卡片和左侧边栏设置页，互不混杂。

### 隐私与安全设计

- **API Key 永不进入模型上下文**：密钥仅持久化在本机 `${PLUGIN_DATA}/settings.json`（POSIX 下权限 `0600`）；所有模型可见响应（如 `get_rewriter_config`、`open_rewriter`）仅返回掩码（如 `sk-****5678`）或 `env:变量名`。
- **严格 CSP 与零外链依赖**：`dist/app.html` 为纯自包含 HTML，不加载任何外部脚本或样式；所有外接模型请求均由本地 Node.js MCP Server 发起，错误日志自动对密钥做 `[REDACTED]` 脱敏。

---

## 常见问题与已知限制

- **为什么点击卡片右上角的 `⚙` 弹出「快捷切换」，而不是直接跳转到左侧边栏？**
  Antigravity 的 MCP App 运行在隔离 iframe 沙箱中，目前宿主尚未提供从内联卡片编程式切换左侧栏「扩展插件」标签页的 API。因此 `⚙` 设计为原地轻量弹窗（改引擎/模型/模式），完整设置（API Key、自定义规则等）可在左侧栏「扩展插件 → Prompt Rewriter」打开。
- **传了截图或 `@` 文件后，为什么状态栏提示已使用当前会话模型？**
  `agy-cli` 与 `external-api` 通道当前仅发送文本草稿，为避免丢失图片和上下文信息，Skill 检测到上传图片或 `@` 附件时会自动路由给当前会话模型直接处理。
- **提示未检测到本机 `agy` CLI 怎么办？**
  若当前环境未安装或未把 `agy` 加入 `PATH`，可在设置中将引擎切换为「外接自定义 API」或「当前会话模型」；若开启了自动回退，对话内遇到 CLI 异常时也会自动平滑回退。
- **它会直接改代码或反问我吗？**
  不会。Skill 与系统提示词均强约束禁止执行任务与提问；若模型输出意外附带追问句，也会在输出清理阶段被移除。
- **未连接 MCP Server 时还能用吗？**
  可以。在仅加载 Skill 的环境下，会自动回退为输出整洁的 Markdown 改写代码块与一句确认提示。

---

## 本地开发

```bash
npm install
npm run typecheck                  # TypeScript 严格类型检查
npm run build                      # 构建 dist/mcp-server.mjs 与单文件 dist/app.html
npm test                           # 运行 MCP 协议、密钥掩码与输出清理单元测试
agy plugin validate --strict .     # 严格校验插件清单、Skill 与 MCP 配置
```

---

## 致谢与开源协议

- Inspired by [huaguoxingkong/dsh-prompt-rewriter](https://github.com/huaguoxingkong/dsh-prompt-rewriter) (built for DeepSeek Harness).
- 本项目采用 [MIT License](./LICENSE) 开源。
