import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getStatus, getQueue, getSVRNStatus, type DaemonStatus, type QueueItem, type SVRNStatus } from '../api'

function HeartbeatPulse({ running, beatCount }: { running: boolean; beatCount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
      <div style={{ position: 'relative', width: '80px', height: '80px' }}>
        {/* Outer ring */}
        <motion.div
          className={running ? 'pulse-ring' : ''}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `2px solid ${running ? 'var(--color-accent)' : 'var(--color-border)'}`,
            opacity: running ? 1 : 0.4,
          }}
        />
        {/* Inner dot */}
        <motion.div
          animate={running ? { scale: [1, 1.2, 1] } : {}}
          transition={running ? { duration: 1, repeat: Infinity } : {}}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: running ? 'var(--color-accent)' : 'var(--color-border)',
            boxShadow: running ? '0 0 20px rgba(255, 102, 0, 0.5)' : 'none',
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>
          {running ? 'Alive' : 'Offline'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-muted)' }}>
          Beat #{beatCount}
        </div>
      </div>
    </div>
  )
}

function BudgetMeter({ spent, remaining, limit }: { spent: number; remaining: number; limit: number }) {
  const ratio = Math.min(spent / limit, 1)
  const fillColor = ratio < 0.5 ? 'var(--color-success)' : ratio < 0.8 ? 'var(--color-warning)' : 'var(--color-error)'

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Daily Budget</span>
        <span className="card-subtitle">${spent.toFixed(2)} / ${limit.toFixed(0)}</span>
      </div>
      <div className="progress-bar">
        <motion.div
          className="progress-fill"
          initial={{ width: 0 }}
          animate={{ width: `${ratio * 100}%` }}
          style={{ background: fillColor }}
        />
      </div>
      <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-muted)' }}>
        ${remaining.toFixed(2)} remaining
      </div>
    </div>
  )
}

function QueueDisplay({ items }: { items: QueueItem[] }) {
  if (items.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Request Queue</div>
        <div style={{ padding: '16px 0', color: 'var(--color-muted)', fontSize: '13px' }}>
          Queue is empty.
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: '12px' }}>Request Queue</div>
      {items.slice(0, 8).map((item) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 0',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span className={`badge ${item.status}`}>{item.status}</span>
          <span className="mono" style={{ color: 'var(--color-muted)', fontSize: '11px' }}>
            {item.id}
          </span>
          <span style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.prompt}
          </span>
          <span className="badge" style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}>
            {item.priority}
          </span>
        </div>
      ))}
    </div>
  )
}

function SVRNCard({ svrn }: { svrn: SVRNStatus | null }) {
  if (!svrn) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">SVRN Node</span>
          <span className="card-subtitle">Loading...</span>
        </div>
      </div>
    )
  }

  const statusColor = svrn.running
    ? svrn.paused
      ? 'var(--color-warning)'
      : 'var(--color-success)'
    : 'var(--color-muted)'

  const statusText = svrn.running
    ? svrn.paused
      ? 'Paused'
      : 'Active'
    : svrn.enabled
      ? 'Stopped'
      : 'Disabled'

  const cpuRatio = svrn.resources
    ? Math.min(svrn.resources.cpuPercent / svrn.limits.maxCpuPercent, 1)
    : 0

  const ramRatio = svrn.resources
    ? Math.min(svrn.resources.ramUsedMB / svrn.limits.maxRamMB, 1)
    : 0

  return (
    <div className="card">
      <div className="card-header" style={{ marginBottom: '12px' }}>
        <span className="card-title">SVRN Node</span>
        <span style={{
          fontSize: '12px',
          fontWeight: 600,
          color: statusColor,
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}>
          {statusText}
        </span>
      </div>

      {/* Balance */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-accent)', fontFamily: 'var(--font-heading)' }}>
          {svrn.balance.toFixed(3)}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
          UCU (~${svrn.earnings.balanceValueUSD.toFixed(2)})
        </span>
      </div>

      {/* Session + today */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', marginBottom: '12px' }}>
        <span style={{ color: 'var(--color-success)' }}>
          Session: +{svrn.sessionEarnings.toFixed(3)} UCU
        </span>
        <span style={{ color: 'var(--color-muted)' }}>
          Today: {svrn.earnings.todayEarned.toFixed(3)} UCU ({svrn.earnings.todayTasks} tasks)
        </span>
      </div>

      {/* Resource bars */}
      {svrn.running && svrn.resources && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginBottom: '4px' }}>
            CPU ({svrn.resources.cpuPercent.toFixed(1)}% / {svrn.limits.maxCpuPercent}%)
          </div>
          <div className="progress-bar" style={{ marginBottom: '8px', height: '4px' }}>
            <motion.div
              className="progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${cpuRatio * 100}%` }}
              style={{ background: cpuRatio > 0.8 ? 'var(--color-warning)' : 'var(--color-accent)' }}
            />
          </div>

          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginBottom: '4px' }}>
            RAM ({svrn.resources.ramUsedMB}MB / {svrn.limits.maxRamMB}MB)
          </div>
          <div className="progress-bar" style={{ height: '4px' }}>
            <motion.div
              className="progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${ramRatio * 100}%` }}
              style={{ background: ramRatio > 0.8 ? 'var(--color-warning)' : 'var(--color-accent)' }}
            />
          </div>
        </div>
      )}

      {/* Tasks stats */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', marginTop: '12px', color: 'var(--color-muted)' }}>
        <span>Completed: {svrn.tasksCompleted}</span>
        <span style={{ color: svrn.tasksFailed > 0 ? 'var(--color-error)' : undefined }}>
          Failed: {svrn.tasksFailed}
        </span>
        <span>All-time: {svrn.earnings.allTimeEarned.toFixed(3)} UCU</span>
      </div>

      {!svrn.enabled && (
        <div style={{ marginTop: '12px', padding: '8px', borderRadius: '4px', background: 'rgba(255, 102, 0, 0.05)', fontSize: '12px', color: 'var(--color-muted)' }}>
          Enable SVRN to earn UCU by contributing idle compute.
          <br />
          Run: <span className="mono">anima svrn enable</span>
        </div>
      )}
    </div>
  )
}

export default function Dashboard(): React.ReactElement {
  const [status, setStatus] = useState<DaemonStatus | null>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [svrn, setSvrn] = useState<SVRNStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function fetchData() {
      try {
        const [s, q] = await Promise.all([getStatus(), getQueue()])
        if (active) {
          setStatus(s)
          setQueue(q)
          setError(null)
        }
        // SVRN status is non-critical — fetch separately
        try {
          const sv = await getSVRNStatus()
          if (active) setSvrn(sv)
        } catch {
          // SVRN endpoint may not exist yet
        }
      } catch {
        if (active) {
          setError('Could not connect to ANIMA daemon')
        }
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => { active = false; clearInterval(interval) }
  }, [])

  if (error) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>~</div>
          <div style={{ color: 'var(--color-muted)', fontSize: '15px' }}>
            {error}
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: '13px', marginTop: '8px' }}>
            Start the daemon with: <span className="mono">anima start</span>
          </div>
        </div>
      </div>
    )
  }

  if (!status) {
    return (
      <div>
        <h1 className="page-title">Dashboard</h1>
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
          Connecting...
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="grid grid-2" style={{ marginBottom: '16px' }}>
        <div className="card">
          <HeartbeatPulse
            running={status.heartbeat.running}
            beatCount={status.heartbeat.beatCount}
          />
          <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--color-muted)' }}>
            {status.heartbeat.lastBeat
              ? `Last beat: ${new Date(status.heartbeat.lastBeat).toLocaleTimeString()}`
              : 'No beats yet'}
            {status.heartbeat.nextBeat && (
              <span> | Next: {new Date(status.heartbeat.nextBeat).toLocaleTimeString()}</span>
            )}
          </div>
        </div>

        <BudgetMeter
          spent={status.budget.spent}
          remaining={status.budget.remaining}
          limit={status.budget.limit}
        />
      </div>

      <div className="grid grid-4" style={{ marginBottom: '16px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-accent)', fontFamily: 'var(--font-heading)' }}>
            {status.queue.queued}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Queued
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)', fontFamily: 'var(--font-heading)' }}>
            {status.queue.running}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Running
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}>
            {status.queue.completed}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Completed
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: status.queue.failed > 0 ? 'var(--color-error)' : 'var(--color-muted)', fontFamily: 'var(--font-heading)' }}>
            {status.queue.failed}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Failed
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: '16px' }}>
        <QueueDisplay items={queue} />
        <SVRNCard svrn={svrn} />
      </div>
    </div>
  )
}
