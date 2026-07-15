import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { Package, Wallet, AlertTriangle, CircleX, CalendarDays, Clock3 } from 'lucide-react'
import { api, fmt } from '../services/api'
import type { Producto, Alerta } from '../types'

const COLORS = ['var(--primary)', 'var(--info)', 'var(--warning)', 'var(--danger)', '#7C3AED', '#0891B2']

interface DashboardStats {
  total_productos: number
  valor_total: number
  stock_bajo: number
  sin_stock: number
  por_categoria: { categoria: string; valor: number; productos: number }[]
}

interface TopItem { id: number; nombre: string; sku: string; stock_actual: number; total_vendido?: number; total_vendido_60d?: number }

// ── Cuadrito flotante base ────────────────────────────────────────
function FloatCard({
  children, style = {}, hover = true,
}: { children: React.ReactNode; style?: React.CSSProperties; hover?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      className="bg-bg1 rounded-2xl border border-border"
      style={{
        boxShadow: hovered
          ? '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)'
          : '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'box-shadow 0.25s ease, transform 0.25s ease',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── KPI flotante con acento de color ─────────────────────────────
function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub: string; color: string; icon: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="bg-bg1 rounded-2xl relative overflow-hidden cursor-default px-5 pt-5 pb-4"
      style={{
        '--kc-color': color,
        border: '1px solid color-mix(in srgb, var(--kc-color) 13%, transparent)',
        boxShadow: hovered
          ? '0 16px 48px color-mix(in srgb, var(--kc-color) 13%, transparent), 0 4px 12px rgba(0,0,0,0.08)'
          : '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
        transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
      } as React.CSSProperties}
    >
      {/* Acento de color arriba */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
        style={{
          background: 'linear-gradient(90deg, var(--kc-color), color-mix(in srgb, var(--kc-color) 53%, transparent))',
        }}
      />
      {/* Círculo decorativo fondo */}
      <div
        className="absolute bottom-[-20px] right-[-20px] w-20 h-20 rounded-full"
        style={{
          background: 'color-mix(in srgb, var(--kc-color) 6%, transparent)',
          transition: 'transform 0.3s ease',
          transform: hovered ? 'scale(1.4)' : 'scale(1)',
        }}
      />
      <div className="flex items-start justify-between mb-3">
        <div className="text-[11px] font-semibold text-t2 uppercase tracking-[0.06em]">
          {label}
        </div>
        <div
          className="w-8 h-8 rounded-[9px] flex items-center justify-center text-base"
          style={{ background: 'color-mix(in srgb, var(--kc-color) 9%, transparent)' }}
        >
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold tracking-[-0.5px] leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-t3 mt-1.5">{sub}</div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [topDemanda, setTopDemanda] = useState<TopItem[]>([])
  const [menorRotacion, setMenorRotacion] = useState<TopItem[]>([])
  const [ventasHistoricas, setVentasHistoricas] = useState<{ fecha: string; total: number }[]>([])
  const [now, setNow] = useState(() => new Date())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    Promise.all([
      api<Producto[]>('/api/v1/productos/'),
      api<Alerta>('/api/v1/alertas/'),
      api<TopItem[]>('/api/v1/productos/top-demanda'),
      api<TopItem[]>('/api/v1/productos/menor-rotacion'),
      api<{ fecha: string; total: number }[]>('/api/v1/productos/ventas-historicas'),
    ])
      .then(([productos, alertas, top, rotacion, ventas]) => {
        const por_cat: Record<string, { valor: number; productos: number }> = {}
        let valor_total = 0
        for (const p of productos) {
          valor_total += p.stock_actual * p.precio_unitario
          if (!por_cat[p.categoria]) por_cat[p.categoria] = { valor: 0, productos: 0 }
          por_cat[p.categoria].valor += p.stock_actual * p.precio_unitario
          por_cat[p.categoria].productos++
        }
        setStats({
          total_productos: productos.length,
          valor_total,
          stock_bajo: alertas.resumen.stock_bajo,
          sin_stock: alertas.resumen.sin_stock,
          por_categoria: Object.entries(por_cat).map(([categoria, d]) => ({ categoria, ...d })),
        })
        setTopDemanda(top)
        setMenorRotacion(rotacion)
        setVentasHistoricas(ventas)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton expanded />
  if (error) return (
    <FloatCard style={{ padding: 20 }}>
      <div className="text-danger text-[13px]">
        <strong>Error al cargar el dashboard:</strong> {error}
      </div>
    </FloatCard>
  )
  if (!stats) return null

  const kpis = [
    { label: 'Total productos', value: stats.total_productos, sub: 'productos en inventario', color: 'var(--primary)', icon: <Package className="w-5 h-5" /> },
    { label: 'Valor total',     value: fmt(stats.valor_total), sub: 'en existencias',          color: 'var(--info)', icon: <Wallet className="w-5 h-5" /> },
    { label: 'Stock bajo',      value: stats.stock_bajo,       sub: 'requieren atención',       color: 'var(--warning)', icon: <AlertTriangle className="w-5 h-5" /> },
    { label: 'Sin stock',       value: stats.sin_stock,        sub: 'productos agotados',        color: 'var(--danger)', icon: <CircleX className="w-5 h-5" /> },
  ]

  // Datos de área simulados para sparkline
  const sparkData = stats.por_categoria.map((c, i) => ({ name: c.categoria, valor: c.valor, idx: i }))
  // Hora local del dispositivo (sin zona horaria fija)
  const fechaActual = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(now)
  const horaActual = new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        sub="Resumen general del inventario"
        action={
          <div className="flex flex-wrap items-center gap-2 text-xs text-t2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 capitalize">
              <CalendarDays className="w-4 h-4 text-primary" /> {fechaActual}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-semibold tabular-nums text-t1">
              <Clock3 className="w-4 h-4 text-primary" /> {horaActual}
            </span>
          </div>
        }
      />

      {/* KPIs flotantes */}
      <div className="grid-4 mb-5">
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Mayor demanda + Menor rotación — subido al segundo lugar */}
      <div className="grid-2 mb-4">
        <FloatCard style={{ padding: 20 }}>
          <div className="text-[13px] font-semibold mb-3">Mayor demanda (30 días)</div>
          {topDemanda.length === 0
            ? <div className="text-[12px] text-t2">Sin datos</div>
            : <div className="flex flex-col gap-2">
                {topDemanda.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-[10px] py-1.5 border-b border-border">
                    <div className="w-[22px] h-[22px] rounded-[6px] text-white text-[10px] font-bold flex items-center justify-center" style={{ background: COLORS[i] }}>{i + 1}</div>
                    <div className="flex-1 text-[12px]">{t.nombre}</div>
                    <div className="text-[12px] font-semibold text-primary">{t.total_vendido} u.</div>
                  </div>
                ))}
              </div>
          }
        </FloatCard>
        <FloatCard style={{ padding: 20 }}>
          <div className="text-[13px] font-semibold mb-3">Menor rotación (60 días)</div>
          {menorRotacion.length === 0
            ? <div className="text-[12px] text-t2">Sin datos</div>
            : <div className="flex flex-col gap-2">
                {menorRotacion.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-[10px] py-1.5 border-b border-border">
                    <div className="w-[22px] h-[22px] rounded-[6px] bg-warning text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
                    <div className="flex-1 text-[12px]">{t.nombre}</div>
                    <div className="text-[12px] font-semibold text-warning">{t.total_vendido_60d} u.</div>
                  </div>
                ))}
              </div>
          }
        </FloatCard>
      </div>

      {/* Gráficas flotantes */}
      <div className="grid-2 mb-4">
        <FloatCard style={{ padding: 20 }}>
          <div className="text-[13px] font-semibold mb-1">Valor por categoría</div>
          <div className="text-[11px] text-t3 mb-[14px]">Inventario valorizado en $</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.por_categoria} margin={{ left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="categoria" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => [fmt(v), 'Valor']}
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '0.5px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                cursor={{ fill: 'var(--bg2)' }}
              />
              <Bar dataKey="valor" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </FloatCard>

        <FloatCard style={{ padding: 20 }}>
          <div className="text-[13px] font-semibold mb-1">Distribución de productos</div>
          <div className="text-[11px] text-t3 mb-[14px]">Cantidad por categoría</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={stats.por_categoria} dataKey="productos" nameKey="categoria"
                cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                paddingAngle={3}
                label={({ categoria, percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false} fontSize={11}
              >
                {stats.por_categoria.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '0.5px solid var(--border)' }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Leyenda */}
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
            {stats.por_categoria.map((c, i) => (
              <div key={c.categoria} className="flex items-center gap-[5px] text-[11px] text-t2">
                <div className="w-2 h-2 rounded-[2px]" style={{ background: COLORS[i % COLORS.length] }} />
                {c.categoria} ({c.productos})
              </div>
            ))}
          </div>
        </FloatCard>
      </div>

      {/* Tendencia general — area chart */}
      {sparkData.length > 1 && (
        <FloatCard style={{ padding: 20, marginBottom: 16 }}>
          <div className="text-[13px] font-semibold mb-1">Valor acumulado por categoría</div>
          <div className="text-[11px] text-t3 mb-[14px]">Comparativa de peso de cada categoría</div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={sparkData} margin={{ left: -10 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--info)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--info)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [fmt(v), 'Valor']} contentStyle={{ fontSize: 12, borderRadius: 10, border: '0.5px solid var(--border)' }} />
              <Area type="monotone" dataKey="valor" stroke="var(--info)" strokeWidth={2} fill="url(#areaGrad)" dot={{ r: 4, fill: 'var(--info)' }} />
            </AreaChart>
          </ResponsiveContainer>
        </FloatCard>
      )}

      {/* Ventas históricas */}
      <FloatCard style={{ padding: 20, marginBottom: 16 }}>
        <div className="text-[13px] font-semibold mb-1">Ventas históricas (30 días)</div>
        <div className="text-[11px] text-t3 mb-[14px]">Salidas diarias totales</div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={ventasHistoricas} margin={{ left: -10 }}>
            <defs><linearGradient id="ventasGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="fecha" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '0.5px solid var(--border)' }} />
            <Area type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} fill="url(#ventasGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </FloatCard>

    </div>
  )
}

function Skeleton({ expanded }: { expanded?: boolean }) {
  return (
    <div>
      <div className="mb-5 h-10 bg-bg2 rounded-xl animate-[pulse_1.5s_infinite] w-[200px]" />
      <div className="grid-4 mb-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[110px] bg-bg2 rounded-2xl animate-[pulse_1.5s_infinite]" style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      <div className="grid-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-[260px] bg-bg2 rounded-2xl animate-[pulse_1.5s_infinite]" />
        ))}
      </div>
      {expanded && (
        <div className="grid-2 mt-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-[160px] bg-bg2 rounded-2xl animate-[pulse_1.5s_infinite]" />
          ))}
        </div>
      )}
    </div>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-xl font-bold text-t1 tracking-[-0.3px]">{title}</div>
        <div className="text-[13px] text-t2 mt-[3px]">{sub}</div>
      </div>
      {action}
    </div>
  )
}

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <FloatCard style={{ padding: 20, marginBottom: 16 }}>
      <div className="flex items-center justify-between mb-[14px]">
        <span className="text-[14px] font-semibold text-t1">{title}</span>
        {action}
      </div>
      {children}
    </FloatCard>
  )
}
