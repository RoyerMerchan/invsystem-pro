import { useEffect, useState } from 'react'
import { api, fmt } from '../services/api'
import type { Alerta, Producto } from '../types'
import { FloatCard, FloatSection, KpiFloat } from '../components/FloatCard'

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Alerta>('/api/v1/alertas/').then(setAlertas).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div>
      <div className="mb-6">
        <div className="h-7 w-[200px] bg-bg2 rounded-lg mb-2 animate-pulse" />
        <div className="h-4 w-[300px] bg-bg2 rounded-md animate-pulse" />
      </div>
      <div className="grid-3 mb-5">
        {[...Array(3)].map((_, i) => <div key={i} className="h-[110px] bg-bg2 rounded-2xl animate-pulse" />)}
      </div>
    </div>
  )
  if (!alertas) return null

  return (
    <div>
      <div className="mb-6">
        <div className="text-xl font-bold tracking-tight">Alertas de inventario</div>
        <div className="text-xs text-t2 mt-1">Productos que requieren atención inmediata</div>
      </div>

      {/* KPIs flotantes */}
      <div className="grid-4 mb-5">
        <KpiFloat label="Sin stock"     value={alertas.resumen.sin_stock}    sub="productos agotados"            color="#DC2626" icon="🚫" />
        <KpiFloat label="Stock bajo"    value={alertas.resumen.stock_bajo}   sub="requieren reposición"          color="#D97706" icon="⚠️" />
        <KpiFloat label="Sobreexistencia" value={alertas.resumen.stock_exceso} sub="exceden el máximo"           color="#2563EB" icon="📈" />
        <KpiFloat label="Normal"        value={alertas.resumen.normal}       sub="en niveles adecuados"          color="#1D9E75" icon="✅" />
      </div>

      {/* Sin stock */}
      <FloatSection title="🚫 Sin stock — acción urgente" sub="Estos productos están completamente agotados">
        {alertas.sin_stock.length === 0
          ? <EmptyMsg msg="No hay productos sin stock. ¡Todo en orden! 🎉" />
          : <div className="flex flex-col gap-2">
              {alertas.sin_stock.map(p => <AlertCard key={p.id} p={p} tipo="danger" />)}
            </div>
        }
      </FloatSection>

      {/* Stock bajo */}
      <FloatSection title="⚠️ Stock bajo — reabastecer pronto" sub="Stock por debajo del mínimo requerido">
        {alertas.stock_bajo.length === 0
          ? <EmptyMsg msg="Ningún producto con stock bajo. ¡Excelente gestión!" />
          : <div className="flex flex-col gap-2">
              {alertas.stock_bajo.map(p => <AlertCard key={p.id} p={p} tipo="warn" />)}
            </div>
        }
      </FloatSection>

      {/* Sobreexistencia */}
      <FloatSection title="📈 Sobreexistencia — exceden el máximo" sub="Stock por encima del máximo configurado">
        {!alertas.stock_exceso || alertas.stock_exceso.length === 0
          ? <EmptyMsg msg="Ningún producto excede su stock máximo." />
          : <div className="flex flex-col gap-2">
              {alertas.stock_exceso.map(p => <AlertCard key={p.id} p={p} tipo="exceso" />)}
            </div>
        }
      </FloatSection>
    </div>
  )
}

function AlertCard({ p, tipo }: { p: Producto; tipo: 'danger' | 'warn' | 'exceso' }) {
  const [hov, setHov] = useState(false)
  const isCrit = tipo === 'danger'
  const isExceso = tipo === 'exceso'
  const color  = isExceso ? '#2563EB' : (isCrit ? '#DC2626' : '#D97706')
  const bg     = isExceso ? '#EFF6FF' : (isCrit ? '#FEF2F2' : '#FFFBEB')
  const faltante = p.stock_minimo - p.stock_actual
  const exceso = isExceso ? p.stock_actual - p.stock_maximo : 0

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-[0.18s] ease-in-out"
      style={{
        background: bg,
        border: `1px solid ${color}22`,
        boxShadow: hov ? `0 8px 24px ${color}18` : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hov ? 'translateX(4px)' : 'translateX(0)',
      }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: `${color}15` }}>
        {isExceso ? '📈' : (isCrit ? '📦' : '⚠️')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-t1 mb-0.5">{p.nombre}</div>
        <div className="text-[11px] text-t2">SKU: {p.sku} · {p.categoria}</div>
      </div>
      <div className="flex gap-5 shrink-0">
        <Stat label="En stock"  value={p.stock_actual}  color={color} />
        <Stat label="Mínimo"    value={p.stock_minimo}  color="var(--t2)" />
        {isExceso && <Stat label="Exceso" value={`+${exceso}`} color={color} />}
        {!isCrit && !isExceso && <Stat label="Faltan" value={`-${faltante}`} color={color} />}
        <Stat label="Precio"    value={fmt(p.precio_unitario)} color="var(--t1)" />
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center min-w-[54px]">
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-t3">{label}</div>
    </div>
  )
}

function EmptyMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2.5 py-3 text-t2 text-xs">
      {msg}
    </div>
  )
}
