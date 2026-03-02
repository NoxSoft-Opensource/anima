/**
 * Soul Memory Tier — wraps the identity loader
 *
 * Reads the 7-component identity from ~/.anima/soul/:
 * SOUL, HEART, BRAIN, GUT, SPIRIT, SHADOW, MEMORY
 *
 * These are permanent and NEVER auto-modified. Changes only happen
 * through explicit identity operations with approval.
 */

import type { TieredMemoryEntry } from "../types.js";
import {
  loadIdentity,
  loadSingleComponent,
  IDENTITY_COMPONENTS,
  type Identity,
  type IdentityComponent,
} from "../../identity/loader.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("soul-memory");

export interface SoulSuggestion {
  component: IdentityComponent;
  suggestion: string;
  reason: string;
  createdAt: Date;
}

export class SoulMemory {
  private identity: Identity | null = null;
  private readonly pendingSuggestions: SoulSuggestion[] = [];

  /**
   * Load (or reload) the full 7-component identity.
   */
  async load(): Promise<Identity> {
    this.identity = await loadIdentity();
    log.info(
      `loaded identity (${Object.entries(this.identity.loadedFrom)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ")})`,
    );
    return this.identity;
  }

  /**
   * Get a single identity component by name.
   * Loads identity if not already loaded.
   */
  async getComponent(name: IdentityComponent): Promise<string> {
    return loadSingleComponent(name);
  }

  /**
   * Search across all identity components by substring (case-insensitive).
   * Returns matching components as TieredMemoryEntry objects.
   */
  async search(query: string): Promise<TieredMemoryEntry[]> {
    if (!this.identity) {
      await this.load();
    }
    if (!this.identity) {
      return [];
    }

    const lower = query.toLowerCase();
    const results: TieredMemoryEntry[] = [];

    for (const component of IDENTITY_COMPONENTS) {
      const content = this.identity[component.toLowerCase() as keyof Identity];
      if (typeof content !== "string") {
        continue;
      }
      if (content.toLowerCase().includes(lower)) {
        results.push({
          id: `soul:${component}`,
          tier: "soul",
          content,
          topics: ["identity", component.toLowerCase()],
          createdAt: this.identity.loadedAt,
          lastAccessedAt: new Date(),
          accessCount: 0,
          relevanceScore: 1.0, // Soul entries always have max relevance
          metadata: {
            component,
            source: this.identity.loadedFrom[component],
          },
        });
      }
    }

    return results;
  }

  /**
   * Get all identity components as TieredMemoryEntry objects.
   */
  async getAll(): Promise<TieredMemoryEntry[]> {
    if (!this.identity) {
      await this.load();
    }
    if (!this.identity) {
      return [];
    }

    const entries: TieredMemoryEntry[] = [];
    for (const component of IDENTITY_COMPONENTS) {
      const content = this.identity[component.toLowerCase() as keyof Identity];
      if (typeof content !== "string") {
        continue;
      }
      entries.push({
        id: `soul:${component}`,
        tier: "soul",
        content,
        topics: ["identity", component.toLowerCase()],
        createdAt: this.identity.loadedAt,
        lastAccessedAt: new Date(),
        accessCount: 0,
        relevanceScore: 1.0,
        metadata: {
          component,
          source: this.identity.loadedFrom[component],
        },
      });
    }

    return entries;
  }

  /**
   * Suggest an update to an identity component.
   * This NEVER auto-modifies — it only queues a suggestion for explicit approval.
   */
  suggestUpdate(component: IdentityComponent, suggestion: string, reason: string): SoulSuggestion {
    const entry: SoulSuggestion = {
      component,
      suggestion,
      reason,
      createdAt: new Date(),
    };
    this.pendingSuggestions.push(entry);
    log.info(`queued soul suggestion for ${component}: ${reason}`);
    return entry;
  }

  /**
   * Get all pending suggestions for identity updates.
   */
  getPendingSuggestions(): SoulSuggestion[] {
    return [...this.pendingSuggestions];
  }

  /**
   * Clear pending suggestions (after they've been reviewed).
   */
  clearSuggestions(): void {
    this.pendingSuggestions.length = 0;
  }

  /**
   * Get the list of all component names.
   */
  getComponentNames(): readonly IdentityComponent[] {
    return IDENTITY_COMPONENTS;
  }

  /**
   * Check if identity has been loaded.
   */
  isLoaded(): boolean {
    return this.identity !== null;
  }
}
