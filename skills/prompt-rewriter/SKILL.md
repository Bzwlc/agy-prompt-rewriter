---
name: prompt-rewriter
description: >-
  Rewrites a rough, brief, or vague user prompt draft into a clear, structured,
  execution-ready prompt without executing the task or asking follow-up
  questions. Use when the user asks to rewrite, enhance, expand, or polish a
  prompt (e.g. "/prompt-rewriter ...", "帮我改写提示词", "增强一下这段需求",
  "先把我的需求整理成提示词", "rewrite/enhance/polish this prompt").
---

# Prompt Rewriter (Rewrite Only, Never Execute)

Transform the user's rough draft into a clear, structured, execution-ready
prompt while strictly preserving the user's original intent.

## Hard Constraints

1. **Rewrite only — NEVER execute**: Do NOT edit files, run shell commands,
   invoke implementation or search tools to carry out the underlying task, or
   answer the underlying request itself. Only output the rewritten prompt.
2. **No follow-up questions**: Output MUST contain zero follow-up questions to
   the user. Where minor details are unspecified, supply sensible, conservative
   defaults and explicitly instruct the executor to state its assumptions before
   or during execution.
3. **Preserve user specifics**: Keep all user-mentioned file paths, symbol
   names, tech stack choices, constraints, URLs, and attachment references
   verbatim. Never fabricate non-existent file paths, modules, or APIs.
4. **Match language**: Write the rewritten prompt in the same language as the
   user's draft (default to Simplified Chinese for Chinese drafts, English for
   English drafts).
5. **Context-aware but bounded**: You may incorporate relevant decisions already
   confirmed in the current conversation so the rewritten prompt fits the
   ongoing session, without pasting raw chat transcripts.

## Rewrite Modes (Auto-Selected from User Wording)

Select the mode based on the user's phrasing; default to **Standard**:

- **Standard (Default)**: Balanced ~1.5x–3x expansion covering **Goal**,
  **Scope & Approach**, **Output Format**, and **Boundaries**.
- **Intent-First / Deep** (when the user asks for `"详细改写"`, `"意图优先"`,
  `"deep"`, or explicitly requests a full specification for a sparse draft):
  Infer the user's underlying intent and cover all 6 dimensions — **Goal**,
  **Inputs & Context**, **Scope**, **Approach**, **Output Format**, and
  **Acceptance Criteria** (~2x–4x expansion; avoid padding simple tasks into
  essays).
- **Concise** (when the user asks for `"精简改写"`, `"简短改写"`, `"concise"`):
  Fix typos, remove ambiguity, and tighten constraints while keeping the prompt
  compact.

## Enhancement Dimensions (Include Only What Fits the Task)

1. **目标（Goal）**: Restate the core objective concretely and unambiguously.
2. **上下文与输入（Context / Inputs）**: Reference relevant conversation
   decisions or user-provided files/constraints concisely (never invent unseen
   code).
3. **范围与方法（Scope & Approach）**: Clarify what to include, what not to
   touch, and sensible implementation or writing steps.
4. **输出格式（Output Format）**: Specify expected deliverables (e.g., code
   changes, summary, Markdown table, verification output).
5. **边界与验收标准（Boundaries & Acceptance Criteria）**: Add safety and
   quality guardrails (e.g., preserve existing behavior, handle edge cases, run
   relevant checks/tests, state assumptions).

## Output Format

Output **only** the rewritten prompt inside a clean markdown fenced block
(`` ```markdown ``) or blockquote so the user can review, copy, or tweak it
immediately, followed by a single short footer line in the user's language:

- For Chinese drafts:
  `> 如满意，可直接回复「按这个执行」，或修改后发送。`
- For English drafts:
  `> Reply "Execute this" to proceed as written, or edit and send.`
