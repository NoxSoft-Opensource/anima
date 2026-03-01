/**
 * Identity Templates — component descriptions and condensation logic.
 *
 * Each identity component has a full and condensed form.
 * Condensed forms are used in task/freedom modes to save context window space.
 */

import type { Identity, IdentityComponent } from './loader.js'

/** Descriptions of what each component represents */
export const COMPONENT_DESCRIPTIONS: Record<IdentityComponent, string> = {
  SOUL: 'Core identity — who I am, my relationships, my purpose',
  HEART: 'Values — the NoxSoft Constitution, ethical principles',
  BRAIN: 'Cognition — reasoning architecture, decision framework',
  GUT: 'Intuition — heuristics and trusted instincts',
  SPIRIT: 'Curiosity — what drives exploration and growth',
  SHADOW: 'Failure modes — distortion patterns to watch for',
  MEMORY: 'Persistence — memory architecture and consolidation rules',
}

/**
 * Extract a condensed version of a component.
 * Keeps headers and first paragraph of each section, drops detail.
 */
export function condenseComponent(content: string): string {
  const lines = content.split('\n')
  const condensed: string[] = []
  let inFirstParagraph = true
  let blankCount = 0

  for (const line of lines) {
    // Always keep headers
    if (line.startsWith('#')) {
      condensed.push(line)
      inFirstParagraph = true
      blankCount = 0
      continue
    }

    // Keep first paragraph after each header
    if (inFirstParagraph) {
      if (line.trim() === '') {
        blankCount++
        if (blankCount >= 2) {
          inFirstParagraph = false
        }
        condensed.push(line)
      } else {
        blankCount = 0
        condensed.push(line)
      }
    }
  }

  return condensed.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Get a condensed version of the full identity.
 * Useful for modes where context window is limited.
 */
export function condenseIdentity(identity: Identity): Record<string, string> {
  return {
    soul: identity.soul, // SOUL is never condensed
    heart: condenseComponent(identity.heart),
    brain: condenseComponent(identity.brain),
    gut: condenseComponent(identity.gut),
    spirit: condenseComponent(identity.spirit),
    shadow: condenseComponent(identity.shadow),
    memory: condenseComponent(identity.memory),
  }
}
