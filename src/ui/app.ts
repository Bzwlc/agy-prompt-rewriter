import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type {
  AgyCliStatus,
  AgyModelInfo,
  CustomRule,
  EngineType,
  ExternalApiFormat,
  OutputLanguage,
  PublicSettings,
  RewriteMode,
  RewriterPanelState,
  SettingsPatch,
} from "../shared/types.js";

const SVG_UNDO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;
const SVG_REDO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/></svg>`;
const SVG_SPARKLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`;
const SVG_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const SVG_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const SVG_SEND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>`;
const SVG_GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

type AppSurface = "inline" | "global";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: Array<Node | string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v);
    }
  }
  if (children) {
    for (const child of children) {
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
  }
  return node;
}

function showStatus(target: HTMLElement | null, text: string, kind: "normal" | "info" | "error" = "normal") {
  if (!target) return;
  if (!text) {
    target.setAttribute("hidden", "");
    target.textContent = "";
    target.className = "status-strip";
    return;
  }
  target.removeAttribute("hidden");
  target.textContent = text;
  target.className = kind === "normal" ? "status-strip" : `status-strip ${kind}`;
}

function populateAgyModelSelect(selectEl: HTMLSelectElement, models: AgyModelInfo[], selectedModel: string) {
  selectEl.innerHTML = "";
  if (models.length === 0) {
    selectEl.append(el("option", { value: selectedModel }, [selectedModel]));
  } else {
    let found = false;
    for (const m of models) {
      if (m.id === selectedModel) found = true;
      const suffix = m.recommended ? " ★推荐" : "";
      selectEl.append(el("option", { value: m.id }, [`${m.label}${suffix}`]));
    }
    if (!found) {
      selectEl.append(el("option", { value: selectedModel }, [selectedModel]));
    }
  }
  selectEl.value = selectedModel;
}

interface UiState {
  surface: AppSurface;
  lockedSurface: AppSurface | null;
  canSendMessage: boolean;
  hasToolResult: boolean;
  originalDraft: string;
  lastRewritten: string;
  showingOriginal: boolean;
  isRewriting: boolean;
  rewriteNonce: number;
  settings: PublicSettings | null;
  agyCli: AgyCliStatus | null;
  editingRuleId: string | null;
}

const rawDatasetSurface = document.body.dataset.surface;
const lockedSurface: AppSurface | null =
  rawDatasetSurface === "global" || rawDatasetSurface === "inline" ? rawDatasetSurface : null;

const state: UiState = {
  surface: lockedSurface ?? "inline",
  lockedSurface,
  canSendMessage: false,
  hasToolResult: false,
  originalDraft: "",
  lastRewritten: "",
  showingOriginal: false,
  isRewriting: false,
  rewriteNonce: 0,
  settings: null,
  agyCli: null,
  editingRuleId: null,
};

const app = new App({ name: "Prompt Rewriter", version: "0.2.0" }, {});

document.body.innerHTML = "";
const root = el("div", { class: "app-shell" });
document.body.append(root);

interface SurfaceController {
  render(): void;
  updateCapabilities(): void;
  applyPanelState(panelState: RewriterPanelState): void;
  showPanelError(message: string): void;
  handleToolInput(args: { originalPrompt?: string; autoRun?: boolean }): void;
}

let activeController: SurfaceController | null = null;
let statusFlashTimer: ReturnType<typeof setTimeout> | null = null;

function flashStatus(target: HTMLElement | null, text: string, kind: "info" | "error" = "info", durationMs = 1800) {
  showStatus(target, text, kind);
  if (statusFlashTimer) {
    clearTimeout(statusFlashTimer);
  }
  if (text && durationMs > 0) {
    statusFlashTimer = setTimeout(() => {
      showStatus(target, "");
    }, durationMs);
  }
}

async function savePatch(
  patch: SettingsPatch,
  noticeTarget: HTMLElement | null = null,
  noticeText = "设置已保存",
) {
  try {
    const res = await app.callServerTool({
      name: "app_save_settings",
      arguments: { settings: patch },
    });
    if (res.structuredContent) {
      applyPanelPayload(res.structuredContent);
    }
    if (noticeTarget) {
      flashStatus(noticeTarget, noticeText, "info");
    }
  } catch (err) {
    showStatus(noticeTarget, err instanceof Error ? err.message : String(err), "error");
  }
}

function applyPanelPayload(data: unknown, source: "toolresult" | "rewrite" | "state" = "state") {
  if (!data || typeof data !== "object") return;
  if (source === "toolresult") {
    state.hasToolResult = true;
  }
  const obj = data as {
    panelState?: RewriterPanelState;
    settings?: PublicSettings;
    agyCli?: AgyCliStatus;
  };
  if (obj.settings) state.settings = obj.settings;
  if (obj.agyCli) state.agyCli = obj.agyCli;

  const shouldApplyPanel = Boolean(
    obj.panelState && (source === "toolresult" || source === "rewrite" || !state.hasToolResult),
  );
  if (shouldApplyPanel && obj.panelState) {
    activeController?.applyPanelState(obj.panelState);
  }

  activeController?.render();
}

function mountInlineSurface(): SurfaceController {
  document.documentElement.classList.add("is-inline");
  document.body.classList.add("is-inline");
  document.documentElement.classList.remove("is-global");
  document.body.classList.remove("is-global");

  const modeSelect = el("select", {
    class: "mode-select",
    id: "mode-select",
    name: "rewrite-mode",
    "aria-label": "改写模式",
  });
  const engineBadge = el("span", { class: "engine-badge", id: "engine-badge" }, ["⚡ 准备中"]);

  const btnSettings = el("button", {
    class: "icon-btn",
    id: "btn-settings",
    type: "button",
    popovertarget: "quick-settings-popover",
    title: "快捷切换引擎 / 模型（完整设置在左侧栏「扩展插件 → Prompt Rewriter」）",
    "aria-label": "快捷切换引擎与模型",
  });
  btnSettings.innerHTML = SVG_GEAR;

  const topbar = el("div", { class: "topbar" }, [
    el("div", { class: "topbar-left" }, [modeSelect, engineBadge]),
    el("div", { class: "topbar-right" }, [btnSettings]),
  ]);

  // Quick-switch popover anchored to the gear button
  const quickEngineSelect = el("select", { class: "select", id: "quick-engine-select" }, [
    el("option", { value: "agy-cli" }, ["Antigravity 自带轻量模型"]),
    el("option", { value: "external-api" }, ["外接自定义 API"]),
    el("option", { value: "host-session" }, ["当前会话模型"]),
  ]);
  const quickAgyModelSelect = el("select", { class: "select", id: "quick-agy-model-select" });
  const quickAgyRow = el("div", { class: "field-row" }, [
    el("label", { class: "field-label", for: "quick-agy-model-select" }, ["自带模型"]),
    quickAgyModelSelect,
  ]);
  const quickApiSummary = el("div", { class: "field-hint" });
  const quickApiRow = el("div", { class: "field-row", hidden: "" }, [quickApiSummary]);
  const quickHostRow = el("div", { class: "field-row", hidden: "" }, [
    el("div", { class: "field-hint" }, ["直接使用当前对话模型改写，可结合上下文与图片/附件"]),
  ]);
  const quickStatus = el("div", { class: "status-strip", hidden: "" });

  const quickSettingsPopover = el("div", {
    class: "quick-popover",
    id: "quick-settings-popover",
    popover: "auto",
  }, [
    el("div", { class: "quick-popover-header" }, ["快捷切换"]),
    el("div", { class: "quick-popover-body" }, [
      el("div", { class: "field-row" }, [
        el("label", { class: "field-label", for: "quick-engine-select" }, ["改写引擎"]),
        quickEngineSelect,
      ]),
      quickAgyRow,
      quickApiRow,
      quickHostRow,
      quickStatus,
    ]),
    el("div", { class: "quick-popover-hint" }, [
      "完整设置（API Key、自定义规则等）请点击左侧栏「扩展插件 → Prompt Rewriter」",
    ]),
  ]);

  // Editor Panel
  const editorPanel = el("div", { class: "view-panel", id: "editor-panel" });
  const textarea = el("textarea", {
    class: "prompt-textarea",
    id: "prompt-textarea",
    placeholder: "在此直接输入或编辑提示词草稿，点击下方 ✨ 改写，或对改写结果直接微调…",
  });
  const editorWrap = el("div", { class: "editor-wrap" }, [textarea]);
  const statusStrip = el("div", { class: "status-strip", hidden: "" });

  const btnUndo = el("button", {
    class: "icon-btn",
    id: "btn-undo",
    type: "button",
    title: "退回初始草稿",
    "aria-label": "退回初始草稿",
    disabled: "",
  });
  btnUndo.innerHTML = SVG_UNDO;

  const btnRewrite = el("button", {
    class: "icon-btn",
    id: "btn-rewrite",
    type: "button",
    title: "重新改写",
    "aria-label": "重新改写",
  });
  btnRewrite.innerHTML = SVG_SPARKLE;

  const btnCopy = el("button", {
    class: "icon-btn",
    id: "btn-copy",
    type: "button",
    title: "复制提示词",
    "aria-label": "复制提示词",
  });
  btnCopy.innerHTML = SVG_COPY;

  const btnSend = el("button", {
    class: "icon-btn primary",
    id: "btn-send",
    type: "button",
    title: "发送到当前对话执行",
    "aria-label": "发送到当前对话执行",
    hidden: "",
  });
  btnSend.innerHTML = SVG_SEND;

  const bottomToolbar = el("div", { class: "bottom-toolbar" }, [
    el("div", { class: "toolbar-group" }, [btnUndo, btnRewrite, btnCopy]),
    el("div", { class: "toolbar-group" }, [btnSend]),
  ]);

  editorPanel.append(editorWrap, statusStrip, bottomToolbar);
  root.replaceChildren(topbar, editorPanel, quickSettingsPopover);

  function autoSizeTextarea() {
    textarea.style.height = "auto";
    const nextHeight = Math.min(440, Math.max(120, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }

  function updateUndoButton() {
    const hasPair = Boolean(state.originalDraft && state.lastRewritten && state.originalDraft !== state.lastRewritten);
    if (!hasPair) {
      btnUndo.setAttribute("disabled", "");
      btnUndo.innerHTML = SVG_UNDO;
      btnUndo.setAttribute("title", "退回初始草稿");
      btnUndo.setAttribute("aria-label", "退回初始草稿");
      return;
    }
    btnUndo.removeAttribute("disabled");
    if (state.showingOriginal) {
      btnUndo.innerHTML = SVG_REDO;
      btnUndo.setAttribute("title", "恢复改写结果");
      btnUndo.setAttribute("aria-label", "恢复改写结果");
    } else {
      btnUndo.innerHTML = SVG_UNDO;
      btnUndo.setAttribute("title", "退回初始草稿");
      btnUndo.setAttribute("aria-label", "退回初始草稿");
    }
  }

  function updateModeSelectOptions() {
    const s = state.settings;
    modeSelect.innerHTML = "";
    const baseOptions: Array<[string, string]> = [
      ["mode:standard", "标准"],
      ["mode:intent-first", "意图优先"],
      ["mode:concise", "精简"],
    ];
    for (const [val, label] of baseOptions) {
      modeSelect.append(el("option", { value: val }, [label]));
    }
    if (s) {
      for (const rule of s.customRules) {
        if (rule.enabled) {
          modeSelect.append(el("option", { value: `rule:${rule.id}` }, [`自定义：${rule.name}`]));
        }
      }
      if (s.activeCustomRuleId && s.customRules.some((r) => r.id === s.activeCustomRuleId && r.enabled)) {
        modeSelect.value = `rule:${s.activeCustomRuleId}`;
      } else {
        modeSelect.value = `mode:${s.defaultMode}`;
      }
    }
  }

  function renderEngineBadge() {
    const s = state.settings;
    if (!s) return;
    if (s.engine === "agy-cli") {
      engineBadge.textContent = `⚡ ${s.agyModel}`;
      engineBadge.title = `Antigravity 自带模型 (${s.agyModel})`;
    } else if (s.engine === "external-api") {
      engineBadge.textContent = `🌐 ${s.externalApi.model || "自定义 API"}`;
      engineBadge.title = `外接 API (${s.externalApi.format})`;
    } else {
      engineBadge.textContent = "💬 当前会话模型";
      engineBadge.title = "直接使用当前 Antigravity 会话模型";
    }
  }

  function renderQuickPopover() {
    const s = state.settings;
    if (!s) return;
    quickEngineSelect.value = s.engine;
    quickAgyRow.toggleAttribute("hidden", s.engine !== "agy-cli");
    quickApiRow.toggleAttribute("hidden", s.engine !== "external-api");
    quickHostRow.toggleAttribute("hidden", s.engine !== "host-session");

    populateAgyModelSelect(quickAgyModelSelect, state.agyCli?.models || [], s.agyModel);
    quickApiSummary.textContent = `当前外接模型：${s.externalApi.model || "未配置"} (${s.externalApi.format})`;
  }

  function parseSelectedMode(): { mode: RewriteMode; customRuleId: string } {
    const val = modeSelect.value;
    if (val.startsWith("rule:")) {
      return {
        mode: state.settings?.defaultMode || "standard",
        customRuleId: val.slice("rule:".length),
      };
    }
    const mode = (val.startsWith("mode:") ? val.slice("mode:".length) : "standard") as RewriteMode;
    return { mode, customRuleId: "" };
  }

  async function refreshQuickState() {
    try {
      const res = await app.callServerTool({
        name: "app_get_state",
        arguments: { refreshModels: !state.agyCli?.models?.length },
      });
      if (res.structuredContent) {
        applyPanelPayload(res.structuredContent, "state");
      }
    } catch (err) {
      showStatus(quickStatus, err instanceof Error ? err.message : String(err), "error");
    }
  }

  async function handleRewriteClick() {
    if (state.isRewriting) {
      state.rewriteNonce += 1;
      state.isRewriting = false;
      btnRewrite.classList.remove("spinning");
      btnRewrite.setAttribute("title", "重新改写");
      showStatus(statusStrip, "已取消本次等待");
      return;
    }

    const currentText = textarea.value.trim();
    const draftToUse = state.showingOriginal ? currentText : state.originalDraft || currentText;
    if (!draftToUse) {
      showStatus(statusStrip, "请先输入提示词草稿", "error");
      return;
    }

    state.originalDraft = draftToUse;
    state.isRewriting = true;
    const myNonce = ++state.rewriteNonce;
    btnRewrite.classList.add("spinning");
    btnRewrite.setAttribute("title", "取消改写");
    showStatus(statusStrip, "正在改写…", "info");

    const { mode, customRuleId } = parseSelectedMode();
    try {
      const res = await app.callServerTool({
        name: "app_rewrite",
        arguments: {
          draft: draftToUse,
          mode,
          customRuleId,
        },
      });
      if (myNonce !== state.rewriteNonce) return;

      const sc = (res.structuredContent || {}) as {
        ok?: boolean;
        error?: string;
        panelState?: RewriterPanelState;
      };
      if (res.isError || !sc.ok || !sc.panelState) {
        const fallbackErr = Array.isArray(res.content)
          ? res.content.map((c) => ("text" in c ? String(c.text || "") : "")).join(" ").trim()
          : "";
        showStatus(statusStrip, sc.error || fallbackErr || "改写失败", "error");
        return;
      }
      applyPanelPayload({ panelState: sc.panelState }, "rewrite");
    } catch (err) {
      if (myNonce !== state.rewriteNonce) return;
      showStatus(statusStrip, err instanceof Error ? err.message : String(err), "error");
    } finally {
      if (myNonce === state.rewriteNonce) {
        state.isRewriting = false;
        btnRewrite.classList.remove("spinning");
        btnRewrite.setAttribute("title", "重新改写");
      }
    }
  }

  async function copyTextSafe(text: string): Promise<boolean> {
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below.
    }
    try {
      const prevStart = textarea.selectionStart;
      const prevEnd = textarea.selectionEnd;
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.setSelectionRange(prevStart, prevEnd);
      return ok;
    } catch {
      return false;
    }
  }

  textarea.addEventListener("input", autoSizeTextarea);

  btnUndo.addEventListener("click", () => {
    if (!state.originalDraft || !state.lastRewritten) return;
    if (state.showingOriginal) {
      textarea.value = state.lastRewritten;
      state.showingOriginal = false;
    } else {
      state.lastRewritten = textarea.value.trim() || state.lastRewritten;
      textarea.value = state.originalDraft;
      state.showingOriginal = true;
    }
    updateUndoButton();
    autoSizeTextarea();
  });

  btnRewrite.addEventListener("click", () => {
    void handleRewriteClick();
  });

  btnCopy.addEventListener("click", async () => {
    const ok = await copyTextSafe(textarea.value);
    if (ok) {
      btnCopy.innerHTML = SVG_CHECK;
      btnCopy.classList.add("success");
      setTimeout(() => {
        btnCopy.innerHTML = SVG_COPY;
        btnCopy.classList.remove("success");
      }, 1500);
    } else {
      showStatus(statusStrip, "复制失败，请在框内全选 Ctrl+C", "error");
    }
  });

  btnSend.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) {
      showStatus(statusStrip, "内容为空，无法发送", "error");
      return;
    }
    btnSend.setAttribute("disabled", "");
    try {
      const res = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text }],
      });
      if (res.isError) {
        showStatus(statusStrip, "宿主拒绝发送消息，请改用复制按钮", "error");
      } else {
        showStatus(statusStrip, "已发送到当前对话执行", "info");
      }
    } catch (err) {
      showStatus(statusStrip, err instanceof Error ? err.message : String(err), "error");
    } finally {
      btnSend.removeAttribute("disabled");
    }
  });

  modeSelect.addEventListener("change", () => {
    const { mode, customRuleId } = parseSelectedMode();
    void savePatch({ defaultMode: mode, activeCustomRuleId: customRuleId });
  });

  quickEngineSelect.addEventListener("change", () => {
    void savePatch({ engine: quickEngineSelect.value as EngineType }, quickStatus, "已保存");
  });
  quickAgyModelSelect.addEventListener("change", () => {
    void savePatch({ agyModel: quickAgyModelSelect.value }, quickStatus, "已保存");
  });

  const supportsNativePopover = Object.hasOwn(HTMLElement.prototype, "popover");
  if (supportsNativePopover) {
    quickSettingsPopover.addEventListener("toggle", (event) => {
      const isOpen = (event as Event & { newState?: string }).newState === "open";
      btnSettings.classList.toggle("active", isOpen);
      if (isOpen) {
        void refreshQuickState();
      }
    });
  } else {
    quickSettingsPopover.setAttribute("hidden", "");
    const closeFallbackPopover = () => {
      quickSettingsPopover.setAttribute("hidden", "");
      btnSettings.classList.remove("active");
    };
    btnSettings.addEventListener("click", () => {
      const nextOpen = quickSettingsPopover.hasAttribute("hidden");
      quickSettingsPopover.toggleAttribute("hidden", !nextOpen);
      btnSettings.classList.toggle("active", nextOpen);
      if (nextOpen) {
        void refreshQuickState();
      }
    });
    document.addEventListener("click", (event) => {
      if (quickSettingsPopover.hasAttribute("hidden")) return;
      const target = event.target as Node | null;
      if (target && !quickSettingsPopover.contains(target) && !btnSettings.contains(target)) {
        closeFallbackPopover();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !quickSettingsPopover.hasAttribute("hidden")) {
        closeFallbackPopover();
      }
    });
  }

  return {
    render() {
      updateModeSelectOptions();
      renderEngineBadge();
      renderQuickPopover();
      updateUndoButton();
      autoSizeTextarea();
    },
    updateCapabilities() {
      btnSend.toggleAttribute("hidden", !state.canSendMessage);
      autoSizeTextarea();
    },
    applyPanelState(p: RewriterPanelState) {
      if (p.originalPrompt || p.rewrittenPrompt) {
        state.originalDraft = p.originalPrompt || p.rewrittenPrompt;
        state.lastRewritten = p.rewrittenPrompt || p.originalPrompt;
        state.showingOriginal = false;
        textarea.value = state.lastRewritten;
        if (p.fallbackNote) {
          showStatus(statusStrip, `已回退：${p.fallbackNote}`, "info");
        } else if (p.engineUsed) {
          const ms = p.durationMs ? ` · ${(p.durationMs / 1000).toFixed(1)}s` : "";
          showStatus(statusStrip, `完成（${p.engineUsed}${ms}）`);
        } else {
          showStatus(statusStrip, "改写完成");
        }
      }
    },
    showPanelError(message: string) {
      showStatus(statusStrip, message, "error");
    },
    handleToolInput(args: { originalPrompt?: string; autoRun?: boolean }) {
      if (typeof args.originalPrompt === "string" && args.originalPrompt.trim()) {
        state.originalDraft = args.originalPrompt;
        if (!textarea.value.trim()) {
          textarea.value = args.originalPrompt;
        }
        if (args.autoRun) {
          showStatus(statusStrip, "正在用独立模型改写…", "info");
        }
      }
    },
  };
}

function mountGlobalSurface(): SurfaceController {
  document.documentElement.classList.add("is-global");
  document.body.classList.add("is-global");
  document.documentElement.classList.remove("is-inline");
  document.body.classList.remove("is-inline");

  const settingsPanel = el("div", { class: "view-panel", id: "settings-panel" });
  const settingsScroll = el("div", { class: "settings-scroll" });
  const settingsStatus = el("div", { class: "status-strip", hidden: "" });

  function makeEngineCard(engine: EngineType, title: string, desc: string): HTMLButtonElement {
    const card = el("button", { class: "engine-card", type: "button", "data-engine": engine }, [
      el("span", { class: "engine-card-title" }, [title]),
      el("span", { class: "engine-card-desc" }, [desc]),
    ]);
    card.addEventListener("click", () => {
      void savePatch({ engine }, settingsStatus, "已切换引擎");
    });
    return card;
  }

  const engineGrid = el("div", { class: "engine-grid" });
  const cardAgy = makeEngineCard("agy-cli", "Antigravity 自带轻量模型", "免外部 Key · 调用本机 agy CLI");
  const cardApi = makeEngineCard("external-api", "外接自定义 API", "OpenAI 兼容 / Gemini / Ollama");
  const cardHost = makeEngineCard("host-session", "当前会话模型", "零配置 · 可结合上下文与图片/附件");
  engineGrid.append(cardAgy, cardApi, cardHost);

  // Engine sub-panels
  const subAgy = el("div", { class: "subpanel", id: "sub-agy" });
  const agyModelSelect = el("select", { class: "select" });
  const btnRefreshModels = el("button", { class: "btn-sm", type: "button" }, ["刷新列表"]);
  const agyTimeoutInput = el("input", { class: "input", type: "number", min: "5", max: "120" });
  const agyHint = el("div", { class: "field-hint" });
  subAgy.append(
    el("div", { class: "field-row" }, [
      el("label", { class: "field-label" }, ["自带模型选择"]),
      el("div", { class: "input-group" }, [agyModelSelect, btnRefreshModels]),
      agyHint,
    ]),
    el("div", { class: "field-row" }, [
      el("label", { class: "field-label" }, ["CLI 超时（秒）"]),
      agyTimeoutInput,
    ]),
  );

  const subApi = el("div", { class: "subpanel", id: "sub-api", hidden: "" });
  const apiFormatSelect = el("select", { class: "select" }, [
    el("option", { value: "openai" }, ["OpenAI 兼容 (/chat/completions)"]),
    el("option", { value: "gemini" }, ["Google Gemini (:generateContent)"]),
  ]);
  const apiBaseInput = el("input", { class: "input", type: "text", placeholder: "https://api.openai.com/v1" });
  const apiModelInput = el("input", { class: "input", type: "text", placeholder: "gpt-4o-mini / gemini-2.5-flash" });
  const apiKeyInput = el("input", {
    class: "input",
    type: "password",
    placeholder: "输入密钥或 env:OPENAI_API_KEY",
  });
  const btnClearKey = el("button", { class: "btn-sm danger", type: "button" }, ["清除"]);
  const apiKeyHint = el("div", { class: "field-hint" });
  const apiTimeoutInput = el("input", { class: "input", type: "number", min: "5", max: "120" });
  subApi.append(
    el("div", { class: "grid-2" }, [
      el("div", { class: "field-row" }, [el("label", { class: "field-label" }, ["接口协议"]), apiFormatSelect]),
      el("div", { class: "field-row" }, [el("label", { class: "field-label" }, ["模型名称"]), apiModelInput]),
    ]),
    el("div", { class: "field-row" }, [el("label", { class: "field-label" }, ["Base URL"]), apiBaseInput]),
    el("div", { class: "field-row" }, [
      el("label", { class: "field-label" }, ["API Key（仅存本机隔离目录，绝不泄露给会话模型）"]),
      el("div", { class: "input-group" }, [apiKeyInput, btnClearKey]),
      apiKeyHint,
    ]),
    el("div", { class: "field-row" }, [el("label", { class: "field-label" }, ["请求超时（秒）"]), apiTimeoutInput]),
  );

  const subHost = el("div", { class: "subpanel", id: "sub-host", hidden: "" });
  subHost.append(
    el("div", { class: "field-hint" }, [
      "直接使用当前 Antigravity 会话模型完成改写，无需额外配置，且可结合对话历史与上传的图片/附件。",
    ]),
  );

  const btnTestConn = el("button", { class: "btn-sm", type: "button" }, ["测试连接"]);
  const btnSaveExt = el("button", { class: "btn-sm primary", type: "button" }, ["保存配置"]);
  const engineCardSection = el("div", { class: "section-card" }, [
    el("h3", { class: "section-title" }, ["改写引擎"]),
    engineGrid,
    subAgy,
    subApi,
    subHost,
    el("div", { class: "input-group" }, [btnSaveExt, btnTestConn]),
  ]);

  // Strategy section
  const defaultModeSelect = el("select", { class: "select" }, [
    el("option", { value: "standard" }, ["标准模式（平衡扩展）"]),
    el("option", { value: "intent-first" }, ["意图优先（六维深度补全）"]),
    el("option", { value: "concise" }, ["精简模式（仅去歧义与收紧）"]),
  ]);
  const languageSelect = el("select", { class: "select" }, [
    el("option", { value: "auto" }, ["跟随草稿语言"]),
    el("option", { value: "zh-CN" }, ["始终输出简体中文"]),
    el("option", { value: "en" }, ["Always English"]),
  ]);

  const MODE_GUIDE_ITEMS: Array<{
    mode: RewriteMode;
    title: string;
    badge: string;
    accent?: boolean;
    summary: string;
    strength: string;
    length: string;
    fit: string;
  }> = [
    {
      mode: "standard",
      title: "标准模式",
      badge: "默认",
      summary: "在保持原意与简洁的前提下补齐关键要素，适合日常大多数开发与通用任务。",
      strength: "平衡补全目标、范围与方法、输出格式及边界/验收要点；未说明的小细节指示执行者采用保守默认并简要声明假设，绝不反问。",
      length: "约为原文 1.5–3 倍",
      fit: "日常功能开发、重构、写脚本或整理清晰需求时默认使用。",
    },
    {
      mode: "intent-first",
      title: "意图优先",
      badge: "深度",
      accent: true,
      summary: "先推断你真正想达成的目标，再按六大维度系统展开，让下游 AI 无需追问即可直接执行。",
      strength: "最积极：按任务需要覆盖目标、输入与上下文、范围、方法、输出格式与验收标准；缺省细节交由执行者选定合理默认并声明假设。",
      length: "稀疏草稿约 2–4 倍",
      fit: "只有一句话的模糊草稿，例如「帮我加个导出 Excel 的功能」。",
    },
    {
      mode: "concise",
      title: "精简模式",
      badge: "轻量",
      summary: "只做纠错、去歧义与收紧边界，保留原本的紧凑节奏而不大幅扩写。",
      strength: "最克制：修正错别字与模糊表述，保留核心约束和用户提到的文件/参数，不堆砌冗长模板。",
      length: "约为原文 1–1.5 倍",
      fit: "草稿本身已经比较清楚，只想润色表述、压紧范围与约束时使用。",
    },
  ];

  const modeGuideToggle = el("button", {
    class: "mode-guide-toggle",
    type: "button",
    "aria-expanded": "false",
  }, ["▸ 三种改写模式有什么区别？"]);
  const modeGuideList = el("div", { class: "mode-guide-list", hidden: "" });
  const modeGuideCards: HTMLButtonElement[] = [];

  for (const item of MODE_GUIDE_ITEMS) {
    const badgeClass = item.accent ? "mode-badge accent" : "mode-badge";
    const card = el("button", {
      class: "mode-guide-card",
      type: "button",
      "data-mode": item.mode,
    }, [
      el("div", { class: "mode-guide-head" }, [
        el("span", { class: "mode-guide-title" }, [item.title]),
        el("span", { class: badgeClass }, [item.badge]),
      ]),
      el("div", { class: "mode-guide-summary" }, [item.summary]),
      el("div", { class: "mode-guide-meta" }, [
        el("span", { class: "mode-guide-key" }, ["改写力度"]),
        el("span", { class: "mode-guide-val" }, [item.strength]),
        el("span", { class: "mode-guide-key" }, ["典型长度"]),
        el("span", { class: "mode-guide-val" }, [item.length]),
        el("span", { class: "mode-guide-key" }, ["适合"]),
        el("span", { class: "mode-guide-val" }, [item.fit]),
      ]),
    ]);
    card.addEventListener("click", () => {
      void savePatch({ defaultMode: item.mode }, settingsStatus);
    });
    modeGuideCards.push(card);
    modeGuideList.append(card);
  }

  modeGuideToggle.addEventListener("click", () => {
    const expanded = modeGuideToggle.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    modeGuideToggle.setAttribute("aria-expanded", String(next));
    modeGuideToggle.textContent = next ? "▾ 三种改写模式有什么区别？" : "▸ 三种改写模式有什么区别？";
    modeGuideList.toggleAttribute("hidden", !next);
  });

  const modeGuideWrap = el("div", { class: "mode-guide-wrap" }, [modeGuideToggle, modeGuideList]);

  const fallbackCheck = el("input", { type: "checkbox" });
  const strategySection = el("div", { class: "section-card" }, [
    el("h3", { class: "section-title" }, ["改写策略"]),
    el("div", { class: "grid-2" }, [
      el("div", { class: "field-row" }, [el("label", { class: "field-label" }, ["默认改写模式"]), defaultModeSelect]),
      el("div", { class: "field-row" }, [el("label", { class: "field-label" }, ["输出语言"]), languageSelect]),
    ]),
    modeGuideWrap,
    el("div", { class: "field-row inline" }, [
      el("span", { class: "field-label" }, ["独立引擎失败时允许自动回退到当前会话模型（仅对话内生效）"]),
      fallbackCheck,
    ]),
  ]);

  // Custom rules section
  const ruleListEl = el("div", { class: "rule-list" });
  const btnNewRule = el("button", { class: "btn-sm", type: "button" }, ["+ 新增规则"]);
  const ruleForm = el("div", { class: "rule-form", hidden: "" });
  const ruleNameInput = el("input", { class: "input", type: "text", placeholder: "规则名称（如：Python 数据脚本）", maxlength: "80" });
  const ruleContentInput = el("textarea", {
    class: "rule-textarea",
    rows: "4",
    placeholder: "输入你的改写附加要求（最多 4000 字）…",
    maxlength: "4000",
  });
  const btnSaveRule = el("button", { class: "btn-sm primary", type: "button" }, ["保存规则"]);
  const btnCancelRule = el("button", { class: "btn-sm", type: "button" }, ["取消"]);
  ruleForm.append(
    ruleNameInput,
    ruleContentInput,
    el("div", { class: "input-group" }, [btnSaveRule, btnCancelRule]),
  );

  const rulesSection = el("div", { class: "section-card" }, [
    el("div", { class: "rule-item-head" }, [
      el("h3", { class: "section-title" }, ["自定义规则"]),
      btnNewRule,
    ]),
    ruleListEl,
    ruleForm,
  ]);

  settingsScroll.append(engineCardSection, strategySection, rulesSection);
  settingsPanel.append(settingsScroll, settingsStatus);
  root.replaceChildren(settingsPanel);

  function renderCustomRules() {
    const s = state.settings;
    if (!s) return;
    ruleListEl.innerHTML = "";
    if (s.customRules.length === 0) {
      ruleListEl.append(el("div", { class: "field-hint" }, ["暂无自定义规则。点击右上角「+ 新增规则」可添加你的专属改写要求。"]));
      return;
    }

    for (const rule of s.customRules) {
      const toggleBtn = el("button", { class: "btn-sm", type: "button" }, [rule.enabled ? "已启用" : "已停用"]);
      toggleBtn.addEventListener("click", () => {
        const nextRules = s.customRules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
        void savePatch({ customRules: nextRules }, settingsStatus);
      });

      const editBtn = el("button", { class: "btn-sm", type: "button" }, ["编辑"]);
      editBtn.addEventListener("click", () => {
        state.editingRuleId = rule.id;
        ruleNameInput.value = rule.name;
        ruleContentInput.value = rule.content;
        ruleForm.removeAttribute("hidden");
      });

      const delBtn = el("button", { class: "btn-sm danger", type: "button" }, ["删除"]);
      delBtn.addEventListener("click", () => {
        const nextRules = s.customRules.filter((r) => r.id !== rule.id);
        const nextActive = s.activeCustomRuleId === rule.id ? "" : s.activeCustomRuleId;
        void savePatch({ customRules: nextRules, activeCustomRuleId: nextActive }, settingsStatus);
      });

      const item = el("div", { class: "rule-item" }, [
        el("div", { class: "rule-item-head" }, [
          el("span", { class: "rule-item-name" }, [rule.name]),
          el("div", { class: "input-group" }, [toggleBtn, editBtn, delBtn]),
        ]),
        el("div", { class: "rule-item-preview" }, [rule.content]),
      ]);
      ruleListEl.append(item);
    }
  }

  function renderSettings() {
    const s = state.settings;
    if (!s) return;

    for (const card of [cardAgy, cardApi, cardHost]) {
      card.classList.toggle("selected", card.getAttribute("data-engine") === s.engine);
    }
    subAgy.toggleAttribute("hidden", s.engine !== "agy-cli");
    subApi.toggleAttribute("hidden", s.engine !== "external-api");
    subHost.toggleAttribute("hidden", s.engine !== "host-session");

    populateAgyModelSelect(agyModelSelect, state.agyCli?.models || [], s.agyModel);
    agyTimeoutInput.value = String(s.agyTimeoutSec);
    if (state.agyCli?.available) {
      agyHint.textContent = `已检测到 agy CLI，共 ${state.agyCli.models.length} 个可用模型。`;
    } else {
      agyHint.textContent = state.agyCli?.error || "未检测到本机 agy CLI，请改用外接 API 或当前会话模型。";
    }

    apiFormatSelect.value = s.externalApi.format;
    apiBaseInput.value = s.externalApi.baseUrl;
    apiModelInput.value = s.externalApi.model;
    apiKeyInput.value = s.externalApi.apiKeySource === "env" ? s.externalApi.apiKeyMasked : "";
    apiKeyInput.placeholder = s.externalApi.hasApiKey
      ? `已保存: ${s.externalApi.apiKeyMasked}（留空保持不变，或输入 env:变量名）`
      : "输入 API Key，或填 env:OPENAI_API_KEY";
    apiKeyHint.textContent = s.externalApi.hasApiKey
      ? `当前凭据来源：${s.externalApi.apiKeySource === "env" ? "环境变量" : "本机隔离配置"} (${s.externalApi.apiKeyMasked})`
      : "未设置 API Key（本地 Ollama 等免鉴权服务可留空）";
    apiTimeoutInput.value = String(s.externalApi.timeoutSec);

    defaultModeSelect.value = s.defaultMode;
    for (const card of modeGuideCards) {
      card.classList.toggle("selected", card.getAttribute("data-mode") === s.defaultMode);
    }
    languageSelect.value = s.language;
    fallbackCheck.checked = s.fallbackToHostOnError;

    renderCustomRules();
  }

  function collectEnginePatch(): SettingsPatch {
    const s = state.settings;
    const format = apiFormatSelect.value as ExternalApiFormat;
    const keyVal = apiKeyInput.value.trim();
    const patch: SettingsPatch = {
      agyModel: agyModelSelect.value || s?.agyModel,
      agyTimeoutSec: Number(agyTimeoutInput.value || 30),
      externalApi: {
        format,
        baseUrl: apiBaseInput.value.trim(),
        model: apiModelInput.value.trim(),
        timeoutSec: Number(apiTimeoutInput.value || 20),
      },
    };
    if (keyVal && !keyVal.includes("****")) {
      patch.externalApi!.apiKey = keyVal;
    }
    return patch;
  }

  defaultModeSelect.addEventListener("change", () => {
    void savePatch({ defaultMode: defaultModeSelect.value as RewriteMode }, settingsStatus);
  });
  languageSelect.addEventListener("change", () => {
    void savePatch({ language: languageSelect.value as OutputLanguage }, settingsStatus);
  });
  fallbackCheck.addEventListener("change", () => {
    void savePatch({ fallbackToHostOnError: fallbackCheck.checked }, settingsStatus);
  });
  agyModelSelect.addEventListener("change", () => {
    void savePatch({ agyModel: agyModelSelect.value }, settingsStatus);
  });

  btnRefreshModels.addEventListener("click", async () => {
    showStatus(settingsStatus, "正在刷新 agy 模型列表…", "info");
    try {
      const res = await app.callServerTool({
        name: "app_get_state",
        arguments: { refreshModels: true },
      });
      if (res.structuredContent) {
        applyPanelPayload(res.structuredContent);
      }
      flashStatus(settingsStatus, "模型列表已更新", "info", 2000);
    } catch (err) {
      showStatus(settingsStatus, err instanceof Error ? err.message : String(err), "error");
    }
  });

  btnSaveExt.addEventListener("click", () => {
    void savePatch(collectEnginePatch(), settingsStatus);
  });

  btnClearKey.addEventListener("click", () => {
    apiKeyInput.value = "";
    void savePatch({ externalApi: { clearApiKey: true } }, settingsStatus);
  });

  btnTestConn.addEventListener("click", async () => {
    showStatus(settingsStatus, "正在测试连接…", "info");
    try {
      const res = await app.callServerTool({
        name: "app_test_connection",
        arguments: { settings: collectEnginePatch() },
      });
      const sc = (res.structuredContent || {}) as {
        ok?: boolean;
        message?: string;
        settings?: PublicSettings;
        agyCli?: AgyCliStatus;
      };
      applyPanelPayload({ settings: sc.settings, agyCli: sc.agyCli });
      showStatus(settingsStatus, sc.message || "测试完成", sc.ok ? "info" : "error");
    } catch (err) {
      showStatus(settingsStatus, err instanceof Error ? err.message : String(err), "error");
    }
  });

  btnNewRule.addEventListener("click", () => {
    state.editingRuleId = null;
    ruleNameInput.value = "";
    ruleContentInput.value = "";
    ruleForm.removeAttribute("hidden");
  });

  btnCancelRule.addEventListener("click", () => {
    ruleForm.setAttribute("hidden", "");
  });

  btnSaveRule.addEventListener("click", () => {
    const name = ruleNameInput.value.trim();
    const content = ruleContentInput.value.trim();
    if (!name || !content) {
      showStatus(settingsStatus, "请填写规则名称与内容", "error");
      return;
    }
    const existing = state.settings?.customRules || [];
    let nextRules: CustomRule[];
    if (state.editingRuleId) {
      nextRules = existing.map((r) => (r.id === state.editingRuleId ? { ...r, name, content } : r));
    } else {
      const id = `rule-${Date.now().toString(36)}`;
      nextRules = [...existing, { id, name, content, enabled: true }];
    }
    ruleForm.setAttribute("hidden", "");
    void savePatch({ customRules: nextRules }, settingsStatus);
  });

  return {
    render() {
      renderSettings();
    },
    updateCapabilities() {},
    applyPanelState() {},
    showPanelError(message: string) {
      showStatus(settingsStatus, message, "error");
    },
    handleToolInput() {},
  };
}

function mountSurface(surface: AppSurface) {
  state.surface = surface;
  activeController = surface === "global" ? mountGlobalSurface() : mountInlineSurface();
}

function updateCapabilityUi() {
  const caps = app.getHostCapabilities();
  state.canSendMessage = Boolean(caps?.message);
  if (!state.lockedSurface) {
    const inferred: AppSurface = state.canSendMessage ? "inline" : "global";
    if (inferred !== state.surface) {
      mountSurface(inferred);
    }
  }
  activeController?.updateCapabilities();
}

function applyContext(ctx?: McpUiHostContext) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.ontoolinput = ({ arguments: args }) => {
  const input = (args || {}) as { originalPrompt?: string; autoRun?: boolean };
  activeController?.handleToolInput(input);
};

app.ontoolresult = (result) => {
  if (result.isError) {
    const msg = result.content?.map((c) => ("text" in c ? c.text : "")).join(" ").trim();
    if (msg) activeController?.showPanelError(msg);
    return;
  }
  if (result.structuredContent) {
    applyPanelPayload(result.structuredContent, "toolresult");
  }
};

app.onhostcontextchanged = (ctx) => {
  applyContext(ctx);
};

async function init() {
  mountSurface(state.surface);
  await app.connect();
  applyContext(app.getHostContext());
  updateCapabilityUi();
  try {
    const res = await app.callServerTool({
      name: "app_get_state",
      arguments: {},
    });
    if (res.structuredContent) {
      applyPanelPayload(res.structuredContent, "state");
    }
  } catch (err) {
    activeController?.showPanelError(err instanceof Error ? err.message : String(err));
  }
}

void init();
