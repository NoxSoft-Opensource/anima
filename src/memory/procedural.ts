/**
 * Procedural Memory — stored workflows and procedures
 *
 * Captures "how to do things" — repeatable procedures, deployment workflows,
 * debugging runbooks, etc. Each procedure has triggers (context patterns
 * that indicate when to use it) and a usage counter for tracking relevance.
 *
 * Stored as Markdown files in ~/.anima/memory/procedural/.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("procedural-memory");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Procedure {
  id: string;
  name: string;
  description: string;
  steps: string[]; // Markdown steps
  triggers: string[]; // When to use this procedure
  lastUsed: Date;
  useCount: number;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultBasePath(): string {
  return path.join(os.homedir(), ".anima", "memory", "procedural");
}

function procedureFilePath(basePath: string, id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(basePath, `${safeId}.md`);
}

function formatProcedureMarkdown(proc: Procedure): string {
  const lines = [
    `# ${proc.name}`,
    "",
    `- **ID:** ${proc.id}`,
    `- **Use Count:** ${proc.useCount}`,
    `- **Last Used:** ${proc.lastUsed.toISOString()}`,
    `- **Created:** ${proc.createdAt.toISOString()}`,
    "",
    "## Description",
    "",
    proc.description,
    "",
    "## Triggers",
    "",
    ...proc.triggers.map((t) => `- ${t}`),
    "",
    "## Steps",
    "",
    ...proc.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
  ];
  return lines.join("\n");
}

function parseProcedureMarkdown(content: string, filePath: string): Procedure | null {
  const lines = content.split("\n");
  const nameMatch = lines[0]?.match(/^#\s+(.+)$/);
  if (!nameMatch) {
    return null;
  }
  const name = nameMatch[1].trim();

  let id = path.basename(filePath, ".md");
  let useCount = 0;
  let lastUsed = new Date(0);
  let createdAt = new Date();

  for (const line of lines) {
    const idMatch = line.match(/^\s*-\s*\*\*ID:\*\*\s*(.+)$/);
    if (idMatch) {
      id = idMatch[1].trim();
    }
    const ucMatch = line.match(/^\s*-\s*\*\*Use Count:\*\*\s*(.+)$/);
    if (ucMatch) {
      const parsed = parseInt(ucMatch[1].trim(), 10);
      if (Number.isFinite(parsed)) {
        useCount = parsed;
      }
    }
    const luMatch = line.match(/^\s*-\s*\*\*Last Used:\*\*\s*(.+)$/);
    if (luMatch) {
      try {
        lastUsed = new Date(luMatch[1].trim());
      } catch {
        // keep default
      }
    }
    const caMatch = line.match(/^\s*-\s*\*\*Created:\*\*\s*(.+)$/);
    if (caMatch) {
      try {
        createdAt = new Date(caMatch[1].trim());
      } catch {
        // keep default
      }
    }
  }

  // Parse description (between "## Description" and next "##")
  const description = extractSection(lines, "Description");

  // Parse triggers (list items under "## Triggers")
  const triggersRaw = extractSection(lines, "Triggers");
  const triggers = triggersRaw
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);

  // Parse steps (numbered list under "## Steps")
  const stepsRaw = extractSection(lines, "Steps");
  const steps = stepsRaw
    .split("\n")
    .map((l) => l.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);

  return { id, name, description, steps, triggers, lastUsed, useCount, createdAt };
}

function extractSection(lines: string[], heading: string): string {
  const startIndex = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (startIndex < 0) {
    return "";
  }
  const contentLines: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      break;
    }
    contentLines.push(lines[i]);
  }
  return contentLines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// ProceduralMemory
// ---------------------------------------------------------------------------

export class ProceduralMemory {
  private readonly basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? defaultBasePath();
  }

  /**
   * Store a procedure. Overwrites if an entry with the same ID exists.
   */
  async store(procedure: Procedure): Promise<void> {
    const proc = { ...procedure, id: procedure.id || randomUUID() };
    const filePath = procedureFilePath(this.basePath, proc.id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, formatProcedureMarkdown(proc), "utf-8");
    log.info(`stored procedure ${proc.id}: ${proc.name}`);
  }

  /**
   * Find procedures whose triggers match a given context string.
   * A trigger matches if the context contains the trigger text
   * (case-insensitive substring match).
   */
  async findByTrigger(context: string): Promise<Procedure[]> {
    const lower = context.toLowerCase();
    const all = await this.listAll();
    return all.filter((proc) =>
      proc.triggers.some((trigger) => lower.includes(trigger.toLowerCase())),
    );
  }

  /**
   * Record that a procedure was used. Increments useCount and updates
   * lastUsed timestamp.
   */
  async recordUsage(id: string): Promise<void> {
    const proc = await this.findById(id);
    if (!proc) {
      log.warn(`cannot record usage: procedure ${id} not found`);
      return;
    }
    proc.useCount += 1;
    proc.lastUsed = new Date();
    await this.store(proc);
    log.info(`recorded usage for procedure ${id} (count: ${proc.useCount})`);
  }

  /**
   * Get procedures that haven't been used in the last N days.
   */
  async getStale(daysThreshold: number): Promise<Procedure[]> {
    const cutoff = new Date(Date.now() - daysThreshold * 86_400_000);
    const all = await this.listAll();
    return all.filter((proc) => proc.lastUsed < cutoff);
  }

  /**
   * Find a single procedure by ID.
   */
  async findById(id: string): Promise<Procedure | null> {
    const filePath = procedureFilePath(this.basePath, id);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return parseProcedureMarkdown(content, filePath);
    } catch {
      return null;
    }
  }

  /**
   * List all stored procedures.
   */
  async listAll(): Promise<Procedure[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.basePath);
    } catch {
      return [];
    }

    const procedures: Procedure[] = [];
    for (const file of files) {
      if (!file.endsWith(".md")) {
        continue;
      }
      const filePath = path.join(this.basePath, file);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const proc = parseProcedureMarkdown(content, filePath);
        if (proc) {
          procedures.push(proc);
        }
      } catch (err) {
        log.warn(`failed to read procedure ${file}: ${String(err)}`);
      }
    }

    return procedures;
  }

  /**
   * Delete a procedure by ID.
   */
  async delete(id: string): Promise<boolean> {
    const filePath = procedureFilePath(this.basePath, id);
    try {
      await fs.unlink(filePath);
      log.info(`deleted procedure ${id}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the base path where procedures are stored.
   */
  getBasePath(): string {
    return this.basePath;
  }
}
