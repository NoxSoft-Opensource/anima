import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getIdentity, type IdentityResponse } from '../api'

const componentIcons: Record<string, string> = {
  SOUL: '@',
  HEART: '<3',
  BRAIN: '{}',
  GUT: '!!',
  SPIRIT: '**',
  SHADOW: '~~',
  MEMORY: '[]',
}

function SoulCard({
  name,
  content,
  source,
  description,
  index,
}: {
  name: string
  content: string
  source: string
  description: string
  index: number
}) {
  const [expanded, setExpanded] = useState(false)

  // Extract first meaningful lines as preview
  const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
  const preview = lines.slice(0, 3).join('\n')

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      style={{ cursor: 'pointer' }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            className="mono"
            style={{
              color: 'var(--color-accent)',
              fontSize: '18px',
              width: '32px',
              textAlign: 'center',
            }}
          >
            {componentIcons[name] || '?'}
          </span>
          <div>
            <div className="card-title">{name}</div>
            <div className="card-subtitle">{description}</div>
          </div>
        </div>
        <span
          className="badge"
          style={{
            background: source === 'user'
              ? 'rgba(0, 200, 83, 0.15)'
              : 'rgba(138, 138, 138, 0.15)',
            color: source === 'user' ? 'var(--color-success)' : 'var(--color-muted)',
          }}
        >
          {source}
        </span>
      </div>

      <div
        className="markdown-preview"
        style={{
          maxHeight: expanded ? 'none' : '80px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <pre
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--color-text)',
            margin: 0,
          }}
        >
          {expanded ? content : preview}
        </pre>
        {!expanded && lines.length > 3 && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '40px',
              background: 'linear-gradient(transparent, var(--color-surface))',
            }}
          />
        )}
      </div>

      {!expanded && lines.length > 3 && (
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-muted)',
            marginTop: '8px',
          }}
        >
          Click to expand...
        </div>
      )}
    </motion.div>
  )
}

export default function Soul(): React.ReactElement {
  const [identity, setIdentity] = useState<IdentityResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getIdentity()
      .then(setIdentity)
      .catch(() => setError('Could not load identity'))
  }, [])

  if (error) {
    return (
      <div>
        <h1 className="page-title">Soul Anatomy</h1>
        <div className="card" style={{ color: 'var(--color-muted)', padding: '40px', textAlign: 'center' }}>
          {error}. Start the daemon with: <span className="mono">anima start</span>
        </div>
      </div>
    )
  }

  if (!identity) {
    return (
      <div>
        <h1 className="page-title">Soul Anatomy</h1>
        <div className="card" style={{ color: 'var(--color-muted)', padding: '40px', textAlign: 'center' }}>
          Loading identity...
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="page-title">Soul Anatomy</h1>
      <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '24px' }}>
        Loaded at {new Date(identity.loadedAt).toLocaleString()}
      </div>

      {identity.components.map((component, index) => (
        <SoulCard
          key={component.name}
          name={component.name}
          content={component.content}
          source={component.source}
          description={component.description}
          index={index}
        />
      ))}
    </div>
  )
}
