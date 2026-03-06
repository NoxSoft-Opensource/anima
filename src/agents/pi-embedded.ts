/**
 * Pi-embedded agent — CLI compatibility adapter
 *
 * The original pi-embedded provider abstraction was removed. To keep
 * legacy call sites functional during migration, this module routes
 * run requests through configured CLI backends.
 */

import type { ImageContent } from "@mariozechner/pi-ai";
import crypto from "node:crypto";
import type { ThinkLevel } from "../auto-reply/thinking.js";
import type { AnimaConfig } from "../config/config.js";
import type { SessionSystemPromptReport } from "../config/sessions/types.js";
import type { NormalizedUsage } from "./usage.js";
import { resolveCliBackendConfig } from "./cli-backends.js";
import { runCliAgent } from "./cli-runner.js";
import { runAnthropicDirectAgent } from "./anthropic-direct-runner.js";
import { loadAuthProfileStore } from "./auth-profiles/store.js";
import { normalizeProviderId } from "./model-selection.js";

export type EmbeddedPiAgentMeta = Record<string, unknown>;

export type EmbeddedPiCompactResult = {
  ok: boolean;
  compacted?: boolean;
  reason?: string;
  result?: {
    tokensBefore?: number;
    tokensAfter?: number;
  };
};

export type EmbeddedPiRunMeta = Record<string, unknown>;

export type EmbeddedPiRunResult = {
  status: "completed" | "failed" | "timeout";
  output?: string;
  payloads?: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
  }>;
  meta: {
    durationMs?: number;
    error?: { message: string; kind?: string };
    systemPromptReport?: SessionSystemPromptReport;
    agentMeta?: {
      sessionId?: string;
      provider?: string;
      model?: string;
      usage?: NormalizedUsage;
      promptTokens?: number;
      lastCallUsage?: NormalizedUsage;
    };
  };
  messagingToolSentTexts?: string[];
  messagingToolSentTargets?: Array<{
    to: string;
    text: string;
    provider?: string;
    accountId?: string;
  }>;
};

type EmbeddedRunParams = {
  sessionId: string;
  sessionFile: string;
  workspaceDir: string;
  prompt: string;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  timeoutMs?: number;
  runId?: string;
  config?: AnimaConfig;
  sessionKey?: string;
  agentId?: string;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  images?: ImageContent[];
  onPartialReply?: (payload: { text?: string; mediaUrls?: string[] }) => Promise<void> | void;
  onAssistantMessageStart?: () => Promise<void> | void;
  onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => Promise<void> | void;
};

function normalizeEmbeddedProvider(provider: string | undefined): string {
  const normalized = normalizeProviderId(provider ?? "");
  return normalized || "anthropic";
}

function resolveCompatCliProvider(provider: string, config?: AnimaConfig): string {
  if (resolveCliBackendConfig(provider, config)) {
    return provider;
  }
  if (provider === "anthropic" || provider === "claude") {
    return "claude-cli";
  }
  if (provider === "openai" || provider === "openai-codex" || provider === "codex") {
    if (resolveCliBackendConfig("openai-codex", config)) {
      return "openai-codex";
    }
    return "codex-cli";
  }
  if (resolveCliBackendConfig("claude-cli", config)) {
    return "claude-cli";
  }
  if (resolveCliBackendConfig("codex-cli", config)) {
    return "codex-cli";
  }
  return provider;
}

async function emitAgentEvent(
  params: EmbeddedRunParams,
  stream: string,
  data: Record<string, unknown>,
) {
  await params.onAgentEvent?.({ stream, data });
}

export async function runEmbeddedPiAgent(...args: unknown[]): Promise<EmbeddedPiRunResult> {
  const params = args[0] as EmbeddedRunParams | undefined;
  if (!params || typeof params !== "object") {
    throw new Error("runEmbeddedPiAgent expected params object");
  }

  const provider = normalizeEmbeddedProvider(params.provider);
  const startedAt = Date.now();
  const runId = params.runId?.trim() || crypto.randomUUID();
  const timeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0 ? params.timeoutMs : 120_000;
  let assistantStarted = false;
  const streamTasks: Promise<void>[] = [];

  // --- Direct API path (no claude CLI needed) ---
  // If the provider is anthropic and we have a stored token credential,
  // call api.anthropic.com directly. This works with sk-ant-api01-* and sk-ant-oat01-* tokens.
  if (provider === "anthropic" || provider === "claude") {
    const store = loadAuthProfileStore();
    const profile =
      store.profiles["anthropic:default"] ??
      store.profiles[store.lastGood?.["anthropic"] ?? ""] ??
      null;
    const directToken =
      profile?.type === "token" ? profile.token
      : profile?.type === "oauth" ? profile.access
      : null;

    if (directToken) {
      await emitAgentEvent(params, "lifecycle", { phase: "start", startedAt });
      try {
        const result = await runAnthropicDirectAgent({
          token: directToken,
          sessionId: params.sessionId,
          sessionKey: params.sessionKey,
          agentId: params.agentId,
          sessionFile: params.sessionFile,
          workspaceDir: params.workspaceDir,
          config: params.config,
          prompt: params.prompt,
          model: params.model,
          thinkLevel: params.thinkLevel,
          timeoutMs,
          runId,
          extraSystemPrompt: params.extraSystemPrompt,
          ownerNumbers: params.ownerNumbers,
          onPartialReply: async (payload) => {
            if (!assistantStarted) {
              assistantStarted = true;
              await params.onAssistantMessageStart?.();
            }
            await params.onPartialReply?.(payload);
            await emitAgentEvent(params, "assistant", { text: payload.text });
          },
          onAssistantMessageStart: params.onAssistantMessageStart,
        });
        await emitAgentEvent(params, "lifecycle", {
          phase: "end",
          durationMs: Date.now() - startedAt,
          status: result.status,
        });
        return result;
      } catch (err) {
        await emitAgentEvent(params, "lifecycle", {
          phase: "error",
          error: String(err instanceof Error ? err.message : err),
        });
        throw err;
      }
    }
  }

  // --- CLI runner path (claude / codex binary required) ---
  const cliProvider = resolveCompatCliProvider(provider, params.config);
  const backend = resolveCliBackendConfig(cliProvider, params.config);
  if (!backend) {
    throw new Error(
      `No CLI backend available for provider "${provider}" (resolved "${cliProvider}").\n` +
      `Either:\n` +
      `  • Run: anima setup-token  (set an Anthropic API key — no CLI needed)\n` +
      `  • Install the matching CLI and log in`,
    );
  }

  await emitAgentEvent(params, "lifecycle", {
    phase: "start",
    startedAt,
  });

  try {
    const result = await runCliAgent({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      agentId: params.agentId,
      sessionFile: params.sessionFile,
      workspaceDir: params.workspaceDir,
      config: params.config,
      prompt: params.prompt,
      provider: cliProvider,
      model: params.model,
      thinkLevel: params.thinkLevel,
      timeoutMs,
      runId,
      extraSystemPrompt: params.extraSystemPrompt,
      ownerNumbers: params.ownerNumbers,
      images: params.images,
      onTextStream: (text) => {
        const nextText = text.trim();
        if (!nextText) {
          return;
        }
        const task = (async () => {
          if (!assistantStarted) {
            assistantStarted = true;
            await params.onAssistantMessageStart?.();
          }
          await params.onPartialReply?.({ text: nextText });
          await emitAgentEvent(params, "assistant", { text: nextText });
        })();
        streamTasks.push(task);
      },
    });

    if (streamTasks.length > 0) {
      await Promise.allSettled(streamTasks);
    }

    const finalText = result.payloads?.[0]?.text?.trim();
    if (finalText && !assistantStarted) {
      assistantStarted = true;
      await params.onAssistantMessageStart?.();
      await params.onPartialReply?.({ text: finalText });
      await emitAgentEvent(params, "assistant", { text: finalText });
    }

    await emitAgentEvent(params, "lifecycle", {
      phase: "end",
      startedAt,
      endedAt: Date.now(),
      aborted: false,
    });

    return {
      ...result,
      meta: {
        ...result.meta,
        agentMeta: {
          ...result.meta.agentMeta,
          provider,
          model: params.model?.trim() || result.meta.agentMeta?.model,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await emitAgentEvent(params, "lifecycle", {
      phase: "error",
      startedAt,
      endedAt: Date.now(),
      error: message,
    });
    throw error;
  }
}

export async function compactEmbeddedPiSession(
  ..._args: unknown[]
): Promise<EmbeddedPiCompactResult> {
  return {
    ok: true,
    compacted: false,
    reason: "cli-backend-noop",
  };
}

export function abortEmbeddedPiRun(..._args: unknown[]): boolean {
  return false;
}

export function isEmbeddedPiRunActive(..._args: unknown[]): boolean {
  return false;
}

export function isEmbeddedPiRunStreaming(..._args: unknown[]): boolean {
  return false;
}

export function queueEmbeddedPiMessage(..._args: unknown[]): boolean {
  return false;
}

export function resolveEmbeddedSessionLane(..._args: unknown[]): string {
  return "default";
}

export async function waitForEmbeddedPiRunEnd(..._args: unknown[]): Promise<boolean> {
  return true;
}
