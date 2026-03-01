/**
 * Skill Runner — runs a matched skill via the session orchestrator.
 *
 * Takes a skill definition and extracted parameters, builds the
 * final prompt by interpolating parameters into the skill template,
 * and spawns a session to run it.
 */

import type { Skill } from './loader.js'
import type { SessionOrchestrator } from '../sessions/orchestrator.js'
import type { SessionResult } from '../sessions/spawner.js'

export class SkillExecutor {
  /**
   * Run a matched skill.
   *
   * Builds the prompt from the skill template, interpolates parameters,
   * and spawns a task session via the orchestrator.
   */
  async run(
    skill: Skill,
    params: Record<string, string>,
    orchestrator: SessionOrchestrator,
  ): Promise<SessionResult> {
    const prompt = this.buildPrompt(skill, params)

    return orchestrator.executeTask({
      taskDescription: prompt,
      additionalContext: `Skill: ${skill.name}\nDescription: ${skill.description}`,
      model: skill.model,
      maxBudgetUsd: skill.maxBudget,
      timeoutMs: skill.timeout,
    })
  }

  /**
   * Build the final prompt from a skill template and parameters.
   *
   * Replaces {param} placeholders in both the skill content (Markdown body)
   * and adds a header with skill metadata.
   */
  private buildPrompt(
    skill: Skill,
    params: Record<string, string>,
  ): string {
    // Interpolate parameters into the skill content
    let content = skill.content
    for (const [key, value] of Object.entries(params)) {
      content = content.replaceAll(`{${key}}`, value)
    }

    // Build the full prompt with context
    const parts: string[] = []

    parts.push(`# Skill: ${skill.name}`)
    parts.push('')

    if (Object.keys(params).length > 0) {
      parts.push('## Parameters')
      for (const [key, value] of Object.entries(params)) {
        parts.push(`- **${key}**: ${value}`)
      }
      parts.push('')
    }

    parts.push(content)

    return parts.join('\n')
  }
}
