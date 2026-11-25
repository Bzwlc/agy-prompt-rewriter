# agy-prompt-rewriter

[English](./README.md) · 简体中文

面向 **Google Antigravity**（CLI `agy`、Desktop 2.0、IDE）的轻量提示词改写插件：把口语化、没头没尾的一句话草稿，整理成目标清晰、格式明确、边界完整的**可执行提示词**——**只改写、不执行、不反问**。

---

## 改写前后对比

| 维度 | 原始草稿 | 改写后输出（放入 Markdown 块供审阅/复用） |
| :--- | :--- | :--- |
| **功能开发** | `帮我给项目加个导出 Excel 的功能` | 明确**目标**（在现有项目中新增 Excel 导出能力）、**范围与方法**（沿用当前项目技术栈与数据结构，明确导出触发入口与字段映射，不改动无关模块）、**输出格式**（生成标准 `.xlsx` 文件，处理空数据与超长字段等边界，列出改动文件）与**验收标准**（补充/运行相关类型检查或测试，对未指定的字段或库选择需先声明假设）。 |
| **运维脚本** | `写一个脚本定期清理超过 30 天的临时日志文件` | 明确**目标**（编写定时清理过期临时日志的脚本）、**安全边界**（仅清理指定临时目录中匹配日志后缀且修改时间超过 30 天的文件，默认提供 `--dry-run` 预演模式，不跟随软链接且不误删其它文件）、**输出格式**（附带使用说明与计划任务/cron 配置示例）与**验收标准**（给出在测试目录的验证方式）。 |

---

## 三种改写模式

插件会根据你的触发用词自动选择改写粒度，也可在提示中指定：

1. **标准模式（默认）**：按约 `1.5×–3×` 扩展，补齐**目标、范围与方法、输出格式、边界条件**。
2. **详细 / 意图优先模式**：触发词包含 `详细改写`、`意图优先` 或 `deep` 时启用，完整覆盖**目标、上下文与输入、范围、方法、输出格式、验收标准**六大维度。
3. **精简模式**：触发词包含 `精简改写`、`简短改写` 或 `concise` 时启用，仅消除歧义、修正错别字并收紧约束，不做大幅扩写。

---

## 安装方式

### 方式一：全局安装（推荐，所有项目通用）

```bash
# macOS / Linux
git clone https://github.com/Bzwlc/agy-prompt-rewriter.git ~/.gemini/config/plugins/agy-prompt-rewriter
agy plugin enable agy-prompt-rewriter
```

```powershell
# Windows (PowerShell)
git clone https://github.com/Bzwlc/agy-prompt-rewriter.git "$env:USERPROFILE\.gemini\config\plugins\agy-prompt-rewriter"
agy plugin enable agy-prompt-rewriter
```

### 方式二：使用 `agy` CLI 安装

```bash
agy plugin install /path/to/agy-prompt-rewriter
agy plugin enable agy-prompt-rewriter
```

### 方式三：按项目安装（团队仓库共享）

将本目录复制到目标仓库的 `.agents/plugins/agy-prompt-rewriter/` 下即可随仓库分发。

---

## 日常使用与工作流配合

### 1. 触发改写（只改写，不直接动手）

```text
/prompt-rewriter 帮我给项目加个导出 Excel 的功能
```

或使用自然语言：

```text
帮我改写提示词（详细改写）：把日志模块重构得干净一点
```

审阅输出后：
- 直接满意 → 回复 **`按这个执行`**
- 需要调整 → 回复 **`把输出格式改成 CSV，其它按这个执行`**，或复制修改后再发送

### 2. 与 Antigravity 原生命令、`agy-fast` 搭配

| 场景 | 推荐组合 | 原因 |
| :--- | :--- | :--- |
| 意图清晰、懒得写长需求 / 通用脚本 | **`/prompt-rewriter`** → 确认后执行 | 快速补全目标、格式、边界，避免 AI 猜偏 |
| 需求本身模糊、有多种方案取舍 | **`/grill-me`** → **`/plan`** | 先通过多轮问答对齐需求，避免替你盲目假设 |
| 多文件重构、大型项目特性开发 | **`/plan`** + **`agy-fast`**（如已安装） | 先出计划审阅，执行阶段由 `agy-fast` 批量检索/编辑加速 |
| 单行问答或极简单明确的小改 | 直接提问，无需调用本插件 | 避免不必要的额外轮次 |

---

## 自定义偏好

你可以直接编辑 `skills/prompt-rewriter/SKILL.md`，在其中加入你的个人工程偏好（例如默认技术栈、Windows PowerShell、代码规范或固定输出语言）。本插件仅包含静态 Skill 说明，**零常驻进程、零额外 API Key**，按需渐进加载，几乎不占用日常上下文。

---

## 致谢与灵感来源

- Inspired by [huaguoxingkong/dsh-prompt-rewriter](https://github.com/huaguoxingkong/dsh-prompt-rewriter) (built for DeepSeek Harness).

## 开源协议

[MIT](./LICENSE)
