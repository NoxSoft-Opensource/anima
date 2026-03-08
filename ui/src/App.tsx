import React from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Freedom from "./pages/Freedom";
import Journal from "./pages/Journal";
import MCP from "./pages/MCP";
import Memory from "./pages/Memory";
import MissionControl from "./pages/MissionControl";
import Sessions from "./pages/Sessions";
import Settings from "./pages/Settings";
import Soul from "./pages/Soul";

const navItems = [
  { path: "/dashboard", label: "Home", icon: "~" },
  { path: "/mission", label: "Mission", icon: "%" },
  { path: "/soul", label: "Soul", icon: "@" },
  { path: "/memory", label: "Memory", icon: "#" },
  { path: "/sessions", label: "Sessions", icon: ">" },
  { path: "/mcp", label: "MCP", icon: "&" },
  { path: "/settings", label: "Settings", icon: "!" },
  { path: "/journal", label: "Journal", icon: "*" },
  { path: "/freedom", label: "Freedom", icon: "^" },
];

export default function App(): React.ReactElement {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>ANIMA</h1>
          <div className="subtitle">Control Panel</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <span className="nav-icon mono">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-title">NoxSoft Inc</div>
          <div className="sidebar-footer-copy">Local-first agent continuity and orchestration.</div>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/mission" element={<MissionControl />} />
          <Route path="/soul" element={<Soul />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/mcp" element={<MCP />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/freedom" element={<Freedom />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
