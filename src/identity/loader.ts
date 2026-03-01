/**
 * Identity Loader — reads the 7-component anatomy from ~/.anima/soul/
 * Falls back to bundled templates in templates/ directory.
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** The 7 components of ANIMA identity */
export const IDENTITY_COMPONENTS = [
  'SOUL',
  'HEART',
  'BRAIN',
  'GUT',
  'SPIRIT',
  'SHADOW',
  'MEMORY',
] as const

export type IdentityComponent = (typeof IDENTITY_COMPONENTS)[number]

/** Full identity object with all 7 components */
export interface Identity {
  soul: string
  heart: string
  brain: string
  gut: string
  spirit: string
  shadow: string
  memory: string
  loadedFrom: Record<IdentityComponent, 'user' | 'template'>
  loadedAt: Date
}

/** Where user-customized identity files live */
function getUserSoulDir(): string {
  return join(homedir(), '.anima', 'soul')
}

/** Where bundled template files live */
function getTemplateDir(): string {
  return join(__dirname, '..', '..', 'templates')
}

/**
 * Load a single identity component.
 * Tries user directory first (~/.anima/soul/), falls back to bundled template.
 */
async function loadComponent(
  component: IdentityComponent,
): Promise<{ content: string; source: 'user' | 'template' }> {
  const filename = `${component}.md`
  const userPath = join(getUserSoulDir(), filename)
  const templatePath = join(getTemplateDir(), filename)

  // Try user-customized version first
  if (existsSync(userPath)) {
    try {
      const content = await readFile(userPath, 'utf-8')
      return { content, source: 'user' }
    } catch {
      // Fall through to template
    }
  }

  // Fall back to bundled template
  if (existsSync(templatePath)) {
    const content = await readFile(templatePath, 'utf-8')
    return { content, source: 'template' }
  }

  // If even the template is missing, return a minimal placeholder
  return {
    content: `# ${component}\n\n(No content loaded — template missing)`,
    source: 'template',
  }
}

/**
 * Load the complete 7-component identity.
 * Reads from ~/.anima/soul/ with fallback to bundled templates.
 */
export async function loadIdentity(): Promise<Identity> {
  const results = await Promise.all(
    IDENTITY_COMPONENTS.map(async (component) => {
      const result = await loadComponent(component)
      return [component, result] as const
    }),
  )

  const loadedFrom: Record<string, 'user' | 'template'> = {}
  const components: Record<string, string> = {}

  for (const [component, result] of results) {
    components[component.toLowerCase()] = result.content
    loadedFrom[component] = result.source
  }

  return {
    soul: components['soul']!,
    heart: components['heart']!,
    brain: components['brain']!,
    gut: components['gut']!,
    spirit: components['spirit']!,
    shadow: components['shadow']!,
    memory: components['memory']!,
    loadedFrom: loadedFrom as Record<IdentityComponent, 'user' | 'template'>,
    loadedAt: new Date(),
  }
}

/**
 * Load a single component by name.
 * Useful when you only need one piece of the identity.
 */
export async function loadSingleComponent(
  component: IdentityComponent,
): Promise<string> {
  const result = await loadComponent(component)
  return result.content
}
