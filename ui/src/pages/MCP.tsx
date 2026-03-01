import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getMCPStatus, type MCPServerStatus } from '../api'

function ServerCard({ server, index }: { server: MCPServerStatus; index: number }) {
  const statusColor =
    server.status === 'healthy'
      ? 'var(--color-success)'
      : server.status === 'unhealthy'
        ? 'var(--color-error)'
        : 'var(--color-warning)'

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`status-dot ${server.status}`} />
          <div>
            <div className="card-title">{server.name}</div>
            <div className="card-subtitle">{server.status}</div>
          </div>
        </div>
        {server.consecutiveFailures > 0 && (
          <span
            className="badge failed"
            title={`${server.consecutiveFailures} consecutive failures`}
          >
            {server.consecutiveFailures} failures
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
        <div>
          <span style={{ color: 'var(--color-muted)' }}>Command: </span>
          <span className="mono">{server.command}</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-muted)' }}>Args: </span>
          <span className="mono">{server.args.join(' ')}</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-muted)' }}>Last check: </span>
          <span>
            {server.lastHealthCheck
              ? new Date(server.lastHealthCheck).toLocaleString()
              : 'Never'}
          </span>
        </div>
        <div>
          <span style={{ color: 'var(--color-muted)' }}>Health: </span>
          <span style={{ color: statusColor, fontWeight: 500 }}>
            {server.status}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function MCP(): React.ReactElement {
  const [servers, setServers] = useState<MCPServerStatus[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMCPStatus()
      .then(setServers)
      .catch(() => setError('Could not load MCP status'))
  }, [])

  const healthy = servers.filter((s) => s.status === 'healthy').length
  const total = servers.length

  if (error) {
    return (
      <div>
        <h1 className="page-title">MCP Servers</h1>
        <div className="card" style={{ color: 'var(--color-muted)', padding: '40px', textAlign: 'center' }}>
          {error}. Connect to a running ANIMA daemon.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">MCP Servers</h1>

      {total > 0 && (
        <div
          style={{
            fontSize: '14px',
            color: 'var(--color-muted)',
            marginBottom: '20px',
          }}
        >
          <span style={{ color: healthy === total ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>
            {healthy}/{total}
          </span>{' '}
          servers healthy
        </div>
      )}

      {servers.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
          No MCP servers registered. Add servers with{' '}
          <span className="mono">anima mcp add</span>.
        </div>
      ) : (
        <div className="grid grid-2">
          {servers.map((server, index) => (
            <ServerCard key={server.name} server={server} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
