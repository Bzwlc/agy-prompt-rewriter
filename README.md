# agy-prompt-rewriter

English · [简体中文](./README.zh-CN.md)

A lightweight, native prompt-rewriting plugin for **Google Antigravity** (`agy` CLI, Desktop 2.0, and IDE). It turns terse, rough drafts into clear, structured, execution-ready instructions — **rewrite only, never execute, and never ask follow-up questions**.

---

## Before & After

| Scenario | Rough Draft | Rewritten Prompt (Returned in Markdown Block for Review) |
| :--- | :--- | :--- |
| **Feature Work** | `Refactor the logging module to be cleaner and testable` | Clarifies **Goal** (decouple and simplify the logging module for unit testing), **Scope & Approach** (preserve existing public log levels/call sites, inject transport/formatter dependencies, avoid unrelated refactors), **Output Format** (list modified files and concise summary), and **Acceptance Criteria** (add/run unit tests, state assumptions for unspecified details). |
| **Ops Script** | `Write a script to clean up temp logs older than 30 days` | Clarifies **Goal**, **Safety Boundaries** (restrict to target temp dir and log extensions, skip symlinks, include `--dry-run` mode), **Output Format** (script + usage + schedule example), and **Acceptance Criteria** (safe verification steps). |

---

## Rewrite Modes

The `prompt-rewriter` skill selects a mode based on your wording (defaulting to **Standard**):

1. **Standard (Default)**: Balanced ~1.5x–3x expansion covering **Goal**, **Scope & Approach**, **Output Format**, and **Boundaries**.
2. **Intent-First / Deep**: Triggered by `deep`, `intent-first`, `详细改写`, or `意图优先`; covers all 6 dimensions (**Goal**, **Inputs & Context**, **Scope**, **Approach**, **Output Format**, **Acceptance Criteria**).
3. **Concise**: Triggered by `concise`, `精简改写`, or `简短改写`; fixes typos and ambiguity and tightens constraints without heavy expansion.

---

## Installation

### Global Install (Recommended)

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

### Via `agy` CLI

```bash
agy plugin install /path/to/agy-prompt-rewriter
agy plugin enable agy-prompt-rewriter
```

### Project-Scoped (Team Sharing)

Copy the repository into `.agents/plugins/agy-prompt-rewriter/` inside your project repository.

---

## Usage & Workflow Pairing

### 1. Rewrite Without Executing

```text
/prompt-rewriter Refactor the logging module to be cleaner and testable
```

Or in natural language:

```text
Enhance this prompt (deep): add CSV export to the orders table
```

After reviewing the output:
- Looks good → reply **`Execute this`** (or **`按这个执行`**)
- Needs tweaks → reply with adjustments (e.g. `Change output format to JSON and execute this`), or edit and resend

### 2. Pairing with Antigravity Built-ins & `agy-fast`

| Task Type | Recommended Flow | Why |
| :--- | :--- | :--- |
| Clear intent, terse draft, scripts | **`/prompt-rewriter`** → confirm & execute | Fills in structure, deliverables, and guardrails fast |
| Ambiguous requirements / trade-offs | **`/grill-me`** → **`/plan`** | Aligns key design choices interactively instead of guessing |
| Multi-file refactoring / large features | **`/plan`** + **`agy-fast`** (if installed) | Plan first, then execute with batched search/edits |
| Simple Q&A or trivial one-line edit | Ask directly | Skip unnecessary extra turns |

---

## Customization

Edit `skills/prompt-rewriter/SKILL.md` to add your personal defaults (preferred stack, OS/shell conventions, or test discipline). Because Antigravity loads skills progressively on demand, this plugin adds **zero background processes** and **no API key setup**.

---

## Inspiration

- Inspired by [huaguoxingkong/dsh-prompt-rewriter](https://github.com/huaguoxingkong/dsh-prompt-rewriter) (built for DeepSeek Harness).

## License

[MIT](./LICENSE)
