import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api } from '../services/api'
import type { Producto, ProyeccionComparacion, ProyeccionHistorialItem } from '../types'
import { FloatCard, FloatSection, KpiFloat } from '../components/FloatCard'

const INPUT: React.CSSProperties = {
  fontSize: 13, padding: '7px 10px', borderRadius: 8,
  border: '0.5px solid var(--border)',
  background: 'var(--bg1)', color: 'var(--t1)', fontFamily: 'inherit', width: '100%',
}

export default function ValidacionPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [prodId, setProdId] = useState<number>(0)
  const [comparacion, setComparacion] = useState<ProyeccionComparacion | null>(null)
  const [historial, setHistorial] = useState<ProyeccionHistorialItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Producto[]>('/api/v1/productos/').then(ps => { setProductos(ps); if (ps.length) setProdId(ps[0].id) }).catch(() => {})
  }, [])

  async function validar() {
    setLoading(true); setError('')
    try {
      const [comp, hist] = await Promise.all([
        api<ProyeccionComparacion>(`/api/v1/proyecciones/comparacion/${prodId}`),
        api<ProyeccionHistorialItem[]>(`/api/v1/proyecciones/historial?producto_id=${prodId}&limit=5`),
      ])
      setComparacion(comp)
      setHistorial(hist)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>🎯 Validación de proyecciones</div>
        <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 3 }}>Compara la demanda proyectada contra las ventas reales y evalúa la precisión del modelo</div>
      </div>

      <FloatCard hover={false} style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 250 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto</label>
            <select style={INPUT} value={prodId} onChange={e => setProdId(+e.target.value)}>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <button onClick={validar} disabled={loading || !prodId} style={{
            padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: loading ? 'var(--bg2)' : '#1D9E75',
            color: loading ? 'var(--t2)' : 'white', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
          }}>
            {loading ? '⏳ Validando…' : '🎯 Validar'}
          </button>
        </div>
      </FloatCard>

      {error && (
        <FloatCard color="#DC2626" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ color: '#DC2626', fontSize: 13 }}>⚠ {error}</div>
        </FloatCard>
      )}

      {comparacion && (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <KpiFloat label="Demanda proyectada" value={`${comparacion.demanda_proyectada} u.`} sub={comparacion.modelo_usado} color="#2563EB" icon="📈" />
            <KpiFloat label="Demanda real" value={`${comparacion.demanda_real} u.`} sub="ventas reales en el período" color="#1D9E75" icon="📊" />
            <KpiFloat label="Error absoluto (MAE)" value={`${comparacion.error_absoluto} u.`} sub={comparacion.diferencia > 0 ? 'sobreestimado' : 'subestimado'} color={comparacion.error_absoluto < 10 ? '#1D9E75' : '#D97706'} icon="📏" />
            <KpiFloat label="Precisión" value={`${comparacion.precision}%`} sub={`error: ${comparacion.porcentaje_error}%`} color={comparacion.precision >= 80 ? '#1D9E75' : comparacion.precision >= 50 ? '#D97706' : '#DC2626'} icon="🎯" />
          </div>

          <FloatSection title="📊 Demanda proyectada vs real" sub="Comparación visual entre la estimación del modelo y las ventas reales">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[
                { name: 'Proyectada', valor: comparacion.demanda_proyectada },
                { name: 'Real', valor: comparacion.demanda_real },
              ]} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)} u.`, '']} contentStyle={{ fontSize: 12, borderRadius: 10, border: '0.5px solid var(--border)' }} />
                <Bar dataKey="valor" fill="#2563EB" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </FloatSection>

          <FloatSection title="📋 Detalle de validación" sub="Métricas calculadas automáticamente">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Proyección #', comparacion.proyeccion_id],
                ['Producto', comparacion.producto_nombre],
                ['Modelo', comparacion.modelo_usado],
                ['Demanda proyectada', `${comparacion.demanda_proyectada} u.`],
                ['Demanda real', `${comparacion.demanda_real} u.`],
                ['Diferencia', `${comparacion.diferencia > 0 ? '+' : ''}${comparacion.diferencia} u.`],
                ['Error absoluto (MAE)', `${comparacion.error_absoluto} u.`],
                ['Porcentaje de error', `${comparacion.porcentaje_error}%`],
                ['Precisión del pronóstico', `${comparacion.precision}%`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--t2)' }}>{l}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </FloatSection>
        </>
      )}

      {historial.length > 0 && (
        <FloatSection title="📜 Últimas proyecciones" sub="Historial de este producto">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historial.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
                <span><b>{h.modelo_utilizado}</b> · {h.horizonte_dias}d · Reponer: {h.reposicion_recomendada} u.</span>
                <span style={{ color: 'var(--t2)', fontSize: 12 }}>{new Date(h.creado_en).toLocaleDateString('es-MX')} por {h.creado_por_nombre}</span>
              </div>
            ))}
          </div>
        </FloatSection>
      )}

      {!comparacion && !loading && !error && (
        <FloatCard hover={false} style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Selecciona un producto y valida</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
            El sistema comparará la última proyección guardada contra las ventas reales del período y calculará la precisión.
          </div>
        </FloatCard>
      )}
    </div>
  )
}
