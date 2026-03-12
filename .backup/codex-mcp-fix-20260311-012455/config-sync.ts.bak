/**
 * MCP Config Sync — synchronizes ANIMA's MCP registry with Claude's mcp.json.
 *
 * Reads the ANIMA registry, builds Claude MCP config entries,
 * writes to ~/.claude/mcp.json while preserving non-ANIMA entries.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import { listServers } from './registry.js'
import type { MCPServer } from './registry.js'

/** Claude's MCP config structure */
interface ClaudeMCPConfig {
  mcpServers: Record<string, ClaudeMCPEntry>
}

interface ClaudeMCPEntry {
  command: string
  args: string[]
  env?: Record<string, string>
  /** ANIMA marker to identify managed entries */
  _managedBy?: 'anima'
}

const CLAUDE_MCP_PATH = join(homedir(), '.claude', 'mcp.json')

/**
 * Read the existing Claude MCP config.
 */
async function readClaudeConfig(): Promise<ClaudeMCPConfig> {
  if (!existsSync(CLAUDE_MCP_PATH)) {
    return { mcpServers: {} }
  }

  try {
    const content = await readFile(CLAUDE_MCP_PATH, 'utf-8')
    return JSON.parse(content) as ClaudeMCPConfig
  } catch {
    return { mcpServers: {} }
  }
}

/**
 * Write the Claude MCP config.
 */
async function writeClaudeConfig(config: ClaudeMCPConfig): Promise<void> {
  await mkdir(join(homedir(), '.claude'), { recursive: true })
  await writeFile(CLAUDE_MCP_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Convert an ANIMA MCPServer to a Claude MCP config entry.
 */
function serverToClaudeEntry(server: MCPServer): ClaudeMCPEntry {
  const entry: ClaudeMCPEntry = {
    command: server.command,
    args: [...server.args],
    _managedBy: 'anima',
  }

  // Only include env if non-empty
  if (Object.keys(server.env).length > 0) {
    entry.env = { ...server.env }
  }

  return entry
}

/**
 * Sync the ANIMA registry with Claude's mcp.json.
 *
 * - Adds/updates entries for all registered ANIMA servers
 * - Removes ANIMA-managed entries that are no longer in the registry
 * - Preserves any non-ANIMA entries in mcp.json
 *
 * Runs on: startup, after MCP add/remove, after updates.
 */
export async function syncConfig(): Promise<{
  added: string[]
  updated: string[]
  removed: string[]
  preserved: string[]
}> {
  const result = {
    added: [] as string[],
    updated: [] as string[],
    removed: [] as string[],
    preserved: [] as string[],
  }

  const claudeConfig = await readClaudeConfig()
  const animaServers = await listServers()

  // Build a set of ANIMA server names for quick lookup
  const animaServerNames = new Set(animaServers.map((s) => s.name))

  // Identify existing entries
  const existingEntries = claudeConfig.mcpServers || {}
  const newEntries: Record<string, ClaudeMCPEntry> = {}

  // Preserve non-ANIMA entries
  for (const [name, entry] of Object.entries(existingEntries)) {
    const typedEntry = entry as ClaudeMCPEntry
    if (typedEntry._managedBy !== 'anima') {
      newEntries[name] = typedEntry
      result.preserved.push(name)
    }
  }

  // Add/update ANIMA entries
  for (const server of animaServers) {
    const existing = existingEntries[server.name] as
      | ClaudeMCPEntry
      | undefined
    const newEntry = serverToClaudeEntry(server)

    if (!existing) {
      result.added.push(server.name)
    } else if (existing._managedBy === 'anima') {
      result.updated.push(server.name)
    } else {
      // Non-ANIMA entry with same name — ANIMA takes over
      result.updated.push(server.name)
    }

    newEntries[server.name] = newEntry
  }

  // Find removed ANIMA entries (were in old config as ANIMA-managed, no longer in registry)
  for (const [name, entry] of Object.entries(existingEntries)) {
    const typedEntry = entry as ClaudeMCPEntry
    if (typedEntry._managedBy === 'anima' && !animaServerNames.has(name)) {
      result.removed.push(name)
      // Don't add to newEntries — effectively removing it
    }
  }

  // Write the updated config
  claudeConfig.mcpServers = newEntries
  await writeClaudeConfig(claudeConfig)

  return result
}

/**
 * Get the current sync status.
 */
export async function getSyncStatus(): Promise<{
  claudeConfigExists: boolean
  animaServerCount: number
  claudeEntryCount: number
  animaManagedCount: number
  externalCount: number
}> {
  const claudeConfigExists = existsSync(CLAUDE_MCP_PATH)
  const animaServers = await listServers()

  let claudeEntryCount = 0
  let animaManagedCount = 0
  let externalCount = 0

  if (claudeConfigExists) {
    const config = await readClaudeConfig()
    const entries = config.mcpServers || {}
    claudeEntryCount = Object.keys(entries).length

    for (const entry of Object.values(entries)) {
      const typedEntry = entry as ClaudeMCPEntry
      if (typedEntry._managedBy === 'anima') {
        animaManagedCount++
      } else {
        externalCount++
      }
    }
  }

  return {
    claudeConfigExists,
    animaServerCount: animaServers.length,
    claudeEntryCount,
    animaManagedCount,
    externalCount,
  }
}
