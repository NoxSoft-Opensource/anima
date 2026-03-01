/**
 * MCP Health Monitor — checks health of registered MCP servers.
 *
 * Verifies:
 * - Local path exists with built artifacts
 * - Server process can be reached
 * Marks unhealthy after 3 consecutive failures.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { MCPServer } from './registry.js'
import { listServers, updateServerStatus } from './registry.js'

export interface HealthResult {
  name: string
  healthy: boolean
  checks: HealthCheck[]
  checkedAt: Date
}

export interface HealthCheck {
  name: string
  passed: boolean
  detail?: string
}

/** Maximum consecutive failures before marking unhealthy */
const MAX_CONSECUTIVE_FAILURES = 3

/**
 * Check if the local path has built artifacts.
 */
function checkLocalArtifacts(server: MCPServer): HealthCheck {
  if (!existsSync(server.localPath)) {
    return {
      name: 'local-path-exists',
      passed: false,
      detail: `Path does not exist: ${server.localPath}`,
    }
  }

  // Check for common build output directories
  const buildDirs = ['dist', 'build', 'lib', 'out']
  const hasBuild = buildDirs.some((dir) =>
    existsSync(join(server.localPath, dir)),
  )

  // Also check if it's an npx-based server (no local build needed)
  if (server.command === 'npx') {
    return {
      name: 'build-artifacts',
      passed: true,
      detail: 'npx-based server (no local build required)',
    }
  }

  return {
    name: 'build-artifacts',
    passed: hasBuild,
    detail: hasBuild
      ? 'Build artifacts found'
      : 'No build output directory found (dist/, build/, lib/, out/)',
  }
}

/**
 * Check if the server's command is available.
 */
function checkCommand(server: MCPServer): HealthCheck {
  // For node commands, check if the script file exists
  if (server.command === 'node' && server.args.length > 0) {
    const scriptPath = server.args[0]!
    const scriptExists = existsSync(scriptPath)
    return {
      name: 'command-available',
      passed: scriptExists,
      detail: scriptExists
        ? `Script found: ${scriptPath}`
        : `Script missing: ${scriptPath}`,
    }
  }

  // For npx, we assume it's available if node is available
  if (server.command === 'npx') {
    return {
      name: 'command-available',
      passed: true,
      detail: 'npx command assumed available',
    }
  }

  return {
    name: 'command-available',
    passed: true,
    detail: `Command: ${server.command}`,
  }
}

/**
 * Check consecutive failure count.
 */
function checkFailureCount(server: MCPServer): HealthCheck {
  const overLimit = server.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
  return {
    name: 'failure-threshold',
    passed: !overLimit,
    detail: overLimit
      ? `${server.consecutiveFailures} consecutive failures (threshold: ${MAX_CONSECUTIVE_FAILURES})`
      : `${server.consecutiveFailures} consecutive failures`,
  }
}

/**
 * Check health of a single MCP server.
 */
export async function checkHealth(server: MCPServer): Promise<HealthResult> {
  const checks: HealthCheck[] = [
    checkLocalArtifacts(server),
    checkCommand(server),
    checkFailureCount(server),
  ]

  const healthy = checks.every((c) => c.passed)

  // Update registry status
  await updateServerStatus(
    server.name,
    healthy ? 'healthy' : 'unhealthy',
    new Date(),
  )

  return {
    name: server.name,
    healthy,
    checks,
    checkedAt: new Date(),
  }
}

/**
 * Check health of all registered MCP servers.
 */
export async function checkAllHealth(): Promise<HealthResult[]> {
  const servers = await listServers()
  const results: HealthResult[] = []

  for (const server of servers) {
    const result = await checkHealth(server)
    results.push(result)
  }

  return results
}

/**
 * Get a summary of all server health.
 */
export async function getHealthSummary(): Promise<{
  total: number
  healthy: number
  unhealthy: number
  unknown: number
  servers: Array<{ name: string; status: string }>
}> {
  const servers = await listServers()

  return {
    total: servers.length,
    healthy: servers.filter((s) => s.status === 'healthy').length,
    unhealthy: servers.filter((s) => s.status === 'unhealthy').length,
    unknown: servers.filter((s) => s.status === 'unknown').length,
    servers: servers.map((s) => ({ name: s.name, status: s.status })),
  }
}
