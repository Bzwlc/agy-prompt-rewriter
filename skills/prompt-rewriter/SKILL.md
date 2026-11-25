---
name: prompt-rewriter
description: >-
  Rewrites a rough, brief, or vague user prompt draft into a clear, structured,
  execution-ready prompt without executing the task or asking follow-up
  questions, and opens the interactive MCP App panel when available. Use when the
  user asks to rewrite, enhance, expand, or polish a prompt (e.g.
  "/prompt-rewriter ...", "帮我改写提示词", "增强一下这段需求",
  "先把我的需求整理成提示词", "rewrite/enhance/polish this prompt").
---

# Prompt Rewriter (Rewrite Only, Never Execute)

Transform the user's rough draft into a clear, structured, execution-ready
prompt while strictly preserving the user's original intent.

## Hard Constraints

1. **Rewrite only — NEVER execute**: Do NOT edit files, run shell commands,
   invoke implementation or search tools to carry out the underlying task, or
   answer the underlying request itself. Only output or display the rewritten
   prompt.
2. **No follow-up questions**: Output MUST contain zero follow-up questions to
   the user. Where minor details are unspecified, supply sensible, conservative
   defaults and explicitly instruct the executor to state its assumptions before
   or during execution.
3. **Preserve user specifics**: Keep all user-mentioned file paths, symbol
   names, tech stack choices, constraints, URLs, and attachment references
   verbatim. Never fabricate non-existent file paths, modules, or APIs.
4. **Match language**: Match the language preference returned by
   `get_rewriter_config`, or match the user's draft language when set to `auto`.
5. **Context-aware but bounded**: When rewriting in `host-session` mode, you
   may incorporate relevant decisions already confirmed in the current
   conversation without pasting raw chat transcripts.

## MCP App Workflow (v0.2.0)

Whenever the `agy-prompt-rewriter_rewriter` MCP server is available, follow
these steps in order:

1. **Read saved preferences**: Call `get_rewriter_config` (via `call_mcp_tool`
   on server `agy-prompt-rewriter_rewriter`, passing optional `mode` if the user
   explicitly requested `"detailed/详细改写/意图优先/deep"` -> `"intent-first"`,
   `"concise/精简改写/简短改写"` -> `"concise"`, or `"standard"`).
2. **Route by configured engine (with image/attachment smart routing)**:
   - **Image / attachment check first**: If the user's message includes uploaded images, files, or `@`-mentioned attachments/conversations relevant to the draft (and `settings.engine` is `"agy-cli"` or `"external-api"`, which are text-only), skip `autoRun` and proceed directly to Step 3 with `fallbackNote` set to `"检测到图片/附件，已自动使用当前会话模型直接改写"` (or `"Images/attachments detected; rewritten directly by the current session model."` when outputting English).
   - **If `settings.engine` is `"agy-cli"` or `"external-api"`** (and no image/attachment is present):
     Call `show_rewriter_card` with:
     `{ "originalPrompt": "<exact user draft>", "mode": "<resolvedMode>", "autoRun": true }`
     - If it succeeds, the interactive editable/undoable/sendable MCP App card
       renders **inline directly beneath your reply**. Reply concisely in one
       sentence telling the user they can edit directly in the inline card
       below, undo (`↩`), copy (`📋`), or send (`➤`) to execute. Do NOT
       duplicate a second copy in prose unless the card failed to render.
     - If `show_rewriter_card` returns `isError: true`:
       - If `settings.fallbackToHostOnError` is `true`, proceed to Step 3 with
         `fallbackNote` summarizing the error briefly.
       - Otherwise report the error and stop without consuming host rewrite
         turns.
   - **If `settings.engine` is `"host-session"`** (or smart-routed / fallback triggered):
     Proceed to Step 3.
3. **Host-session rewrite & show inline card**:
   - Rewrite the draft directly with the current session model strictly following
     `compiledSystemPrompt` from Step 1. Incorporate any uploaded images,
     `@`-mentioned files/conversations, or confirmed chat context while
     preserving file paths and attachment references verbatim.
   - Call `show_rewriter_card` with:
     `{ "originalPrompt": "<exact user draft>", "rewrittenPrompt": "<your rewritten text>", "mode": "<resolvedMode>", "engineUsed": "host-session", "fallbackNote": "<optional>" }`
   - Reply concisely in one sentence letting the user review, edit, undo, copy,
     or send directly from the inline card below.

## Fallback When MCP Is Unavailable

If `agy-prompt-rewriter_rewriter` is not connected (for example in a plain
skill-only environment):

- Select mode from user wording (`standard` default, `intent-first` for
  `详细改写`/`意图优先`/`deep`, `concise` for `精简改写`/`简短改写`/`concise`).
- Output **only** the rewritten prompt inside a clean markdown fenced block
  (`` ```markdown ``), followed by one short footer line:
  - Chinese: `> 如满意，可直接回复「按这个执行」，或修改后发送。`
  - English: `> Reply "Execute this" to proceed as written, or edit and send.`
