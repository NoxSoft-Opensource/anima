/**
 * ANIMA Design System — NoxSoft aesthetic.
 *
 * Dark theme with orange accent, clean typography,
 * and the NoxSoft visual language.
 */

export const theme = {
  colors: {
    bg: '#0A0A0A',
    text: '#F0EEE8',
    accent: '#FF6600',
    accentDim: '#CC5200',
    accentGlow: 'rgba(255, 102, 0, 0.15)',
    muted: '#8A8A8A',
    surface: '#111111',
    surfaceHover: '#1A1A1A',
    border: '#2A2A2A',
    success: '#00C853',
    error: '#FF3B30',
    warning: '#FFB300',
  },
  fonts: {
    heading: "'Syne', system-ui, sans-serif",
    body: "'Space Grotesk', system-ui, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  radii: {
    sm: '6px',
    md: '10px',
    lg: '16px',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
}

export type Theme = typeof theme
