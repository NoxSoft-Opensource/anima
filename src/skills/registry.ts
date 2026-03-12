/**
 * Skill Registry — manages loaded skills and trigger matching.
 *
 * Provides a central place to initialize, list, look up, and match
 * skills by name or trigger pattern. Built on the SkillLoader.
 */

import type { Skill } from "./loader.js";
import { SkillLoader } from "./loader.js";

export class SkillRegistry {
  private skills: Skill[] = [];
  private loader: SkillLoader;
  private initialized = false;

  constructor(loader?: SkillLoader) {
    this.loader = loader || new SkillLoader();
  }

  /**
   * Initialize the registry by loading all skills.
   * Loads from both bundled and user directories.
   */
  async initialize(): Promise<void> {
    this.skills = await this.loader.loadAll();
    this.initialized = true;
  }

  /**
   * Get all registered skills.
   */
  list(): Skill[] {
    return [...this.skills];
  }

  /**
   * Get a skill by name.
   */
  get(name: string): Skill | null {
    return this.skills.find((s) => s.name === name) || null;
  }

  /**
   * Match an input string against all skill triggers.
   *
   * Returns the matching skill and extracted parameters, or null.
   * Example: input "audit bynd" matches skill with trigger "audit {platform}"
   * and returns params: { platform: "bynd" }
   */
  match(input: string): { skill: Skill; params: Record<string, string> } | null {
    return this.loader.findByTrigger(input, this.skills);
  }

  /**
   * Check if the registry has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the count of loaded skills.
   */
  count(): number {
    return this.skills.length;
  }

  /**
   * Reload all skills (useful after adding new skill files).
   */
  async reload(): Promise<void> {
    await this.initialize();
  }
}
