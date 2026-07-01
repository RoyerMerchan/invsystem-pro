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
  const borderColor = color ? `${color}30` : 'var(--border)'
  const shadowActive = color
    ? `0 16px 48px ${color}20, 0 4px 12px rgba(0,0,0,0.06)`
    : '0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)'
  const shadowBase = '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03)'
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHov(true)}
      onMouseLeave={() => hover && setHov(false)}
      className={`rounded-2xl bg-bg1 transition-all duration-220 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{
        border: `0.5px solid ${borderColor}`,
        boxShadow: active ? shadowActive : shadowBase,
        transform: active ? 'translateY(-3px)' : 'translateY(0)',
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
  title: string
  sub?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <FloatCard hover={false} style={{ padding: 20, marginBottom: 16 }}>
      <div className={`flex items-start justify-between ${sub ? 'mb-1' : 'mb-4'}`}>
        <div className="text-sm font-bold text-t1">{title}</div>
        {action}
      </div>
      {sub && <div className="text-xs text-t2 mb-4">{sub}</div>}
      {children}
    </FloatCard>
  )
}

export function KpiFloat({
  label, value, sub, color, icon,
}: {
  label: string; value: string | number; sub: string; color: string; icon: string
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="rounded-2xl bg-bg1 relative overflow-hidden cursor-default transition-all duration-250"
      style={{
        border: `1px solid ${color}22`,
        boxShadow: hov
          ? `0 16px 48px ${color}22, 0 4px 12px rgba(0,0,0,0.08)`
          : '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03)',
        transform: hov ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
        padding: '18px 18px 14px',
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg,${color},${color}66)` }} />
      <div className="absolute -bottom-4 -right-4 w-16 h-16 rounded-full transition-transform duration-300" style={{ background: `${color}10`, transform: hov ? 'scale(1.5)' : 'scale(1)' }} />
      <div className="flex items-start justify-between mb-2.5">
        <div className="text-[10px] font-bold text-t2 uppercase tracking-wider">{label}</div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: `${color}18` }}>{icon}</div>
      </div>
      <div className="text-[28px] font-extrabold leading-none tracking-tight" style={{ color }}>{value}</div>
      <div className="text-[10px] text-t3 mt-1.5">{sub}</div>
    </div>
  )
}
