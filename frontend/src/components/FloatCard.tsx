import { useState } from 'react'

export function FloatCard({
  children, style = {}, color, hover = true, onClick,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  color?: string
  hover?: boolean
  onClick?: () => void
}) {
  const [hov, setHov] = useState(false)
  const active = hover && hov
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHov(true)}
      onMouseLeave={() => hover && setHov(false)}
      className="rounded-xl bg-surface border border-border transition-all duration-200"
      style={{
        boxShadow: active ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: active ? 'translateY(-2px)' : 'translateY(0)',
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function FloatSection({
  title, sub, children, action,
}: {
  title: React.ReactNode
  sub?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <FloatCard hover={false} style={{ padding: 24, marginBottom: 16 }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-t1">{title}</div>
          {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
        </div>
        {action}
      </div>
      {children}
    </FloatCard>
  )
}

export function KpiFloat({
  label, value, sub, color, icon,
}: {
  label: string; value: string | number; sub: string; color: string; icon: React.ReactNode
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="rounded-xl bg-surface border border-border p-5 transition-all duration-200"
      style={{
        '--kfi-color': color,
        boxShadow: hov ? '0 4px 16px color-mix(in srgb, var(--kfi-color) 12.5%, transparent)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'color-mix(in srgb, var(--kfi-color) 8%, transparent)', color }}
        >
          {icon}
        </div>
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-[32px] font-bold leading-none tracking-tight mb-1" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  )
}
