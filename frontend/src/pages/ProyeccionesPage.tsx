import { useState, useEffect } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { TrendingUp, ClipboardList, Crosshair, Package, Timer, ShoppingCart, BarChart3, Trophy, RefreshCw, AlertTriangle, CheckCircle, Loader2, Brain, Ruler } from 'lucide-react'
import { api } from '../services/api'
import type { Producto, Proyeccion, ProyeccionHistorialItem, ProyeccionComparacion } from '../types'
import { FloatCard, FloatSection, KpiFloat } from '../components/FloatCard'

export default function ProyeccionesPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [prodId, setProdId] = useState<number>(0)
  const [modelo, setModelo] = useState('auto')
  const [horizonte, setHorizonte] = useState(30)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [agrupacion, setAgrupacion] = useState('diaria')
  const [proyeccion, setProyeccion] = useState<Proyeccion | null>(null)
  const [historial, setHistorial] = useState<ProyeccionHistorialItem[]>([])
  const [comparacion, setComparacion] = useState<ProyeccionComparacion | null>(null)
  const [tab, setTab] = useState<'proyectar' | 'historial' | 'comparar'>('proyectar')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Producto[]>('/api/v1/productos/').then(ps => { setProductos(ps); if (ps.length) setProdId(ps[0].id) }).catch(() => {})
  }, [])

  const proyectar = async () => {
    setLoading(true); setError('')
    try {
      const body: any = { producto_id: prodId, modelo, horizonte_dias: horizonte }
      if (desde) body.rango_desde = desde
      if (hasta) body.rango_hasta = hasta
      body.agrupacion = agrupacion
      const data = await api<Proyeccion>('/api/v1/proyecciones/', { method: 'POST', body: JSON.stringify(body) })
      setProyeccion(data)
      setComparacion(null)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const cargarHistorial = async () => {
    setLoading(true)
    try {
      const data = await api<ProyeccionHistorialItem[]>(`/api/v1/proyecciones/historial?producto_id=${prodId}&limit=20`)
      setHistorial(data)
      setTab('historial')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const cargarComparacion = async () => {
    setLoading(true); setError('')
    try {
      const data = await api<ProyeccionComparacion>(`/api/v1/proyecciones/comparacion/${prodId}`)
      setComparacion(data)
      setTab('comparar')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const chartData = proyeccion?.puntos.map(p => ({
    fecha: format(parseISO(p.fecha as any), 'd MMM', { locale: es }),
    valor: +(p.valor.toFixed(2)),
    lower: +(p.lower_95.toFixed(2)),
    upper: +(p.upper_95.toFixed(2)),
  })) ?? []

  const modeloColor: Record<string, string> = {
    'Promedio Móvil': 'var(--warning)', 'Suavización Simple': 'var(--info)',
    'Tendencia Lineal': 'var(--danger)',
    'Holt-Winters': 'var(--primary)', 'ARIMA': 'var(--info)', 'Prophet (Meta)': '#7C3AED',
  }
  const color = proyeccion ? (modeloColor[proyeccion.modelo_usado] ?? 'var(--primary)') : 'var(--primary)'

  return (
    <div>
      <div className="mb-6">
        <div className="text-xl font-bold tracking-tight">Proyecciones de demanda</div>
        <div className="text-sm text-t2 mt-[3px]">Modelos de series de tiempo — Promedio Móvil · Suavización Simple · Tendencia Lineal · Holt-Winters · ARIMA · Prophet</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['proyectar', 'historial', 'comparar'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-[7px] rounded-lg border-[0.5px] border-border cursor-pointer text-xs transition-all duration-150 flex items-center gap-1.5 ${
              tab === t ? 'bg-primary text-white font-semibold' : 'bg-transparent text-t2 font-normal'
            }`}>
            {t === 'proyectar' ? <><TrendingUp className="w-4 h-4" /> Proyectar</> : t === 'historial' ? <><ClipboardList className="w-4 h-4" /> Historial</> : <><Crosshair className="w-4 h-4" /> Comparar</>}
          </button>
        ))}
      </div>

      {tab === 'proyectar' && <>
        {/* Panel de configuración */}
        <FloatCard hover={false} style={{ padding: 20, marginBottom: 20 }}>
          <div className="grid gap-[14px] items-end" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            <div>
              <label className="text-[11px] font-bold text-t2 block mb-1.5 uppercase tracking-[0.05em]">Producto</label>
              <select className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 w-full" value={prodId} onChange={e => setProdId(+e.target.value)}>
                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-t2 block mb-1.5 uppercase tracking-[0.05em]">Modelo</label>
              <select className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 w-full" value={modelo} onChange={e => setModelo(e.target.value)}>
                <option value="auto">Auto (mejor modelo)</option>
                <option value="promedio_movil">Promedio Móvil</option>
                <option value="suavizacion_simple">Suavización Simple</option>
                <option value="tendencia_lineal">Tendencia Lineal</option>
                <option value="holt_winters">Holt-Winters</option>
                <option value="arima">ARIMA</option>
                <option value="prophet">Prophet</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-t2 block mb-1.5 uppercase tracking-[0.05em]">Agrupar</label>
              <select className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 w-full" value={agrupacion} onChange={e => setAgrupacion(e.target.value)}>
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold text-t2 block mb-1.5 uppercase tracking-[0.05em]">Desde</label>
              <input type="date" className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 w-full" value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-t2 block mb-1.5 uppercase tracking-[0.05em]">Hasta</label>
              <input type="date" className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 w-full" value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-t2 block mb-1.5 uppercase tracking-[0.05em]">Horizonte: {horizonte}d</label>
              <input type="range" min={7} max={90} step={7} value={horizonte}
                onChange={e => setHorizonte(+e.target.value)}
                className="w-full" style={{ accentColor: 'var(--primary)' }} />
            </div>
            <button onClick={proyectar} disabled={loading || !prodId}
              className="py-2.5 rounded-xl border-none cursor-pointer text-sm font-bold font-sans transition-all duration-150 flex items-center justify-center gap-2"
              style={{
                background: loading ? 'var(--bg2)' : 'linear-gradient(135deg, var(--primary), var(--primary-hover))',
                color: loading ? 'var(--t2)' : 'white',
              }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculando…</> : <><TrendingUp className="w-4 h-4" /> Proyectar</>}
            </button>
          </div>
        </FloatCard>

        {error && (
          <FloatCard color="var(--danger)" style={{ padding: '12px 16px', marginBottom: 16 }}>
            <div className="text-sm flex items-center gap-1.5" style={{ color: 'var(--danger)' }}><AlertTriangle className="w-4 h-4" /> {error}</div>
          </FloatCard>
        )}

        {!proyeccion && !loading && (
          <FloatCard hover={false} style={{ padding: 60, textAlign: 'center' }}>
            <div className="flex justify-center mb-3"><TrendingUp className="w-[52px] h-[52px]" style={{color: 'var(--t3)'}} /></div>
            <div className="text-[15px] font-bold mb-1.5">Selecciona un producto y proyecta</div>
            <div className="text-sm text-t2 max-w-[380px] mx-auto leading-relaxed">
              El sistema seleccionará automáticamente el mejor modelo o elige uno manualmente. Puedes filtrar por rango de fechas históricas y agrupar por día, semana o mes.
            </div>
          </FloatCard>
        )}

        {proyeccion && (<> {/* KPIs, chart, model comparison, warnings - same as before */}
          <div className="grid-4 mb-4">
            <KpiFloat label="Modelo usado" value={proyeccion.modelo_usado.split(' ')[0]} sub={proyeccion.modelo_usado} color={color} icon={<Brain className="w-5 h-5" />} />
            <KpiFloat label="Stock actual" value={`${proyeccion.stock_actual} u.`} sub="unidades disponibles" color="var(--info)" icon={<Package className="w-5 h-5" />} />
            <KpiFloat label="Días hasta agotarse" value={proyeccion.dias_hasta_agotamiento != null ? `${proyeccion.dias_hasta_agotamiento}d` : '∞'} sub="estimado" color={(proyeccion.dias_hasta_agotamiento ?? 999) < 14 ? 'var(--danger)' : 'var(--primary)'} icon={<Timer className="w-5 h-5" />} />
            <KpiFloat label="Reposición sugerida" value={`${proyeccion.reposicion_recomendada} u.`} sub="para cubrir horizonte" color="var(--warning)" icon={<ShoppingCart className="w-5 h-5" />} />
          </div>
          {proyeccion.guardado_id && (
            <div className="text-[11px] text-primary mb-3 text-right flex items-center justify-end gap-1"><CheckCircle className="w-3.5 h-3.5" /> Proyección guardada (ID: {proyeccion.guardado_id})</div>
          )}
          {proyeccion.metricas && (<div className="grid-4 mb-4">
            {[
              { k: 'MAE', v: proyeccion.metricas.mae.toFixed(3), d: 'Error absoluto medio', c: '#7C3AED' },
              { k: 'RMSE', v: proyeccion.metricas.rmse.toFixed(3), d: 'Raíz error cuadrático', c: '#7C3AED' },
              { k: 'MAPE', v: proyeccion.metricas.mape.toFixed(1)+'%', d: 'Error porcentual', c: proyeccion.metricas.mape < 15 ? 'var(--primary)' : proyeccion.metricas.mape < 30 ? 'var(--warning)' : 'var(--danger)' },
              { k: 'AIC', v: proyeccion.metricas.aic != null ? proyeccion.metricas.aic.toFixed(0) : 'N/A', d: 'Criterio Akaike', c: '#7C3AED' },
            ].map(m => (
              <FloatCard key={m.k} color={m.c} style={{ padding: '14px 16px' }}>
                <div className="text-[10px] font-bold text-t2 uppercase tracking-[0.06em] mb-1.5">{m.k}</div>
                <div className="text-2xl font-extrabold" style={{ color: m.c }}>{m.v}</div>
                <div className="text-[10px] text-t3 mt-1">{m.d}</div>
              </FloatCard>
            ))}
          </div>)}
          <FloatSection title="Proyección con intervalo de confianza 95%" sub="La banda sombreada representa la incertidumbre del modelo">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} margin={{ left: -10, right: 4 }}>
                <defs><linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(chartData.length / 6)} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '0.5px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  formatter={(v: number, n: string) => [v.toFixed(1) + ' u.', n === 'valor' ? 'Proyección' : n === 'upper' ? 'IC sup. 95%' : 'IC inf. 95%']} />
                <Area type="monotone" dataKey="upper" fill={`url(#projGrad)`} stroke="none" />
                <Area type="monotone" dataKey="lower" fill="var(--bg1)" fillOpacity={1} stroke="none" />
                <Line type="monotone" dataKey="upper" stroke={color} strokeWidth={1} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="lower" stroke={color} strokeWidth={1} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="valor" stroke={color} strokeWidth={2.5} dot={false} name="valor" />
              </ComposedChart>
            </ResponsiveContainer>
          </FloatSection>
          {proyeccion.comparacion_modelos && (<FloatSection title="Comparación de modelos" sub="Menor MAPE = mejor precisión">
            <div className="flex flex-col gap-2">
              {proyeccion.comparacion_modelos.sort((a, b) => a.mape - b.mape).map((m, i) => {
                const mc = modeloColor[m.modelo] ?? '#888'
                return (<div key={m.modelo} className="flex items-center gap-3 p-[12px_14px] rounded-xl" style={{
                  background: i === 0 ? `${mc}10` : 'var(--bg2)',
                  border: i === 0 ? `1px solid ${mc}30` : '0.5px solid var(--border)',
                }}>
                  <div className="flex items-center justify-center w-6 h-6 shrink-0">
                    {i === 0 ? <Trophy className="w-4 h-4" style={{color: mc}} /> : <span className="text-sm font-bold text-t3">{i + 1}</span>}
                  </div>
                  <div className="flex-1 text-sm" style={{ fontWeight: i === 0 ? 700 : 500, color: i === 0 ? mc : 'var(--t1)' }}>{m.modelo}</div>
                  {[['MAE', m.mae.toFixed(3)], ['RMSE', m.rmse.toFixed(3)], ['MAPE', m.mape.toFixed(1)+'%']].map(([lbl, val]) => (
                    <div key={lbl} className="text-center min-w-[64px]">
                      <div className="text-sm font-bold" style={{ color: i === 0 ? mc : 'var(--t1)' }}>{val}</div>
                      <div className="text-[10px] text-t3">{lbl}</div>
                    </div>
                  ))}
                </div>)
              })}
            </div>
          </FloatSection>)}
          {proyeccion.advertencias?.length > 0 && (<FloatCard color="var(--warning)" style={{ padding: '14px 18px' }}>
            {proyeccion.advertencias.map((a, i) => (
              <div key={i} className="text-xs flex items-center gap-1.5" style={{ color: '#92400E', marginBottom: i < proyeccion.advertencias.length - 1 ? 6 : 0 }}><AlertTriangle className="w-3 h-3" /> {a}</div>
            ))}
          </FloatCard>)}
        </>)}
      </>}

      {tab === 'historial' && <>
        <div className="flex gap-2 mb-4 items-center">
          <select className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 max-w-[250px]" value={prodId} onChange={e => { setProdId(+e.target.value); cargarHistorial() }}>
            {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={cargarHistorial}
            className="text-xs px-3.5 py-[7px] rounded-lg cursor-pointer border-[0.5px] border-border bg-transparent text-t1 flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Cargar
          </button>
        </div>
        {historial.length === 0
          ? <div className="p-10 text-center text-t2">No hay proyecciones guardadas para este producto.</div>
          : <div className="flex flex-col gap-2">
              {historial.map(h => (
                <FloatCard key={h.id} hover={false} color={modeloColor[h.modelo_utilizado] ?? '#888'} style={{ padding: '12px 16px' }}>
                  <div className="flex justify-between items-center text-sm">
                    <div><b>{h.modelo_utilizado}</b> · {h.horizonte_dias}d · Reponer: {h.reposicion_recomendada} u.</div>
                    <div className="text-t2 text-[11px]">{h.creado_por_nombre} · {new Date(h.creado_en).toLocaleDateString('es-MX')}</div>
                  </div>
                </FloatCard>
              ))}
            </div>
        }
      </>}

      {tab === 'comparar' && <>
        <div className="flex gap-2 mb-4 items-center">
          <select className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 max-w-[250px]" value={prodId} onChange={e => setProdId(+e.target.value)}>
            {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={cargarComparacion}
            className="text-xs px-3.5 py-[7px] rounded-lg cursor-pointer bg-primary text-white border-none flex items-center gap-1.5">
            <Crosshair className="w-4 h-4" /> Comparar
          </button>
        </div>
        {comparacion && (
          <div>
            <div className="grid-4 mb-4">
              <KpiFloat label="Demanda proyectada" value={`${comparacion.demanda_proyectada} u.`} sub={comparacion.modelo_usado} color="var(--info)" icon={<TrendingUp className="w-5 h-5" />} />
              <KpiFloat label="Demanda real" value={`${comparacion.demanda_real} u.`} sub="ventas reales" color="var(--primary)" icon={<BarChart3 className="w-5 h-5" />} />
              <KpiFloat label="Diferencia" value={`${comparacion.diferencia > 0 ? '+' : ''}${comparacion.diferencia}`} sub={comparacion.diferencia > 0 ? 'sobreestimado' : 'subestimado'} color={comparacion.error_absoluto < 10 ? 'var(--primary)' : 'var(--warning)'} icon={<Ruler className="w-5 h-5" />} />
              <KpiFloat label="Precisión" value={`${comparacion.precision}%`} sub={`error: ${comparacion.porcentaje_error}%`} color={comparacion.precision >= 80 ? 'var(--primary)' : comparacion.precision >= 50 ? 'var(--warning)' : 'var(--danger)'} icon={<Crosshair className="w-5 h-5" />} />
            </div>
            <FloatCard style={{ padding: 16 }}>
              <div className="text-sm font-semibold mb-3 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> Detalle de validación</div>
              <div className="text-xs flex flex-col gap-2">
                {[['Proyección #', comparacion.proyeccion_id], ['Modelo', comparacion.modelo_usado], ['Producto', comparacion.producto_nombre], ['MAE', `${comparacion.error_absoluto} u.`], ['% Error', `${comparacion.porcentaje_error}%`], ['Precisión', `${comparacion.precision}%`]].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-1 border-b-[0.5px] border-border">
                    <span className="text-t2">{l}</span><span className="font-semibold">{v}</span>
                  </div>
                ))}
              </div>
            </FloatCard>
          </div>
        )}
        {!comparacion && !loading && <div className="p-10 text-center text-t2">Selecciona un producto y presiona Comparar.</div>}
      </>}
    </div>
  )
}
