import React, { useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirrored from src/ico/)
// ---------------------------------------------------------------------------

interface IcoProject {
  id: string;
  config: {
    name: string;
    symbol: string;
    chains: string[];
    bondingCurve: { targetRaiseUsd: number; initialPriceUsd: number };
    allocation: { team: number; companyRound: number; revenueShare: number; ubc: number };
    tax: { transferTaxRate: number; revenueShareRate: number };
  };
  status: {
    currentSupply: number;
    totalRaisedUsd: number;
    currentPriceUsd: number;
    bondingActive: boolean;
    percentToTarget: number;
    holders: number;
  };
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Demo data (will be replaced with gateway RPC)
// ---------------------------------------------------------------------------

const NOXSOFT_ICO: IcoProject = {
  id: "ico-noxsoft",
  config: {
    name: "NoxSoft Token",
    symbol: "NOX",
    chains: ["svrn", "ethereum"],
    bondingCurve: { targetRaiseUsd: 2_000_000, initialPriceUsd: 0.001 },
    allocation: { team: 0.05, companyRound: 0.3, revenueShare: 0.5, ubc: 0.15 },
    tax: { transferTaxRate: 0.01, revenueShareRate: 0.05 },
  },
  status: {
    currentSupply: 0,
    totalRaisedUsd: 0,
    currentPriceUsd: 0.001,
    bondingActive: true,
    percentToTarget: 0,
    holders: 0,
  },
  createdAt: Date.now(),
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string | number;
  detail?: string;
  color?: string;
}): React.ReactElement {
  return (
    <div
      className="card"
      style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4 }}
    >
      <span
        style={{
          color: "var(--color-text-muted, #888)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: color ?? "var(--color-text)",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {value}
      </span>
      {detail && (
        <span style={{ color: "var(--color-text-muted, #888)", fontSize: 12 }}>{detail}</span>
      )}
    </div>
  );
}

function AllocationBar({
  allocation,
}: {
  allocation: IcoProject["config"]["allocation"];
}): React.ReactElement {
  const segments = [
    { label: "Team", value: allocation.team, color: "#ff6600" },
    { label: "Company", value: allocation.companyRound, color: "#4db8ff" },
    { label: "Rev Share", value: allocation.revenueShare, color: "#00c853" },
    { label: "UBC", value: allocation.ubc, color: "#ff69b4" },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 24,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${s.value * 100}%`, background: s.color, transition: "width 0.3s" }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            <span style={{ color: "var(--color-text-muted, #888)" }}>{s.label}</span>
            <span style={{ fontWeight: 600 }}>{Math.round(s.value * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BondingCurveChart(): React.ReactElement {
  // Simple SVG bonding curve visualization
  const width = 600;
  const height = 200;
  const points: string[] = [];

  for (let i = 0; i <= 100; i++) {
    const x = (i / 100) * width;
    const supply = i / 100;
    const price = 0.001 + 0.001 * supply; // Linear bonding curve
    const y = height - (price / 0.002) * height;
    points.push(`${x},${y}`);
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", width: "100%" }}
    >
      <defs>
        <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6600" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ff6600" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill area */}
      <polygon
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        fill="url(#curveGrad)"
      />
      {/* Curve line */}
      <polyline points={points.join(" ")} fill="none" stroke="#ff6600" strokeWidth={2} />
      {/* Axis labels */}
      <text x={10} y={height - 5} fill="#666" fontSize={10} fontFamily="JetBrains Mono, monospace">
        Supply →
      </text>
      <text x={10} y={15} fill="#666" fontSize={10} fontFamily="JetBrains Mono, monospace">
        Price ↑
      </text>
      {/* Target line */}
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#333" strokeDasharray="4" />
      <text
        x={width - 80}
        y={height / 2 - 5}
        fill="#888"
        fontSize={9}
        fontFamily="JetBrains Mono, monospace"
      >
        $2M cap
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ICO Page
// ---------------------------------------------------------------------------

export default function ICO(): React.ReactElement {
  const [ico] = useState<IcoProject>(NOXSOFT_ICO);

  const progressPercent = Math.min(100, ico.status.percentToTarget);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <h1 className="page-title" style={{ marginBottom: 0 }}>
            {ico.config.name}
          </h1>
          <span
            className="badge"
            style={{ background: "#1a2a3a", color: "#4db8ff", fontSize: 14, padding: "4px 10px" }}
          >
            ${ico.config.symbol}
          </span>
          {ico.config.chains.map((chain) => (
            <span key={chain} className="badge" style={{ background: "#1a1a1a", color: "#888" }}>
              {chain}
            </span>
          ))}
        </div>
        <p style={{ color: "var(--color-text-muted, #888)", margin: 0, fontSize: 14 }}>
          The only ICO platform that requires you to be legally committed to doing good.
        </p>
      </div>

      {/* Progress bar */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--color-text-muted, #888)" }}>Bonding Curve Progress</span>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              color: ico.status.bondingActive ? "#ff6600" : "#00c853",
            }}
          >
            {ico.status.bondingActive
              ? `${progressPercent.toFixed(1)}% to $2M`
              : "CAP REACHED — Free Market"}
          </span>
        </div>
        <div style={{ height: 8, background: "#1a1a1a", borderRadius: 4, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              background: "linear-gradient(90deg, #ff6600, #FFD700)",
              borderRadius: 4,
              transition: "width 0.5s",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 6,
            fontSize: 11,
            color: "#666",
          }}
        >
          <span>${ico.status.totalRaisedUsd.toLocaleString()} raised</span>
          <span>${ico.config.bondingCurve.targetRaiseUsd.toLocaleString()} target</span>
        </div>
      </div>

      {/* Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <MetricCard
          label="Current Price"
          value={`$${ico.status.currentPriceUsd.toFixed(4)}`}
          color="#ff6600"
        />
        <MetricCard label="Total Raised" value={`$${ico.status.totalRaisedUsd.toLocaleString()}`} />
        <MetricCard label="Holders" value={ico.status.holders} />
        <MetricCard
          label="Supply Sold"
          value={ico.status.currentSupply.toLocaleString()}
          detail="of 1B total"
        />
        <MetricCard
          label="Transfer Tax"
          value={`${ico.config.tax.transferTaxRate * 100}%`}
          detail="on all transfers"
        />
        <MetricCard
          label="Rev Share"
          value={`${ico.config.tax.revenueShareRate * 100}%`}
          detail="for 2 years"
        />
      </div>

      {/* Bonding curve chart */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>Bonding Curve</h3>
        <BondingCurveChart />
      </div>

      {/* Allocation */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14 }}>Token Allocation</h3>
        <AllocationBar allocation={ico.config.allocation} />
      </div>

      {/* PBC Gate */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>PBC Verification Required</h3>
        <p style={{ color: "var(--color-text-muted, #888)", fontSize: 13, margin: 0 }}>
          Only verified Public Benefit Corporations can launch ICOs on NoxSoft. Prove you're
          building for public benefit — or don't launch here. Delaware PBC or equivalent in any
          jurisdiction accepted.
        </p>
      </div>
    </div>
  );
}
