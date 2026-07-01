import { useState, useEffect, useCallback } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Brain, Scale, Search, TrendingUp, TrendingDown, BarChart3, Package, Timer, Lightbulb, FolderOpen, Trophy, Loader2, AlertTriangle, Ruler } from 'lucide-react'
import { api } from '../services/api'
import { FloatCard } from '../components/FloatCard'
import type { Producto } from '../types'

const C = { teal: '#1D9E75', blue: '#2563EB', amber: '#D97706', coral: '#DC2626', purple: '#7C3AED' }

const INPUT: React.CSSProperties = {
  fontSize: 13, padding: '7px 10px', borderRadius: 8,
  border: '0.5px solid var(--border)',
  background: 'var(--bg1)', color: 'var(--t1)', fontFamily: 'inherit',
}

interface Factor { nombre: string; impacto: number; valor: string; descripcion: string; icono: string }
interface Patron { tipo: string; descripcion: string; magnitud: number; icono: string }
interface Punto  { fecha: string; valor: number; lower_95: number; upper_95: number }

interface XAIData {
  resumen: string
  confianza: number
  nivel_confianza: string
  color_confianza: string
  factores: Factor[]
  patrones: Patron[]
  razonamiento: string[]
  recomendacion: string
  datos_historicos_dias: number
  consumo_promedio_diario: number
  tendencia_7d: number
  tendencia_30d: number
  dia_semana_pico: string
  variabilidad: string
  proyeccion: {
    modelo_usado: string
    horizonte_dias: number
    stock_actual: number
    stock_minimo: number
    dias_hasta_agotamiento: number | null
    reposicion_recomendada: number
    metricas: { mae: number; rmse: number; mape: number; aic: number | null } | null
    puntos: Punto[]
    comparacion_modelos: { modelo: string; mape: number }[] | null
  }
}

export default function XAIPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [prodId, setProdId] = useState<number>(0)
  const [modelo, setModelo] = useState('auto')
  const [horizonte, setHorizonte] = useState(30)
  const [data, setData] = useState<XAIData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'resumen' | 'factores' | 'razonamiento' | 'grafica'>('resumen')

  useEffect(() => {
    api<Producto[]>('/api/v1/productos/').then(ps => {
      setProductos(ps); if (ps.length) setProdId(ps[0].id)
    }).catch(() => {})
  }, [])

  const analizar = useCallback(async () => {
    if (!prodId) return
    setLoading(true); setError(null)
    try {
      const result = await api<XAIData>('/api/v1/proyecciones/xai', {
        method: 'POST',
        body: JSON.stringify({ producto_id: prodId, modelo, horizonte_dias: horizonte }),
      })
      setData(result); setTab('resumen')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [prodId, modelo, horizonte])

  const chartData = data?.proyeccion.puntos.map(p => ({
    fecha: format(parseISO(p.fecha), 'd MMM', { locale: es }),
    valor: +(p.valor.toFixed(2)),
    lower: +(p.lower_95.toFixed(2)),
    upper: +(p.upper_95.toFixed(2)),
  })) ?? []

  const stockData = (() => {
    if (!data) return []
    let s = data.proyeccion.stock_actual
    return data.proyeccion.puntos.map(p => {
      s = Math.max(0, s - p.valor)
      return { fecha: format(parseISO(p.fecha), 'd MMM', { locale: es }), stock: +s.toFixed(0) }
    })
  })()

  const TABS = [
    { id: 'resumen'      as const, label: <><Brain className="w-4 h-4" /> Explicación IA</> },
    { id: 'factores'     as const, label: <><Scale className="w-4 h-4" /> Factores</> },
    { id: 'razonamiento' as const, label: <><Search className="w-4 h-4" /> Razonamiento</> },
    { id: 'grafica'      as const, label: <><TrendingUp className="w-4 h-4" /> Gráfica</> },
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-[10px] mb-1">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain className="w-5 h-5" style={{color: 'white'}} />
          </div>
          <div>
            <div className="text-xl font-bold">IA Explicable — XAI</div>
            <div className="text-xs text-t2">Explainable Artificial Intelligence · Proyecciones con razonamiento transparente</div>
          </div>
        </div>
      </div>

      {/* Config panel */}
      <div className="bg-bg1 border border-border rounded-xl p-4 mb-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 items-end">
          <div>
            <label className="text-[11px] text-t2 block mb-1 uppercase tracking-[0.05em]">Producto</label>
            <select style={{ ...INPUT, width: '100%' }} value={prodId} onChange={e => setProdId(+e.target.value)}>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-t2 block mb-1 uppercase tracking-[0.05em]">Modelo</label>
            <select style={{ ...INPUT, width: '100%' }} value={modelo} onChange={e => setModelo(e.target.value)}>
              <option value="auto">Auto (mejor modelo)</option>
              <option value="holt_winters">Holt-Winters</option>
              <option value="arima">ARIMA</option>
              <option value="prophet">Prophet</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-t2 block mb-1 uppercase tracking-[0.05em]">Horizonte: {horizonte} días</label>
            <input type="range" min={7} max={90} step={7} value={horizonte}
              onChange={e => setHorizonte(+e.target.value)} style={{ width: '100%', accentColor: C.purple }} />
          </div>
          <button onClick={analizar} disabled={loading || !prodId} style={{
            ...INPUT, background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`,
            color: 'white', border: 'none', cursor: 'pointer', padding: '9px 20px',
            fontWeight: 600, opacity: loading ? 0.7 : 1, borderRadius: 9,
            display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center',
          }}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando…</> : <><Brain className="w-4 h-4" /> Analizar con XAI</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-900 p-[10px_14px] rounded-lg mb-4 text-[13px] flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</div>
      )}

      {!data && !loading && (
        <div className="text-center py-20 px-5 text-t2">
          <div className="flex justify-center mb-4"><Brain className="w-[56px] h-[56px]" style={{color: 'var(--t3)'}} /></div>
          <div className="text-base font-semibold mb-2">IA Explicable lista para analizar</div>
          <div className="text-[13px] max-w-[440px] mx-auto leading-[1.6]">
            Selecciona un producto y presiona <b>Analizar con XAI</b>. El sistema explicará
            en lenguaje natural por qué predice lo que predice, qué factores influyen
            y qué acción se recomienda tomar.
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Confianza banner */}
          <div style={{
            background: `linear-gradient(135deg, ${data.color_confianza}18, ${data.color_confianza}08)`,
            border: `1.5px solid ${data.color_confianza}40`,
            borderRadius: 12, padding: '14px 18px', marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap',
          }}>
            {/* Gauge circular */}
            <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="6"/>
                <circle cx="32" cy="32" r="26" fill="none" stroke={data.color_confianza} strokeWidth="6"
                  strokeDasharray={`${2 * Math.PI * 26 * data.confianza / 100} ${2 * Math.PI * 26}`}
                  strokeLinecap="round"
                  transform="rotate(-90 32 32)"
                  style={{ transition: 'stroke-dasharray 1s ease' }}
                />
                <text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="700" fill={data.color_confianza}>
                  {data.confianza.toFixed(0)}%
                </text>
              </svg>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] font-bold" style={{ color: data.color_confianza }}>
                  Confianza {data.nivel_confianza}
                </span>
                <span className="text-[11px] px-2 py-[2px] rounded-full font-semibold" style={{ background: `${data.color_confianza}20`, color: data.color_confianza }}>
                  {data.proyeccion.modelo_usado}
                </span>
              </div>
              <div className="text-[13px] text-t1 leading-[1.5]">{data.resumen}</div>
            </div>
          </div>

          {/* KPI rápidos */}
          <div className="grid-4" style={{ marginBottom: 16 }}>
            {[
              { label: 'Consumo/día', value: `${data.consumo_promedio_diario} u.`, icon: <Package className="w-5 h-5" />, color: C.teal },
              { label: 'Tendencia 7d', value: `${data.tendencia_7d > 0 ? '+' : ''}${data.tendencia_7d}%`, icon: data.tendencia_7d >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />, color: data.tendencia_7d > 5 ? C.coral : data.tendencia_7d < -5 ? C.amber : C.teal },
              { label: 'Días de stock', value: data.proyeccion.dias_hasta_agotamiento != null ? `${data.proyeccion.dias_hasta_agotamiento} días` : '∞', icon: <Timer className="w-5 h-5" />, color: (data.proyeccion.dias_hasta_agotamiento ?? 999) < 14 ? C.coral : C.teal },
              { label: 'Variabilidad', value: data.variabilidad, icon: <BarChart3 className="w-5 h-5" />, color: data.variabilidad === 'Alta' ? C.coral : data.variabilidad === 'Media' ? C.amber : C.teal },
            ].map(k => (
              <div key={k.label} className="bg-bg1 border border-border rounded-[10px] p-[12px_14px]">
                <div className="text-lg mb-1">{k.icon}</div>
                <div className="text-[11px] text-t2 uppercase tracking-[0.04em] mb-[3px]">{k.label}</div>
                <div className="text-lg font-bold" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Recomendación */}
          <div className="bg-bg1 rounded-xl p-[14px_18px] mb-4 flex gap-3 items-start" style={{ border: `1.5px solid ${C.blue}30` }}>
            <Lightbulb className="w-5 h-5 shrink-0" style={{color: C.blue}} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] mb-1" style={{ color: C.blue }}>Recomendación IA</div>
              <div className="text-[13px] text-t1 leading-[1.5]">{data.recomendacion}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-bg2 p-1 rounded-[10px] flex-wrap">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, minWidth: 120, padding: '7px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
                background: tab === t.id ? 'var(--bg1)' : 'transparent',
                color: tab === t.id ? 'var(--t1)' : 'var(--t2)',
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'center',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Tab: Resumen / Patrones */}
          {tab === 'resumen' && (
            <div className="grid gap-3">
              <div className="bg-bg1 border border-border rounded-xl p-4">
                <div className="text-[13px] font-semibold mb-3 flex items-center gap-1.5"><Search className="w-4 h-4" /> Patrones detectados en el historial</div>
                <div className="flex flex-col gap-[10px]">
                  {data.patrones.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 p-[10px_14px] bg-bg2 rounded-[9px]">
                      <span className="text-2xl shrink-0">{p.icono}</span>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-t1 mb-[2px]">{p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1)}</div>
                        <div className="text-xs text-t2">{p.descripcion}</div>
                      </div>
                      {/* Barra de magnitud */}
                      <div className="w-20 shrink-0">
                        <div className="h-1.5 bg-border rounded overflow-hidden">
                          <div style={{ height: '100%', width: `${p.magnitud * 100}%`, background: C.purple, borderRadius: 3, transition: 'width 0.8s ease' }} />
                        </div>
                        <div className="text-[10px] text-t3 mt-0.5 text-right">{(p.magnitud * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats historial */}
              <div className="bg-bg1 border border-border rounded-xl p-4">
                <div className="text-[13px] font-semibold mb-3 flex items-center gap-1.5"><FolderOpen className="w-4 h-4" /> Datos analizados</div>
                <div className="grid-3">
                  {[
                    { label: 'Días de historial', value: data.datos_historicos_dias, unit: 'días' },
                    { label: 'Promedio diario', value: data.consumo_promedio_diario, unit: 'u/día' },
                    { label: 'Día pico de demanda', value: data.dia_semana_pico, unit: '' },
                    { label: 'Tendencia 7 días', value: `${data.tendencia_7d > 0 ? '+' : ''}${data.tendencia_7d}`, unit: '%' },
                    { label: 'Tendencia 30 días', value: `${data.tendencia_30d > 0 ? '+' : ''}${data.tendencia_30d}`, unit: '%' },
                    { label: 'Variabilidad', value: data.variabilidad, unit: '' },
                  ].map(s => (
                    <div key={s.label} className="p-[10px_12px] bg-bg2 rounded-lg">
                      <div className="text-[10px] text-t2 uppercase tracking-[0.04em] mb-1">{s.label}</div>
                      <div className="text-base font-bold">{s.value}<span className="text-[11px] font-normal text-t2 ml-0.5">{s.unit}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab: Factores */}
          {tab === 'factores' && (
            <div className="bg-bg1 border border-border rounded-xl p-4">
              <div className="text-[13px] font-semibold mb-1 flex items-center gap-1.5"><Scale className="w-4 h-4" /> Factores que influyen en la predicción</div>
              <div className="text-xs text-t2 mb-4">
                La barra muestra el impacto relativo de cada factor. Verde = aumenta demanda · Rojo = reduce demanda o aumenta incertidumbre.
              </div>
              <div className="flex flex-col gap-[14px]">
                {data.factores.map((f, i) => {
                  const pct = Math.abs(f.impacto) * 100
                  const barColor = f.impacto > 0 ? C.teal : C.coral
                  return (
                    <div key={i} className="p-[14px_16px] bg-bg2 rounded-[10px] border border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{f.icono}</span>
                        <div className="flex-1">
                          <div className="text-xs font-semibold">{f.nombre}</div>
                          <div className="text-[11px] text-t2">{f.valor}</div>
                        </div>
                        <span className="text-xs font-bold" style={{ color: barColor }}>
                          {f.impacto > 0 ? '+' : ''}{(f.impacto * 100).toFixed(0)}%
                        </span>
                      </div>
                      {/* Barra de impacto centrada */}
                      <div className="relative h-2 bg-border rounded overflow-hidden mb-2">
                        <div style={{
                          position: 'absolute',
                          height: '100%',
                          width: `${pct}%`,
                          background: barColor,
                          borderRadius: 4,
                          left: f.impacto > 0 ? '50%' : `${50 - pct}%`,
                          transition: 'width 0.8s ease',
                        }} />
                        <div className="absolute left-1/2 top-0 w-px h-full" style={{ background: 'var(--t3)' }} />
                      </div>
                      <div className="text-[11px] text-t2 leading-[1.5]">{f.descripcion}</div>
                    </div>
                  )
                })}
              </div>

              {/* Comparación de modelos si existe */}
              {data.proyeccion.comparacion_modelos && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-[13px] font-semibold mb-[10px] flex items-center gap-1.5"><Trophy className="w-4 h-4" /> Competencia de modelos (MAPE — menor es mejor)</div>
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={data.proyeccion.comparacion_modelos} layout="vertical" margin={{ left: 8, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                      <YAxis type="category" dataKey="modelo" tick={{ fontSize: 11 }} width={160} />
                      <Tooltip formatter={(v: number) => [v.toFixed(2) + '%', 'MAPE']} contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="mape" radius={[0, 5, 5, 0]}>
                        {data.proyeccion.comparacion_modelos.map((e, i) => (
                          <Cell key={i} fill={e.modelo === data.proyeccion.modelo_usado ? C.purple : '#CBD5E1'} opacity={e.modelo === data.proyeccion.modelo_usado ? 1 : 0.5} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="text-[11px] text-t2 mt-1.5 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{backgroundColor: C.purple}}></span> Barra púrpura = modelo seleccionado con menor MAPE.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Razonamiento chain-of-thought */}
          {tab === 'razonamiento' && (
            <div className="bg-bg1 border border-border rounded-xl p-4">
              <div className="text-[13px] font-semibold mb-1 flex items-center gap-1.5"><Search className="w-4 h-4" /> Razonamiento paso a paso</div>
              <div className="text-xs text-t2 mb-4">
                Así es como la IA llegó a esta predicción — transparencia total del proceso.
              </div>
              <div className="flex flex-col gap-0">
                {data.razonamiento.map((paso, i) => (
                  <div key={i} className="flex gap-0">
                    {/* Timeline */}
                    <div className="flex flex-col items-center w-[36px] shrink-0">
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${C.purple}, ${C.blue})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                      {i < data.razonamiento.length - 1 && <div className="w-0.5 flex-1 bg-border my-1" />}
                    </div>
                    <div className="flex-1 pt-1 pb-5 pl-3">
                      <div className="text-[13px] text-t1 leading-[1.6] bg-bg2 p-[10px_14px] rounded-[9px]">
                        {paso}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Métricas del modelo */}
              {data.proyeccion.metricas && (
                <div className="mt-2 p-[14px] bg-bg2 rounded-[10px] border border-border">
                  <div className="text-xs font-semibold mb-[10px] flex items-center gap-1.5"><Ruler className="w-4 h-4" /> Métricas de validación — {data.proyeccion.modelo_usado}</div>
                  <div className="grid-4">
                    {[
                      { k: 'MAE',  v: data.proyeccion.metricas.mae.toFixed(3),  d: 'Error absoluto medio (unidades)' },
                      { k: 'RMSE', v: data.proyeccion.metricas.rmse.toFixed(3), d: 'Raíz del error cuadrático' },
                      { k: 'MAPE', v: data.proyeccion.metricas.mape.toFixed(1) + '%', d: 'Error porcentual medio', color: data.proyeccion.metricas.mape < 15 ? C.teal : data.proyeccion.metricas.mape < 30 ? C.amber : C.coral },
                      { k: 'AIC',  v: data.proyeccion.metricas.aic != null ? data.proyeccion.metricas.aic.toFixed(0) : 'N/A', d: 'Criterio de Akaike' },
                    ].map(m => (
                      <div key={m.k} className="p-[10px_12px] bg-bg1 rounded-lg">
                        <div className="text-[10px] text-t2 uppercase tracking-[0.04em]">{m.k}</div>
                        <div className="text-lg font-bold my-[3px]" style={{ color: (m as any).color ?? 'var(--t1)' }}>{m.v}</div>
                        <div className="text-[10px] text-t3 leading-[1.3]">{m.d}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Gráfica */}
          {tab === 'grafica' && (
            <div className="flex flex-col gap-3">
              <div className="bg-bg1 border border-border rounded-xl p-4">
                <div className="text-[13px] font-semibold mb-1 flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Consumo proyectado con intervalo de confianza 95%</div>
                <div className="text-[11px] text-t2 mb-[14px]">La banda sombreada muestra el rango de valores probables según la incertidumbre del modelo.</div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradXAI" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.purple} stopOpacity={0.15}/>
                        <stop offset="95%" stopColor={C.purple} stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval={Math.floor(chartData.length / 6)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(v: number, n: string) => [v.toFixed(1) + ' u.', n === 'valor' ? 'Proyección' : n === 'upper' ? 'IC sup. 95%' : 'IC inf. 95%']} />
                    <Area type="monotone" dataKey="upper" fill="url(#gradXAI)" stroke="none" legendType="none" />
                    <Area type="monotone" dataKey="lower" fill="var(--bg1)" fillOpacity={1} stroke="none" legendType="none" />
                    <Line type="monotone" dataKey="upper" stroke={C.purple} strokeWidth={1} strokeDasharray="4 3" dot={false} />
                    <Line type="monotone" dataKey="lower" stroke={C.purple} strokeWidth={1} strokeDasharray="4 3" dot={false} />
                    <Line type="monotone" dataKey="valor" stroke={C.purple} strokeWidth={2.5} dot={false} name="valor" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-bg1 border border-border rounded-xl p-4">
                <div className="text-[13px] font-semibold mb-[14px] flex items-center gap-1.5"><Package className="w-4 h-4" /> Nivel de stock proyectado</div>
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={stockData} margin={{ top: 4, right: 4, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval={Math.floor(stockData.length / 6)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: number) => [v + ' u.', 'Stock']} />
                    <ReferenceLine y={data.proyeccion.stock_minimo} stroke={C.coral} strokeDasharray="5 3"
                      label={{ value: `Mín. ${data.proyeccion.stock_minimo}`, fill: C.coral, fontSize: 11, position: 'right' }} />
                    <Area type="monotone" dataKey="stock" fill={C.purple} fillOpacity={0.1} stroke={C.purple} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
