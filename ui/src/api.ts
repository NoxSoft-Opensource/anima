/**
 * ANIMA API Client — wraps fetch calls to the daemon gateway.
 *
 * Default endpoint: http://localhost:18789
 */

const BASE_URL = 'http://localhost:18789'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`)
  }

  return resp.json() as Promise<T>
}

// --- Types ---

export interface DaemonStatus {
  heartbeat: {
    running: boolean
    paused: boolean
    beatCount: number
    lastBeat: string | null
    nextBeat: string | null
    interval: number
  }
  budget: {
    spent: number
    remaining: number
    limit: number
    sessionCount: number
  }
  queue: {
    queued: number
    running: number
    completed: number
    failed: number
  }
  mcp: {
    servers: MCPServerStatus[]
  }
}

export interface MCPServerStatus {
  name: string
  status: 'healthy' | 'unhealthy' | 'unknown'
  lastHealthCheck: string | null
  consecutiveFailures: number
  command: string
  args: string[]
}

export interface IdentityResponse {
  components: {
    name: string
    content: string
    source: 'user' | 'template'
    description: string
  }[]
  loadedAt: string
}

export interface SessionEntry {
  sessionId: string
  mode: string
  status: string
  prompt: string
  durationMs: number
  costUsd: number | null
  savedAt: string
}

export interface QueueItem {
  id: string
  prompt: string
  priority: string
  status: string
  source: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  result?: string
  error?: string
}

// --- API Functions ---

export async function getStatus(): Promise<DaemonStatus> {
  return request<DaemonStatus>('/api/status')
}

export async function getIdentity(): Promise<IdentityResponse> {
  return request<IdentityResponse>('/api/identity')
}

export async function getSessions(): Promise<SessionEntry[]> {
  return request<SessionEntry[]>('/api/sessions')
}

export async function getQueue(): Promise<QueueItem[]> {
  return request<QueueItem[]>('/api/queue')
}

export async function getMCPStatus(): Promise<MCPServerStatus[]> {
  return request<MCPServerStatus[]>('/api/mcp')
}

export async function addToQueue(
  prompt: string,
  priority: string = 'normal',
): Promise<{ id: string }> {
  return request<{ id: string }>('/api/queue', {
    method: 'POST',
    body: JSON.stringify({ prompt, priority, source: 'web' }),
  })
}

// --- SVRN Types ---

export interface SVRNStatus {
  enabled: boolean
  running: boolean
  paused: boolean
  nodeId: string
  uptimeMs: number
  tasksCompleted: number
  tasksFailed: number
  balance: number
  sessionEarnings: number
  limits: {
    maxCpuPercent: number
    maxRamMB: number
    maxBandwidthMbps: number
  }
  resources: {
    cpuPercent: number
    ramUsedMB: number
    bandwidthMbps: number
  } | null
  earnings: {
    allTimeEarned: number
    allTimeApplied: number
    balanceValueUSD: number
    todayEarned: number
    todayTasks: number
  }
}

export async function getSVRNStatus(): Promise<SVRNStatus> {
  return request<SVRNStatus>('/api/svrn/status')
}

export async function setSVRNEnabled(enabled: boolean): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/svrn/toggle', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
}

export async function updateSVRNLimits(limits: {
  maxCpuPercent?: number
  maxRamMB?: number
  maxBandwidthMbps?: number
}): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/svrn/limits', {
    method: 'POST',
    body: JSON.stringify(limits),
  })
}

// --- WebSocket ---

export function connectWebSocket(
  onMessage: (event: MessageEvent) => void,
  onError?: (event: Event) => void,
): WebSocket {
  const ws = new WebSocket(`ws://localhost:18789/ws`)

  ws.onmessage = onMessage
  ws.onerror = onError || (() => {})

  return ws
}
