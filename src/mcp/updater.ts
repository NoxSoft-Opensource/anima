/**
 * MCP Auto-Updater — pulls, builds, and rolls back MCP servers.
 *
 * Security: all subprocess calls use execFile (not exec).
 */

import { execFile as execFileCb } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'

import type { MCPServer } from './registry.js'
import { listServers, updateServerStatus } from './registry.js'

const execFile = promisify(execFileCb)

export interface UpdateResult {
  name: string
  success: boolean
  previousVersion?: string
  newVersion?: string
  steps: UpdateStep[]
  error?: string
}

export interface UpdateStep {
  name: string
  success: boolean
  output?: string
  error?: string
}

export interface UpdateLog {
  entries: UpdateLogEntry[]
}

export interface UpdateLogEntry {
  timestamp: string
  serverName: string
  success: boolean
  previousVersion?: string
  newVersion?: string
  error?: string
}

const UPDATE_LOG_PATH = join(homedir(), '.anima', 'mcp', 'update-log.json')

/**
 * Run a command step with error handling.
 */
async function runStep(
  name: string,
  command: string,
  args: string[],
  cwd: string,
): Promise<UpdateStep> {
  try {
    const { stdout } = await execFile(command, args, {
      cwd,
      timeout: 120_000, // 2 min timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB
    })
    return { name, success: true, output: stdout.trim() }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { name, success: false, error }
  }
}

/**
 * Get the current git commit hash for version tracking.
 */
async function getGitVersion(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile('git', ['rev-parse', '--short', 'HEAD'], {
      cwd,
    })
    return stdout.trim()
  } catch {
    return undefined
  }
}

/**
 * Update a single MCP server.
 *
 * Steps:
 * 1. git stash (save local changes)
 * 2. git pull
 * 3. pnpm install
 * 4. pnpm build
 * 5. If build fails, git stash pop to rollback
 */
export async function updateServer(server: MCPServer): Promise<UpdateResult> {
  const steps: UpdateStep[] = []
  const cwd = server.localPath

  if (!existsSync(cwd)) {
    return {
      name: server.name,
      success: false,
      steps: [],
      error: `Local path does not exist: ${cwd}`,
    }
  }

  // Get current version
  const previousVersion = await getGitVersion(cwd)

  // Step 1: Stash local changes
  const stash = await runStep('git-stash', 'git', ['stash'], cwd)
  steps.push(stash)

  // Step 2: Git pull
  const pull = await runStep('git-pull', 'git', ['pull', '--rebase'], cwd)
  steps.push(pull)

  if (!pull.success) {
    // Try to restore stash
    await runStep('git-stash-pop', 'git', ['stash', 'pop'], cwd)

    return {
      name: server.name,
      success: false,
      previousVersion,
      steps,
      error: `Git pull failed: ${pull.error}`,
    }
  }

  // Step 3: pnpm install
  const install = await runStep(
    'pnpm-install',
    'pnpm',
    ['install', '--frozen-lockfile'],
    cwd,
  )
  steps.push(install)

  if (!install.success) {
    // Try without frozen lockfile
    const installRetry = await runStep(
      'pnpm-install-retry',
      'pnpm',
      ['install'],
      cwd,
    )
    steps.push(installRetry)

    if (!installRetry.success) {
      // Rollback
      await runStep('git-reset', 'git', ['reset', '--hard', 'HEAD~1'], cwd)
      await runStep('git-stash-pop', 'git', ['stash', 'pop'], cwd)

      return {
        name: server.name,
        success: false,
        previousVersion,
        steps,
        error: `pnpm install failed: ${installRetry.error}`,
      }
    }
  }

  // Step 4: pnpm build
  const build = await runStep('pnpm-build', 'pnpm', ['build'], cwd)
  steps.push(build)

  if (!build.success) {
    // Rollback
    const reset = await runStep(
      'git-reset-rollback',
      'git',
      ['reset', '--hard', 'HEAD~1'],
      cwd,
    )
    steps.push(reset)

    const stashPop = await runStep(
      'git-stash-pop',
      'git',
      ['stash', 'pop'],
      cwd,
    )
    steps.push(stashPop)

    await updateServerStatus(server.name, 'unhealthy')

    return {
      name: server.name,
      success: false,
      previousVersion,
      steps,
      error: `Build failed, rolled back: ${build.error}`,
    }
  }

  // Get new version
  const newVersion = await getGitVersion(cwd)

  // Pop stash if there were local changes
  if (stash.output && !stash.output.includes('No local changes')) {
    const pop = await runStep('git-stash-pop', 'git', ['stash', 'pop'], cwd)
    steps.push(pop)
  }

  await updateServerStatus(server.name, 'healthy')

  // Log the update
  await logUpdate({
    timestamp: new Date().toISOString(),
    serverName: server.name,
    success: true,
    previousVersion,
    newVersion,
  })

  return {
    name: server.name,
    success: true,
    previousVersion,
    newVersion,
    steps,
  }
}

/**
 * Update all servers with autoUpdate enabled.
 */
export async function updateAllServers(): Promise<UpdateResult[]> {
  const servers = await listServers()
  const results: UpdateResult[] = []

  for (const server of servers) {
    if (!server.autoUpdate) continue
    const result = await updateServer(server)
    results.push(result)
  }

  return results
}

/**
 * Log an update to the update log file.
 */
async function logUpdate(entry: UpdateLogEntry): Promise<void> {
  await mkdir(join(homedir(), '.anima', 'mcp'), { recursive: true })

  let log: UpdateLog = { entries: [] }

  if (existsSync(UPDATE_LOG_PATH)) {
    try {
      const content = await readFile(UPDATE_LOG_PATH, 'utf-8')
      log = JSON.parse(content) as UpdateLog
    } catch {
      // Corrupt log — start fresh
    }
  }

  log.entries.push(entry)

  // Keep last 100 entries
  if (log.entries.length > 100) {
    log.entries = log.entries.slice(-100)
  }

  await writeFile(UPDATE_LOG_PATH, JSON.stringify(log, null, 2), 'utf-8')
}

/**
 * Get the update log.
 */
export async function getUpdateLog(): Promise<UpdateLog> {
  if (!existsSync(UPDATE_LOG_PATH)) {
    return { entries: [] }
  }

  try {
    const content = await readFile(UPDATE_LOG_PATH, 'utf-8')
    return JSON.parse(content) as UpdateLog
  } catch {
    return { entries: [] }
  }
}
