/**
 * Sub-Agent Orchestrator — fan-out and pipeline patterns for parallel work.
 *
 * fanOut: spawn multiple independent sessions in parallel
 * pipeline: chain sessions sequentially, passing output as context
 */

import type { SessionResult, SpawnOptions } from "./spawner.js";
import { loadIdentity } from "../identity/loader.js";
import { buildTaskPrompt } from "../identity/prompt-builder.js";
import { spawnSession } from "./spawner.js";

export interface SubAgentTask {
  name: string;
  description: string;
  workingDirectory?: string;
  model?: string;
  maxBudgetUsd?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  dangerouslySkipPermissions?: boolean;
}

export interface FanOutResult {
  tasks: Array<{
    name: string;
    result: SessionResult;
  }>;
  totalDurationMs: number;
  totalCostUsd: number;
  allSucceeded: boolean;
}

export interface PipelineStage {
  name: string;
  description: string;
  /** Transform the previous stage's output into context for this stage */
  contextTransform?: (previousOutput: string) => string;
  workingDirectory?: string;
  model?: string;
  maxBudgetUsd?: number;
  timeoutMs?: number;
  allowedTools?: string[];
  dangerouslySkipPermissions?: boolean;
}

export interface PipelineResult {
  stages: Array<{
    name: string;
    result: SessionResult;
  }>;
  finalOutput: string;
  totalDurationMs: number;
  totalCostUsd: number;
  failedAt?: string;
}

/**
 * Fan out multiple independent tasks in parallel.
 *
 * Each sub-agent gets identity context but with a focused task scope.
 * All tasks run simultaneously via Promise.all.
 */
export async function fanOut(tasks: SubAgentTask[]): Promise<FanOutResult> {
  const startTime = Date.now();
  const identity = await loadIdentity();

  const promises = tasks.map(async (task) => {
    const systemPrompt = buildTaskPrompt(identity, {
      taskDescription: task.description,
      workingDirectory: task.workingDirectory,
    });

    const spawnOpts: SpawnOptions = {
      prompt: task.description,
      systemPrompt,
      model: task.model,
      maxBudgetUsd: task.maxBudgetUsd || 10,
      timeoutMs: task.timeoutMs || 600_000,
      workingDirectory: task.workingDirectory,
      allowedTools: task.allowedTools,
      dangerouslySkipPermissions: task.dangerouslySkipPermissions,
      outputFormat: "json",
    };

    const result = await spawnSession(spawnOpts);
    return { name: task.name, result };
  });

  const results = await Promise.all(promises);

  const totalCostUsd = results.reduce((sum, r) => sum + (r.result.costUsd || 0), 0);
  const allSucceeded = results.every((r) => r.result.status === "completed");

  return {
    tasks: results,
    totalDurationMs: Date.now() - startTime,
    totalCostUsd,
    allSucceeded,
  };
}

/**
 * Run tasks sequentially as a pipeline, passing output as context.
 *
 * Each stage receives the previous stage's output as additional context.
 * If a stage fails, the pipeline stops and returns the partial result.
 */
export async function pipeline(stages: PipelineStage[]): Promise<PipelineResult> {
  const startTime = Date.now();
  const identity = await loadIdentity();
  const completedStages: Array<{ name: string; result: SessionResult }> = [];
  let previousOutput = "";
  let totalCostUsd = 0;

  for (const stage of stages) {
    // Build context from previous stage
    const additionalContext = previousOutput
      ? stage.contextTransform
        ? stage.contextTransform(previousOutput)
        : `## Previous Stage Output\n\n${previousOutput}`
      : undefined;

    const systemPrompt = buildTaskPrompt(identity, {
      taskDescription: stage.description,
      workingDirectory: stage.workingDirectory,
      additionalContext,
    });

    const spawnOpts: SpawnOptions = {
      prompt: stage.description,
      systemPrompt,
      model: stage.model,
      maxBudgetUsd: stage.maxBudgetUsd || 10,
      timeoutMs: stage.timeoutMs || 600_000,
      workingDirectory: stage.workingDirectory,
      allowedTools: stage.allowedTools,
      dangerouslySkipPermissions: stage.dangerouslySkipPermissions,
      outputFormat: "json",
    };

    const result = await spawnSession(spawnOpts);
    completedStages.push({ name: stage.name, result });
    totalCostUsd += result.costUsd || 0;

    if (result.status !== "completed") {
      return {
        stages: completedStages,
        finalOutput: result.output,
        totalDurationMs: Date.now() - startTime,
        totalCostUsd,
        failedAt: stage.name,
      };
    }

    previousOutput = result.output;
  }

  return {
    stages: completedStages,
    finalOutput: previousOutput,
    totalDurationMs: Date.now() - startTime,
    totalCostUsd,
  };
}
