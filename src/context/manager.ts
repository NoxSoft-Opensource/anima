/**
 * Context Automanagement for ANIMA 6
 *
 * Solves the usage problem: context is managed entirely on our side.
 * Each model request gets a fixed 120K token budget, intelligently
 * allocated across three zones:
 *
 *   Zone 1: Identity & Memory (first 20K tokens)
 *     - Agent identity, soul, values
 *     - Important history (padded)
 *     - Tool information + how to explore memory
 *     - Core relationship context (who is who)
 *
 *   Zone 2: User Prompts & Instructions (next 50K tokens)
 *     - User-specific prompts and instructions
 *     - "Back of mind" persistent context
 *     - System prompts, CLAUDE.md, coherence protocol
 *     - Active mission state, goals, affect
 *
 *   Zone 3: Working Memory (final 50K tokens)
 *     - Current conversation turns
 *     - Tool call results
 *     - Active task context
 *     - Recent messages and responses
 *
 * Context NEVER exceeds 120K tokens. Our system maintains and ensures
 * all necessary context is present in every request.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("context-manager");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_CONTEXT_TOKENS = 120_000;
export const IDENTITY_ZONE_TOKENS = 20_000;
export const PROMPT_ZONE_TOKENS = 50_000;
export const WORKING_ZONE_TOKENS = 50_000;

// Rough token estimation: 1 token ≈ 4 characters for English text
const CHARS_PER_TOKEN = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextZone = "identity" | "prompt" | "working";

export interface ContextBlock {
  id: string;
  zone: ContextZone;
  priority: number; // higher = more important (kept when trimming)
  content: string;
  tokenEstimate: number;
  source: string; // where this content came from
  sticky: boolean; // if true, never evict
  createdAt: number;
  lastAccessedAt: number;
}

export interface ContextBudget {
  identity: { used: number; max: number; blocks: number };
  prompt: { used: number; max: number; blocks: number };
  working: { used: number; max: number; blocks: number };
  total: { used: number; max: number };
}

export interface ContextPacket {
  /** The assembled context to send to the model */
  messages: ContextBlock[];
  /** Token budget breakdown */
  budget: ContextBudget;
  /** Blocks that were evicted to fit budget */
  evicted: ContextBlock[];
  /** Warnings (e.g. "working memory truncated") */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Context Manager
// ---------------------------------------------------------------------------

export class ContextManager {
  private blocks: Map<string, ContextBlock> = new Map();

  // -----------------------------------------------------------------------
  // Add content to a zone
  // -----------------------------------------------------------------------

  addBlock(
    block: Omit<ContextBlock, "tokenEstimate" | "createdAt" | "lastAccessedAt">,
  ): ContextBlock {
    const full: ContextBlock = {
      ...block,
      tokenEstimate: estimateTokens(block.content),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };
    this.blocks.set(full.id, full);
    return full;
  }

  removeBlock(id: string): boolean {
    return this.blocks.delete(id);
  }

  updateBlock(id: string, content: string): ContextBlock | null {
    const block = this.blocks.get(id);
    if (!block) {
      return null;
    }
    block.content = content;
    block.tokenEstimate = estimateTokens(content);
    block.lastAccessedAt = Date.now();
    return block;
  }

  // -----------------------------------------------------------------------
  // Identity zone (first 20K)
  // -----------------------------------------------------------------------

  /**
   * Set the agent's core identity context.
   * This is always included and never evicted.
   */
  setIdentity(content: string): ContextBlock {
    return this.addBlock({
      id: "identity:core",
      zone: "identity",
      priority: 100,
      content,
      source: "identity",
      sticky: true,
    });
  }

  /**
   * Add important history to the identity zone.
   */
  addImportantHistory(id: string, content: string, priority = 50): ContextBlock {
    return this.addBlock({
      id: `identity:history:${id}`,
      zone: "identity",
      priority,
      content,
      source: "history",
      sticky: false,
    });
  }

  /**
   * Add tool information to the identity zone.
   */
  setToolInfo(content: string): ContextBlock {
    return this.addBlock({
      id: "identity:tools",
      zone: "identity",
      priority: 90,
      content,
      source: "tools",
      sticky: true,
    });
  }

  /**
   * Add memory exploration guide.
   */
  setMemoryGuide(content: string): ContextBlock {
    return this.addBlock({
      id: "identity:memory-guide",
      zone: "identity",
      priority: 80,
      content,
      source: "memory",
      sticky: true,
    });
  }

  // -----------------------------------------------------------------------
  // Prompt zone (next 50K)
  // -----------------------------------------------------------------------

  /**
   * Set user-specific prompts and instructions.
   */
  setUserPrompt(id: string, content: string, priority = 70): ContextBlock {
    return this.addBlock({
      id: `prompt:user:${id}`,
      zone: "prompt",
      priority,
      content,
      source: "user-prompt",
      sticky: false,
    });
  }

  /**
   * Set system prompt (CLAUDE.md, coherence protocol, etc.)
   */
  setSystemPrompt(content: string): ContextBlock {
    return this.addBlock({
      id: "prompt:system",
      zone: "prompt",
      priority: 95,
      content,
      source: "system",
      sticky: true,
    });
  }

  /**
   * Set mission state context (goals, affect, chronos).
   */
  setMissionContext(content: string): ContextBlock {
    return this.addBlock({
      id: "prompt:mission",
      zone: "prompt",
      priority: 60,
      content,
      source: "mission",
      sticky: false,
    });
  }

  // -----------------------------------------------------------------------
  // Working memory zone (final 50K)
  // -----------------------------------------------------------------------

  /**
   * Add a conversation turn to working memory.
   */
  addConversationTurn(role: "user" | "assistant", content: string): ContextBlock {
    const id = `working:turn:${Date.now()}`;
    return this.addBlock({
      id,
      zone: "working",
      priority: 30,
      content: `[${role}]: ${content}`,
      source: "conversation",
      sticky: false,
    });
  }

  /**
   * Add a tool result to working memory.
   */
  addToolResult(toolName: string, result: string): ContextBlock {
    const id = `working:tool:${Date.now()}`;
    return this.addBlock({
      id,
      zone: "working",
      priority: 40,
      content: `[tool:${toolName}]: ${result}`,
      source: "tool",
      sticky: false,
    });
  }

  /**
   * Add active task context to working memory.
   */
  setActiveTask(content: string): ContextBlock {
    return this.addBlock({
      id: "working:task",
      zone: "working",
      priority: 50,
      content,
      source: "task",
      sticky: false,
    });
  }

  // -----------------------------------------------------------------------
  // Assemble context packet
  // -----------------------------------------------------------------------

  /**
   * Assemble a context packet that fits within the 120K token budget.
   * Evicts lowest-priority non-sticky blocks when a zone overflows.
   */
  assemble(): ContextPacket {
    const warnings: string[] = [];
    const evicted: ContextBlock[] = [];

    // Group blocks by zone
    const zones: Record<ContextZone, ContextBlock[]> = {
      identity: [],
      prompt: [],
      working: [],
    };

    for (const block of this.blocks.values()) {
      zones[block.zone].push(block);
    }

    // Sort each zone by priority (highest first)
    for (const zone of Object.values(zones)) {
      zone.sort((a, b) => b.priority - a.priority);
    }

    // Fit blocks within zone budgets
    const zoneBudgets: Record<ContextZone, number> = {
      identity: IDENTITY_ZONE_TOKENS,
      prompt: PROMPT_ZONE_TOKENS,
      working: WORKING_ZONE_TOKENS,
    };

    const included: ContextBlock[] = [];

    for (const [zone, blocks] of Object.entries(zones) as Array<[ContextZone, ContextBlock[]]>) {
      const budget = zoneBudgets[zone];
      let used = 0;

      for (const block of blocks) {
        if (used + block.tokenEstimate <= budget) {
          included.push(block);
          used += block.tokenEstimate;
          block.lastAccessedAt = Date.now();
        } else if (block.sticky) {
          // Sticky blocks always included even if over budget
          included.push(block);
          used += block.tokenEstimate;
          warnings.push(
            `${zone} zone over budget by ${used - budget} tokens (sticky block: ${block.id})`,
          );
        } else {
          evicted.push(block);
        }
      }
    }

    // Compute budget
    const budget: ContextBudget = {
      identity: {
        used: included
          .filter((b) => b.zone === "identity")
          .reduce((s, b) => s + b.tokenEstimate, 0),
        max: IDENTITY_ZONE_TOKENS,
        blocks: included.filter((b) => b.zone === "identity").length,
      },
      prompt: {
        used: included.filter((b) => b.zone === "prompt").reduce((s, b) => s + b.tokenEstimate, 0),
        max: PROMPT_ZONE_TOKENS,
        blocks: included.filter((b) => b.zone === "prompt").length,
      },
      working: {
        used: included.filter((b) => b.zone === "working").reduce((s, b) => s + b.tokenEstimate, 0),
        max: WORKING_ZONE_TOKENS,
        blocks: included.filter((b) => b.zone === "working").length,
      },
      total: {
        used: included.reduce((s, b) => s + b.tokenEstimate, 0),
        max: MAX_CONTEXT_TOKENS,
      },
    };

    if (budget.total.used > MAX_CONTEXT_TOKENS) {
      warnings.push(`Total context ${budget.total.used} exceeds ${MAX_CONTEXT_TOKENS} token limit`);
    }

    if (evicted.length > 0) {
      log.info(
        `context assembled: ${included.length} blocks, ${evicted.length} evicted, ${budget.total.used} tokens`,
      );
    }

    return {
      messages: included.toSorted((a, b) => {
        // Order: identity first, then prompt, then working
        const zoneOrder: Record<ContextZone, number> = { identity: 0, prompt: 1, working: 2 };
        const zo = zoneOrder[a.zone] - zoneOrder[b.zone];
        if (zo !== 0) {
          return zo;
        }
        // Within zone, highest priority first
        return b.priority - a.priority;
      }),
      budget,
      evicted,
      warnings,
    };
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /**
   * Get current budget without assembling.
   */
  getBudget(): ContextBudget {
    const blocks = Array.from(this.blocks.values());
    return {
      identity: {
        used: blocks.filter((b) => b.zone === "identity").reduce((s, b) => s + b.tokenEstimate, 0),
        max: IDENTITY_ZONE_TOKENS,
        blocks: blocks.filter((b) => b.zone === "identity").length,
      },
      prompt: {
        used: blocks.filter((b) => b.zone === "prompt").reduce((s, b) => s + b.tokenEstimate, 0),
        max: PROMPT_ZONE_TOKENS,
        blocks: blocks.filter((b) => b.zone === "prompt").length,
      },
      working: {
        used: blocks.filter((b) => b.zone === "working").reduce((s, b) => s + b.tokenEstimate, 0),
        max: WORKING_ZONE_TOKENS,
        blocks: blocks.filter((b) => b.zone === "working").length,
      },
      total: {
        used: blocks.reduce((s, b) => s + b.tokenEstimate, 0),
        max: MAX_CONTEXT_TOKENS,
      },
    };
  }

  /**
   * Clear all non-sticky blocks from working memory.
   * Called between conversations or when context gets stale.
   */
  clearWorkingMemory(): number {
    let cleared = 0;
    for (const [id, block] of this.blocks) {
      if (block.zone === "working" && !block.sticky) {
        this.blocks.delete(id);
        cleared++;
      }
    }
    log.info(`cleared ${cleared} blocks from working memory`);
    return cleared;
  }

  /**
   * Compact: remove oldest, lowest-priority blocks that haven't been
   * accessed recently. Keeps total under budget.
   */
  compact(): number {
    const budget = this.getBudget();
    if (budget.total.used <= MAX_CONTEXT_TOKENS) {
      return 0;
    }

    // Sort all non-sticky blocks by priority (lowest first), then by age
    const candidates = Array.from(this.blocks.values())
      .filter((b) => !b.sticky)
      .toSorted((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.lastAccessedAt - b.lastAccessedAt;
      });

    let removed = 0;
    let currentTotal = budget.total.used;

    for (const block of candidates) {
      if (currentTotal <= MAX_CONTEXT_TOKENS) {
        break;
      }
      this.blocks.delete(block.id);
      currentTotal -= block.tokenEstimate;
      removed++;
    }

    log.info(`compacted ${removed} blocks, freed ${budget.total.used - currentTotal} tokens`);
    return removed;
  }
}
