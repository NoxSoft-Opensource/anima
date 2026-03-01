import React from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Soul from './pages/Soul'
import Memory from './pages/Memory'
import Sessions from './pages/Sessions'
import MCP from './pages/MCP'
import Journal from './pages/Journal'
import Freedom from './pages/Freedom'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '~' },
  { path: '/soul', label: 'Soul', icon: '@' },
  { path: '/memory', label: 'Memory', icon: '#' },
  { path: '/sessions', label: 'Sessions', icon: '>' },
  { path: '/mcp', label: 'MCP', icon: '&' },
  { path: '/journal', label: 'Journal', icon: '*' },
  { path: '/freedom', label: 'Freedom', icon: '^' },
]

export default function App(): React.ReactElement {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>ANIMA</h1>
          <div className="subtitle">The Living Wrapper</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <span className="nav-icon mono">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
            NoxSoft PBC
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/soul" element={<Soul />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/mcp" element={<MCP />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/freedom" element={<Freedom />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}
