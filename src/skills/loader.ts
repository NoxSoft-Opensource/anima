/**
 * Skill Loader — parses SKILL.md files with YAML frontmatter.
 *
 * Skills are Markdown files with YAML frontmatter that define
 * runnable capabilities. They live in two places:
 * - Bundled: {project}/skills/{name}/SKILL.md
 * - User: ~/.anima/skills/{name}/SKILL.md
 *
 * The frontmatter defines metadata (name, trigger, model, budget),
 * and the Markdown body is the prompt template.
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Skill {
  name: string;
  description: string;
  trigger: string; // pattern, e.g., "audit {platform}"
  model?: string;
  maxBudget?: number;
  timeout?: number;
  content: string; // the Markdown body (prompt)
  source: "bundled" | "user";
  filePath: string;
}

interface FrontmatterData {
  name?: string;
  description?: string;
  trigger?: string;
  model?: string;
  maxBudget?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a Markdown file.
 * Expects the file to start with `---\n` and have a closing `---\n`.
 */
function parseFrontmatter(raw: string): {
  frontmatter: FrontmatterData;
  body: string;
} {
  const trimmed = raw.trimStart();

  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: raw };
  }

  // Find the closing ---
  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: raw };
  }

  const yamlBlock = trimmed.slice(4, endIndex); // skip opening ---\n
  const body = trimmed.slice(endIndex + 4).trimStart(); // skip closing ---\n

  try {
    const parsed = parseYaml(yamlBlock) as FrontmatterData;
    return { frontmatter: parsed || {}, body };
  } catch {
    // Malformed YAML — treat as no frontmatter
    return { frontmatter: {}, body: raw };
  }
}

// ---------------------------------------------------------------------------
// SkillLoader
// ---------------------------------------------------------------------------

export class SkillLoader {
  /**
   * Load all skills from both bundled and user directories.
   *
   * User skills override bundled skills with the same name.
   */
  async loadAll(): Promise<Skill[]> {
    const bundledDir = this.getBundledDir();
    const userDir = this.getUserDir();

    const bundledSkills = await this.loadFromDirectory(bundledDir, "bundled");
    const userSkills = await this.loadFromDirectory(userDir, "user");

    // User skills override bundled skills with the same name
    const skillMap = new Map<string, Skill>();

    for (const skill of bundledSkills) {
      skillMap.set(skill.name, skill);
    }
    for (const skill of userSkills) {
      skillMap.set(skill.name, skill);
    }

    return Array.from(skillMap.values());
  }

  /**
   * Parse a single SKILL.md file into a Skill object.
   */
  async parseSkill(filePath: string, source: "bundled" | "user"): Promise<Skill> {
    const raw = await readFile(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);

    // Name is required — fall back to filename
    const name = frontmatter.name || filePath.split("/").slice(-2, -1)[0] || "unknown";

    return {
      name,
      description: frontmatter.description || "",
      trigger: frontmatter.trigger || name,
      model: frontmatter.model,
      maxBudget: frontmatter.maxBudget,
      timeout: frontmatter.timeout,
      content: body,
      source,
      filePath,
    };
  }

  /**
   * Find a skill matching a trigger pattern.
   *
   * Triggers use `{param}` syntax for positional parameters.
   * Example: trigger "audit {platform}" matches "audit bynd"
   * and produces params: { platform: "bynd" }
   */
  findByTrigger(
    input: string,
    skills: Skill[],
  ): { skill: Skill; params: Record<string, string> } | null {
    const normalizedInput = input.trim().toLowerCase();

    for (const skill of skills) {
      const result = matchTrigger(skill.trigger, normalizedInput);
      if (result) {
        return { skill, params: result };
      }
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Get the bundled skills directory (relative to this source file).
   */
  private getBundledDir(): string {
    return join(__dirname, "..", "..", "skills");
  }

  /**
   * Get the user skills directory.
   */
  private getUserDir(): string {
    return join(homedir(), ".anima", "skills");
  }

  /**
   * Load all skills from a directory.
   * Each skill is in a subdirectory with a SKILL.md file.
   */
  private async loadFromDirectory(dir: string, source: "bundled" | "user"): Promise<Skill[]> {
    if (!existsSync(dir)) return [];

    const skills: Skill[] = [];

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    for (const entry of entries) {
      const skillFile = join(dir, entry, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      try {
        const skill = await this.parseSkill(skillFile, source);
        skills.push(skill);
      } catch {
        // Skip unparseable skills
      }
    }

    return skills;
  }
}

// ---------------------------------------------------------------------------
// Trigger matching
// ---------------------------------------------------------------------------

/**
 * Match an input string against a trigger pattern.
 *
 * Pattern: "audit {platform}" matches "audit bynd"
 * Returns: { platform: "bynd" } on match, null on no match.
 */
function matchTrigger(trigger: string, input: string): Record<string, string> | null {
  const normalizedTrigger = trigger.trim().toLowerCase();

  // Build a regex from the trigger pattern
  // Replace {param} with named capture groups, escaping regex-special chars in literals
  const paramNames: string[] = [];
  const regexStr = normalizedTrigger.replace(/\{(\w+)\}|[^{]+/g, (match, paramName?: string) => {
    if (paramName) {
      paramNames.push(paramName);
      return "(.+?)";
    }
    // Escape regex special characters in literal parts of the trigger
    return match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });

  // Anchor the regex
  const regex = new RegExp(`^${regexStr}$`);
  const match = regex.exec(input);

  if (!match) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    params[paramNames[i]!] = match[i + 1]!.trim();
  }

  return params;
}
