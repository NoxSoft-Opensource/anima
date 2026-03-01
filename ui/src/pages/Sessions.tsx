import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getSessions, type SessionEntry } from '../api'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function SessionRow({ session, index }: { session: SessionEntry; index: number }) {
  const [expanded, setExpanded] = useState(false)

  const statusClass =
    session.status === 'completed'
      ? 'completed'
      : session.status === 'failed'
        ? 'failed'
        : session.status === 'timeout'
          ? 'failed'
          : 'running'

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.03 }}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <td>
        <span className="mono" style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
          {session.sessionId.slice(0, 12)}
        </span>
      </td>
      <td>
        <span className={`badge ${statusClass}`}>{session.status}</span>
      </td>
      <td>
        <span
          style={{
            color: session.mode === 'heartbeat'
              ? 'var(--color-accent)'
              : session.mode === 'freedom'
                ? 'var(--color-success)'
                : 'var(--color-text)',
            fontWeight: 500,
          }}
        >
          {session.mode}
        </span>
      </td>
      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {session.prompt}
      </td>
      <td className="mono" style={{ color: 'var(--color-muted)' }}>
        {formatDuration(session.durationMs)}
      </td>
      <td className="mono" style={{ color: session.costUsd != null ? 'var(--color-text)' : 'var(--color-muted)' }}>
        {session.costUsd != null ? `$${session.costUsd.toFixed(2)}` : '--'}
      </td>
      <td style={{ color: 'var(--color-muted)', fontSize: '12px' }}>
        {new Date(session.savedAt).toLocaleString()}
      </td>
    </motion.tr>
  )
}

export default function Sessions(): React.ReactElement {
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(() => setError('Could not load sessions'))
  }, [])

  if (error) {
    return (
      <div>
        <h1 className="page-title">Sessions</h1>
        <div className="card" style={{ color: 'var(--color-muted)', padding: '40px', textAlign: 'center' }}>
          {error}. Connect to a running ANIMA daemon.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Sessions</h1>

      {sessions.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
          No session history yet. Sessions appear after the daemon processes tasks or heartbeats.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Prompt</th>
                <th>Duration</th>
                <th>Cost</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session, index) => (
                <SessionRow key={session.sessionId} session={session} index={index} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: 'var(--color-text)',
            }}
          >
            {sessions.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase' }}>
            Total Sessions
          </div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: 'var(--color-accent)',
            }}
          >
            $
            {sessions
              .reduce((sum, s) => sum + (s.costUsd || 0), 0)
              .toFixed(2)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase' }}>
            Total Cost
          </div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: 'var(--color-success)',
            }}
          >
            {sessions.filter((s) => s.status === 'completed').length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase' }}>
            Completed
          </div>
        </div>
      </div>
    </div>
  )
}
