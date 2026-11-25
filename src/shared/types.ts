export type EngineType = "agy-cli" | "external-api" | "host-session";
export type RewriteMode = "standard" | "intent-first" | "concise";
export type OutputLanguage = "auto" | "zh-CN" | "en";
export type ExternalApiFormat = "openai" | "gemini";

export interface CustomRule {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
}

export interface ExternalApiConfig {
  format: ExternalApiFormat;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutSec: number;
}

export interface StoredSettings {
  engine: EngineType;
  agyModel: string;
  agyTimeoutSec: number;
  defaultMode: RewriteMode;
  language: OutputLanguage;
  activeCustomRuleId: string;
  fallbackToHostOnError: boolean;
  externalApi: ExternalApiConfig;
  customRules: CustomRule[];
}

export interface PublicExternalApiConfig {
  format: ExternalApiFormat;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  apiKeySource: "none" | "stored" | "env";
  timeoutSec: number;
}

export interface PublicSettings {
  engine: EngineType;
  agyModel: string;
  agyTimeoutSec: number;
  defaultMode: RewriteMode;
  language: OutputLanguage;
  activeCustomRuleId: string;
  fallbackToHostOnError: boolean;
  externalApi: PublicExternalApiConfig;
  customRules: CustomRule[];
}

export interface AgyModelInfo {
  id: string;
  label: string;
  recommended?: boolean;
}

export interface AgyCliStatus {
  available: boolean;
  executable: string;
  models: AgyModelInfo[];
  error?: string;
}

export interface SettingsPatch {
  engine?: EngineType;
  agyModel?: string;
  agyTimeoutSec?: number;
  defaultMode?: RewriteMode;
  language?: OutputLanguage;
  activeCustomRuleId?: string;
  fallbackToHostOnError?: boolean;
  externalApi?: {
    format?: ExternalApiFormat;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    clearApiKey?: boolean;
    timeoutSec?: number;
  };
  customRules?: CustomRule[];
}

export interface RewriterPanelState {
  originalPrompt: string;
  rewrittenPrompt: string;
  mode: RewriteMode;
  customRuleId: string;
  engineUsed: string;
  durationMs?: number;
  fallbackNote?: string;
  error?: string;
}

export const MAX_CUSTOM_RULES = 10;
export const MAX_CUSTOM_RULE_CHARS = 4000;
export const MAX_DRAFT_CHARS = 8000;

export const DEFAULT_SETTINGS: StoredSettings = {
  engine: "agy-cli",
  agyModel: "gemini-3.8-flash-low",
  agyTimeoutSec: 30,
  defaultMode: "standard",
  language: "auto",
  activeCustomRuleId: "",
  fallbackToHostOnError: true,
  externalApi: {
    format: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
    timeoutSec: 20,
  },
  customRules: [],
};
