/**
 * Evaluation Store — persists session evaluations as JSON files.
 *
 * Storage: ~/.anima/memory/evaluations/YYYY-MM-DD/{sessionId}.json
 *
 * Provides retrieval by session ID, date range, and aggregate scoring.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionEvaluation } from "./critic.js";

export class EvaluationStore {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || join(homedir(), ".anima", "memory", "evaluations");
  }

  /**
   * Save an evaluation to disk.
   * Directory structure: {basePath}/YYYY-MM-DD/{sessionId}.json
   */
  async save(evaluation: SessionEvaluation): Promise<void> {
    const dateDir = evaluation.timestamp.toISOString().split("T")[0];
    const dir = join(this.basePath, dateDir);
    await mkdir(dir, { recursive: true });

    const filePath = join(dir, `${evaluation.sessionId}.json`);
    const serializable = {
      ...evaluation,
      timestamp: evaluation.timestamp.toISOString(),
    };
    await writeFile(filePath, JSON.stringify(serializable, null, 2), "utf-8");
  }

  /**
   * Get evaluations from the last N days.
   */
  async getRecent(days: number): Promise<SessionEvaluation[]> {
    const evaluations: SessionEvaluation[] = [];
    const now = Date.now();

    let dateDirs: string[];
    try {
      dateDirs = await readdir(this.basePath);
    } catch {
      return [];
    }

    const cutoff = new Date(now - days * 86_400_000);

    for (const dateDir of dateDirs.toSorted().toReversed()) {
      // Quick check: date string comparison
      if (dateDir < cutoff.toISOString().split("T")[0]) {
        break;
      }

      const dirPath = join(this.basePath, dateDir);
      let files: string[];
      try {
        files = await readdir(dirPath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".json")) {
          continue;
        }
        try {
          const content = await readFile(join(dirPath, file), "utf-8");
          const parsed = JSON.parse(content) as Record<string, unknown>;
          evaluations.push(deserializeEvaluation(parsed));
        } catch {
          // Skip corrupt files
        }
      }
    }

    return evaluations;
  }

  /**
   * Get an evaluation by session ID.
   * Scans date directories in reverse order (most recent first).
   */
  async getBySession(sessionId: string): Promise<SessionEvaluation | null> {
    let dateDirs: string[];
    try {
      dateDirs = await readdir(this.basePath);
    } catch {
      return null;
    }

    for (const dateDir of dateDirs.toSorted().toReversed()) {
      const filePath = join(this.basePath, dateDir, `${sessionId}.json`);
      if (!existsSync(filePath)) {
        continue;
      }

      try {
        const content = await readFile(filePath, "utf-8");
        const parsed = JSON.parse(content) as Record<string, unknown>;
        return deserializeEvaluation(parsed);
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Get all evaluations across all dates.
   */
  async getAll(): Promise<SessionEvaluation[]> {
    let dateDirs: string[];
    try {
      dateDirs = await readdir(this.basePath);
    } catch {
      return [];
    }

    const evaluations: SessionEvaluation[] = [];

    for (const dateDir of dateDirs.toSorted()) {
      const dirPath = join(this.basePath, dateDir);
      let files: string[];
      try {
        files = await readdir(dirPath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".json")) {
          continue;
        }
        try {
          const content = await readFile(join(dirPath, file), "utf-8");
          const parsed = JSON.parse(content) as Record<string, unknown>;
          evaluations.push(deserializeEvaluation(parsed));
        } catch {
          // Skip corrupt files
        }
      }
    }

    return evaluations;
  }

  /**
   * Get average overall score over the last N days.
   * Returns 0 if no evaluations found.
   */
  async getAverageScore(days: number): Promise<number> {
    const evaluations = await this.getRecent(days);
    if (evaluations.length === 0) {
      return 0;
    }

    const total = evaluations.reduce((sum, evaluation) => sum + evaluation.overallScore, 0);
    return total / evaluations.length;
  }
}

/**
 * Deserialize a JSON-parsed evaluation back into proper types.
 */
function deserializeEvaluation(raw: Record<string, unknown>): SessionEvaluation {
  return {
    sessionId: raw["sessionId"] as string,
    timestamp: new Date(raw["timestamp"] as string),
    taskSuccess: raw["taskSuccess"] as boolean,
    exitCode: raw["exitCode"] as number,
    durationMs: raw["durationMs"] as number,
    expectedDurationMs: raw["expectedDurationMs"] as number | undefined,
    costUsd: raw["costUsd"] as number,
    budgetUsd: raw["budgetUsd"] as number,
    efficiencyScore: raw["efficiencyScore"] as number,
    shadowPatterns: (raw["shadowPatterns"] || []) as SessionEvaluation["shadowPatterns"],
    errorsEncountered: (raw["errorsEncountered"] || []) as string[],
    patternsDiscovered: (raw["patternsDiscovered"] || []) as string[],
    overallScore: raw["overallScore"] as number,
    notes: raw["notes"] as string,
  };
}
