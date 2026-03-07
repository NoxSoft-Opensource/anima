/**
 * Gemini Direct API Runner
 *
 * Makes calls directly to generativelanguage.googleapis.com without needing
 * a CLI wrapper. Works with Google API keys (GEMINI_API_KEY).
 *
 * This runner is automatically used when a google API key is available
 * and the provider is set to "google" or "gemini".
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ThinkLevel } from "../auto-reply/thinking.js";
import type { AnimaConfig } from "../config/config.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner.js";
import { resolveHeartbeatPrompt } from "../auto-reply/heartbeat.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveSessionAgentIds } from "./agent-scope.js";
import { resolveBootstrapContextForRun, makeBootstrapWarn } from "./bootstrap-files.js";
import { buildSystemPrompt } from "./cli-runner/helpers.js";
import { resolveAnimaDocsPath } from "./docs-path.js";
import { resolveRunWorkspaceDir } from "./workspace-run.js";

const log = createSubsystemLogger("agent/gemini-direct");

const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Canonical model name mapping for direct API calls
const MODEL_MAP: Record<string, string> = {
  gemini: "gemini-2.0-flash",
  "gemini-pro": "gemini-1.5-pro",
  "gemini-flash": "gemini-2.0-flash",
  "gemini-2.0": "gemini-2.0-flash",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-2.0-pro": "gemini-2.0-pro-exp-02-05",
  "gemini-1.5": "gemini-1.5-pro",
  "gemini-1.5-pro": "gemini-1.5-pro",
  "gemini-1.5-flash": "gemini-1.5-flash",
  default: "gemini-2.0-flash",
};

// Where we store per-session conversation history for multi-turn support
const HISTORY_FILE_SUFFIX = ".gemini-history.json";

type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};

type SessionHistory = {
  sessionId: string;
  contents: GeminiContent[];
  createdAt: number;
  updatedAt: number;
};

async function loadSessionHistory(sessionFile: string): Promise<SessionHistory | null> {
  const histPath = sessionFile + HISTORY_FILE_SUFFIX;
  try {
    const raw = await fs.readFile(histPath, "utf8");
    return JSON.parse(raw) as SessionHistory;
  } catch {
    return null;
  }
}

async function saveSessionHistory(sessionFile: string, history: SessionHistory): Promise<void> {
  const histPath = sessionFile + HISTORY_FILE_SUFFIX;
  try {
    await fs.mkdir(path.dirname(histPath), { recursive: true });
    await fs.writeFile(histPath, JSON.stringify(history, null, 2), "utf8");
  } catch (err) {
    log.warn("failed to save session history", { error: String(err) });
  }
}

function resolveModel(model: string | undefined): string {
  const key = (model ?? "default").trim().toLowerCase() || "default";
  return MODEL_MAP[key] ?? key;
}

function buildModelPath(model: string): string {
  return model.startsWith("models/") ? model : `models/${model}`;
}

/**
 * Run an agent turn directly against generativelanguage.googleapis.com.
 *
 * Maintains multi-turn conversation history per session file.
 * Falls back to single-turn if history is unavailable.
 */
export async function runGeminiDirectAgent(params: {
  apiKey: string;
  sessionId: string;
  sessionKey?: string;
  agentId?: string;
  sessionFile: string;
  workspaceDir: string;
  config?: AnimaConfig;
  prompt: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  timeoutMs: number;
  runId: string;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  onPartialReply?: (payload: { text?: string }) => Promise<void> | void;
  onAssistantMessageStart?: () => Promise<void> | void;
}): Promise<EmbeddedPiRunResult> {
  const started = Date.now();
  const resolvedModel = resolveModel(params.model);
  const modelPath = buildModelPath(resolvedModel);

  log.info(`direct api exec: model=${resolvedModel} promptChars=${params.prompt.length}`);

  // Build system prompt (reuses the same soul file loading as the CLI runner)
  const workspaceResolution = resolveRunWorkspaceDir({
    workspaceDir: params.workspaceDir,
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    config: params.config,
  });
  const workspaceDir = workspaceResolution.workspaceDir;

  const { contextFiles } = await resolveBootstrapContextForRun({
    workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    warn: makeBootstrapWarn({
      sessionLabel: params.sessionKey ?? params.sessionId,
      warn: (msg) => log.warn(msg),
    }),
  });

  const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.config,
  });

  const heartbeatPrompt =
    sessionAgentId === defaultAgentId
      ? resolveHeartbeatPrompt(params.config?.agents?.defaults?.heartbeat?.prompt)
      : undefined;

  const docsPath = await resolveAnimaDocsPath({
    workspaceDir,
    argv1: process.argv[1],
    cwd: process.cwd(),
    moduleUrl: import.meta.url,
  });

  const extraSystemPrompt = [
    params.extraSystemPrompt?.trim(),
    "Tools are disabled in this session. Do not call tools.",
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = buildSystemPrompt({
    workspaceDir,
    config: params.config,
    defaultThinkLevel: params.thinkLevel,
    extraSystemPrompt,
    ownerNumbers: params.ownerNumbers,
    heartbeatPrompt,
    docsPath: docsPath ?? undefined,
    tools: [],
    contextFiles,
    modelDisplay: `google/${resolvedModel}`,
    agentId: sessionAgentId,
  });

  // Load or create conversation history
  let history = await loadSessionHistory(params.sessionFile);
  if (!history) {
    history = {
      sessionId: params.sessionId,
      contents: [],
      createdAt: started,
      updatedAt: started,
    };
  }

  // Append the new user message
  history.contents.push({
    role: "user",
    parts: [{ text: params.prompt }],
  });

  // Build the API request body
  // Gemini uses systemInstruction for system prompts
  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: history.contents,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 1.0,
    },
  };

  try {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), params.timeoutMs);

    const baseUrl = DEFAULT_GEMINI_BASE_URL;
    const url = `${baseUrl}/${modelPath}:generateContent?key=${params.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `anima/5.0.1 (gemini-direct-runner; ${os.platform()})`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const isAuth = response.status === 401 || response.status === 403;
      const isRateLimit = response.status === 429;
      const rateHint = isRateLimit ? " — rate limit hit, will retry next heartbeat." : "";
      const authHint = isAuth
        ? " — API key may be invalid. Check GEMINI_API_KEY environment variable."
        : "";
      log.error(`gemini api error: HTTP ${response.status}${authHint}${rateHint}`, {
        status: response.status,
        body: body.slice(0, 500),
      });
      return {
        status: "failed",
        meta: {
          durationMs: Date.now() - started,
          error: {
            message: `HTTP ${response.status}: ${body.slice(0, 200)}${authHint}${rateHint}`,
            kind: isAuth ? "auth" : isRateLimit ? "rate_limit" : "unknown",
          },
        },
      };
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
          role?: string;
        };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    // Extract text from the response
    const candidate = data.candidates?.[0];
    const textParts = (candidate?.content?.parts ?? [])
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text as string);
    const assistantText = textParts.join("\n");

    if (assistantText && params.onPartialReply) {
      await params.onPartialReply({ text: assistantText });
    }

    // Append assistant response to history
    if (assistantText) {
      history.contents.push({
        role: "model",
        parts: [{ text: assistantText }],
      });
      history.updatedAt = Date.now();
      await saveSessionHistory(params.sessionFile, history);
    }

    const usage = data.usageMetadata;
    const durationMs = Date.now() - started;

    log.info(`gemini api complete: ${durationMs}ms`, {
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
      finishReason: candidate?.finishReason,
    });

    return {
      status: "completed",
      output: assistantText,
      meta: {
        durationMs,
        agentMeta: {
          model: resolvedModel,
          provider: "google",
          usage: usage
            ? {
                input: usage.promptTokenCount ?? 0,
                output: usage.candidatesTokenCount ?? 0,
              }
            : undefined,
        },
      },
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    const errorKind = isAbort ? "timeout" : "unknown";
    const errorMsg = isAbort ? `Request timed out after ${params.timeoutMs}ms` : String(err);

    log.error(`gemini api error: ${errorMsg}`, { error: String(err) });

    return {
      status: "failed",
      meta: {
        durationMs: Date.now() - started,
        error: {
          message: errorMsg,
          kind: errorKind,
        },
      },
    };
  }
}
