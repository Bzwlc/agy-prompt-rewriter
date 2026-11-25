import type { CustomRule, OutputLanguage, RewriteMode } from "./types.js";

function languageDirective(language: OutputLanguage): string {
  if (language === "zh-CN") {
    return "Write the rewritten prompt in Simplified Chinese regardless of minor foreign terms.";
  }
  if (language === "en") {
    return "Write the rewritten prompt in clear, natural English.";
  }
  return "Write the rewritten prompt in the same primary language as the user's draft (Simplified Chinese for Chinese drafts, English for English drafts).";
}

function modeInstructions(mode: RewriteMode): string {
  if (mode === "concise") {
    return [
      "Mode: CONCISE.",
      "- Fix typos, remove ambiguity, and tighten scope/boundaries while keeping the prompt compact (~1x to 1.5x original length).",
      "- Keep only essential constraints; do not pad into multi-section prose.",
    ].join("\n");
  }
  if (mode === "intent-first") {
    return [
      "Mode: INTENT-FIRST (DEEP).",
      "- Infer the user's underlying engineering or writing intent and expand into a thorough, structured execution prompt (~2x to 4x original length; avoid pointless fluff).",
      "- Cover relevant dimensions clearly: Goal, Inputs & Context, Scope & Approach, Output Format, and Boundaries & Acceptance Criteria.",
      "- Where minor implementation choices are unspecified, instruct the executor to adopt sensible defaults and state its assumptions.",
    ].join("\n");
  }
  return [
    "Mode: STANDARD.",
    "- Expand the rough draft into a balanced, execution-ready prompt (~1.5x to 3x original length).",
    "- Clarify Goal, Scope & Approach, Output Format, and key Boundaries/Verification expectations without over-engineering.",
    "- For minor unspecified details, tell the executor to pick conservative defaults and state assumptions briefly.",
  ].join("\n");
}

/**
 * Compile the system prompt used to rewrite a user's rough draft.
 */
export function buildRewriteSystemPrompt(
  mode: RewriteMode,
  language: OutputLanguage,
  customRule?: CustomRule | null,
): string {
  const parts = [
    "You are a prompt rewriter for an AI coding & productivity assistant.",
    "Rewrite the user's rough draft into a clear, actionable, execution-ready prompt while preserving the user's exact intent.",
    "",
    "Hard rules:",
    "1. REWRITE ONLY — NEVER answer the user's request, write code to fulfill it, or pretend to execute tools.",
    "2. ZERO FOLLOW-UP QUESTIONS — Do not include any questions asking the user for clarification.",
    "3. PRESERVE SPECIFICS — Keep all user-mentioned file paths, symbol names, libraries, URLs, and constraints verbatim. Never invent unseen file paths or APIs.",
    `4. LANGUAGE — ${languageDirective(language)}`,
    "5. OUTPUT FORMAT — Return ONLY the rewritten prompt text directly. Do NOT wrap the output in triple backticks, quotes, or meta-commentary.",
    "",
    modeInstructions(mode),
  ];

  if (customRule && customRule.enabled && customRule.content.trim()) {
    parts.push(
      "",
      `Custom Rule ("${customRule.name}"):`,
      customRule.content.trim(),
    );
  }

  return parts.join("\n");
}

/**
 * Clean model output by removing outer code fences, meta prefixes, and stray
 * follow-up questions while preserving legitimate rewritten content.
 */
export function sanitizeRewrittenOutput(rawText: string, originalDraft: string): string {
  let text = String(rawText ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    return originalDraft;
  }

  // Strip a single wrapping markdown code fence if the model emitted one.
  const fenceMatch = /^```(?:markdown|md|text|prompt)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Strip common meta-commentary prefixes on the first line.
  text = text.replace(/^(?:以下是改写后的提示词|改写后的提示词|Rewritten prompt)\s*[:：]\s*\n?/i, "").trim();

  // Drop trailing clarification questions if the model slipped any in.
  const lines = text.split("\n");
  while (lines.length > 1) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    const looksLikeFollowupQuestion =
      /[?？]\s*$/.test(last) &&
      /^(?:请问|能否|是否|你需要|你希望|方便|可以告诉|would you|could you|do you want|which|what|should i)/i.test(last);
    if (looksLikeFollowupQuestion) {
      lines.pop();
      continue;
    }
    break;
  }

  const cleaned = lines.join("\n").trim();
  if (!cleaned) {
    return originalDraft;
  }

  // If the entire output is just a single question to the user, fall back safely.
  if (!cleaned.includes("\n") && /[?？]\s*$/.test(cleaned) && !/[?？]\s*$/.test(originalDraft.trim())) {
    return originalDraft;
  }

  return cleaned;
}
