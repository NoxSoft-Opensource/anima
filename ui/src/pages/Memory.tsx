import React, { useState } from 'react'
import { motion } from 'framer-motion'

type MemoryType = 'episodic' | 'semantic' | 'procedural'

const memoryTypes: { key: MemoryType; label: string; description: string }[] = [
  {
    key: 'episodic',
    label: 'Episodic',
    description: 'Specific experiences and events — session transcripts, conversations, interactions',
  },
  {
    key: 'semantic',
    label: 'Semantic',
    description: 'Extracted knowledge and facts — patterns learned, preferences discovered',
  },
  {
    key: 'procedural',
    label: 'Procedural',
    description: 'How-to knowledge — workflows, debugging steps, build processes',
  },
]

export default function Memory(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<MemoryType>('episodic')
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div>
      <h1 className="page-title">Memory</h1>

      <input
        className="search-bar"
        type="text"
        placeholder="Search memories..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{ marginBottom: '20px' }}
      />

      <div className="tabs">
        {memoryTypes.map((type) => (
          <div
            key={type.key}
            className={`tab ${activeTab === type.key ? 'active' : ''}`}
            onClick={() => setActiveTab(type.key)}
          >
            {type.label}
          </div>
        ))}
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="card">
          <div className="card-title" style={{ marginBottom: '8px' }}>
            {memoryTypes.find((t) => t.key === activeTab)?.label} Memory
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '16px' }}>
            {memoryTypes.find((t) => t.key === activeTab)?.description}
          </div>

          {/* Memory store is loaded from ~/.anima/memory/{type}/ */}
          <div
            style={{
              padding: '40px',
              textAlign: 'center',
              color: 'var(--color-muted)',
              fontSize: '13px',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            {searchQuery ? (
              <>
                Searching <span className="mono">{activeTab}</span> for &quot;{searchQuery}&quot;...
                <div style={{ marginTop: '8px' }}>
                  Memory search requires a running ANIMA daemon.
                </div>
              </>
            ) : (
              <>
                Memory entries from <span className="mono">~/.anima/memory/{activeTab}/</span>
                <div style={{ marginTop: '8px' }}>
                  Connect to the daemon to browse memory.
                </div>
              </>
            )}
          </div>
        </div>

        {/* Timeline placeholder for episodic memory */}
        {activeTab === 'episodic' && (
          <div className="card" style={{ marginTop: '16px' }}>
            <div className="card-title" style={{ marginBottom: '16px' }}>Timeline</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                borderLeft: '2px solid var(--color-border)',
                marginLeft: '8px',
                paddingLeft: '20px',
              }}
            >
              {[
                { time: 'Today', label: 'Session started', detail: 'ANIMA daemon initialized' },
                { time: 'Earlier', label: 'Memory system ready', detail: 'Episodic store loaded' },
              ].map((entry, i) => (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    padding: '12px 0',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: '-25px',
                      top: '16px',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--color-accent)',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{entry.time}</div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>{entry.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>{entry.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
