/**
 * KioskoPage — Modo kiosko para operarios de almacén
 *
 * Interfaz simplificada táctil para tablet/pantalla de almacén.
 * Solo muestra: escanear SKU → entrada o salida → confirmar.
 * Sin acceso a reportes, proyecciones ni configuración.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Package, Camera, CheckCircle, XCircle, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react'
import { api } from '../services/api'

type Paso = 'inicio' | 'producto' | 'tipo' | 'cantidad' | 'confirmado' | 'error'

interface Producto {
  id: number
  nombre: string
  sku: string
  categoria: string
  stock_actual: number
  stock_minimo: number
  unidad_medida: string
  estado: string
}



interface Props {
  onSalirKiosko: () => void
}

export default function KioskoPage({ onSalirKiosko }: Props) {
  const [paso, setPaso] = useState<Paso>('inicio')
  const [sku, setSku] = useState('')
  const [producto, setProducto] = useState<Producto | null>(null)
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('salida')
  const [cantidad, setCantidad] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [historial, setHistorial] = useState<any[]>([])
  const [horaActual, setHoraActual] = useState(new Date())
  const [fullscreen, setFullscreen] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Reloj en tiempo real
  useEffect(() => {
    const t = setInterval(() => setHoraActual(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Focus automático en el input cuando se muestra
  useEffect(() => {
    if (paso === 'inicio') {
      setTimeout(() => inputRef.current?.focus(), 100)
      setSku('')
    }
  }, [paso])

  // Cargar historial al inicio
  useEffect(() => {
    cargarHistorial()
  }, [])

  const cargarHistorial = async () => {
    try {
      const data = await api<any[]>('/api/v1/scanner/historial?limit=6')
      setHistorial(data)
    } catch {}
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setFullscreen(true)
    } else {
      document.exitFullscreen()
      setFullscreen(false)
    }
  }

  // Buscar producto por SKU
  const buscarProducto = async (skuBuscar: string) => {
    if (!skuBuscar.trim()) return
    setLoading(true)
    try {
      const data = await api<any[]>(`/api/v1/scanner/buscar?q=${encodeURIComponent(skuBuscar.trim().toUpperCase())}`)
      setProducto(data[0])
      setPaso('tipo')
    } catch (e: any) {
      setErrorMsg(`Producto no encontrado: ${skuBuscar}`)
      setPaso('error')
    } finally {
      setLoading(false)
    }
  }

  // Registrar movimiento
  const confirmarMovimiento = async () => {
    if (!producto) return
    setLoading(true)
    try {
      const res = await api<any>('/api/v1/scanner/movimiento', {
        method: 'POST',
        body: JSON.stringify({ sku: producto.sku, tipo, cantidad, motivo: 'Kiosko de almacén' }),
      })
      setSuccessMsg(res.mensaje)
      setPaso('confirmado')
      cargarHistorial()
      setTimeout(() => {
        setPaso('inicio')
        setProducto(null)
        setCantidad(1)
        setSuccessMsg('')
      }, 3000)
    } catch (e: any) {
      setErrorMsg(e.message)
      setPaso('error')
    } finally {
      setLoading(false)
    }
  }

  const reiniciar = () => {
    setPaso('inicio')
    setProducto(null)
    setCantidad(1)
    setErrorMsg('')
    setSku('')
  }

  const estadoColor = (e: string) =>
    e === 'sin_stock' ? '#D85A30' : e === 'stock_bajo' ? '#BA7517' : '#1D9E75'

  // ── Estilos base ─────────────────────────────────────────────
  const S = {
    page: {
      minHeight: '100vh', background: '#0F1117', color: '#F0F0F0',
      userSelect: 'none' as const,
    } as React.CSSProperties,
    logo: {
      width: 38, height: 38, background: '#1D9E75', borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
    },
    btn: (bg: string, color = 'white', border = 'none') => ({
      background: bg, color, border, borderRadius: 12, cursor: 'pointer',
      fontFamily: 'inherit', fontWeight: 600, transition: 'opacity .15s',
    } as React.CSSProperties),
    card: {
      background: '#1A1D27', border: '1px solid #2A2D3A',
      borderRadius: 16, overflow: 'hidden' as const,
    },
  }

  return (
    <div className="font-sans flex flex-col" style={S.page}>
      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div className="bg-[#1A1D27] border-b border-[#2A2D3A] px-6 py-3 flex items-center gap-4">
        <div style={S.logo}><Package className="w-5 h-5" /></div>
        <div>
          <div className="text-[15px] font-bold text-[#F0F0F0]">
            InvSystem Pro — Modo Kiosko
          </div>
          <div className="text-xs text-[#6B7280]">Panel de almacén</div>
        </div>

        <div className="ml-auto flex gap-3 items-center">
          {/* Reloj */}
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-[#1D9E75]">
              {horaActual.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[11px] text-[#6B7280]">
              {horaActual.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>

          <button onClick={toggleFullscreen} style={{ ...S.btn('#2A2D3A', '#A0A0A0'), padding: '8px 14px', fontSize: 13 }}>
            {fullscreen ? '⊠ Salir pantalla' : '⛶ Pantalla completa'}
          </button>

          {/* Salir del modo kiosko — requiere doble clic para evitar accidente */}
          <button
            onDoubleClick={onSalirKiosko}
            title="Doble clic para salir del modo kiosko"
            style={{ ...S.btn('#2A2D3A', '#D85A30'), padding: '8px 14px', fontSize: 12, border: '1px solid #D85A30' }}
          >
            ✕ Salir (doble clic)
          </button>
        </div>
      </div>

      {/* ── Contenido principal ─────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-[1fr_320px] gap-5 p-5">

        {/* Panel central */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* PASO: INICIO — escanear / ingresar SKU */}
          {paso === 'inicio' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: 12 }}><Camera className="w-16 h-16" /></div>
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Escanea o ingresa el SKU</div>
                <div style={{ fontSize: 16, color: '#6B7280' }}>Apunta el lector al código de barras o escribe el SKU del producto</div>
              </div>

              <div style={{ width: '100%', maxWidth: 500, display: 'flex', gap: 12 }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={sku}
                  onChange={e => setSku(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && buscarProducto(sku)}
                  placeholder="SKU del producto..."
                  autoComplete="off"
                  style={{
                    flex: 1, padding: '18px 20px', fontSize: 20, fontWeight: 500,
                    background: '#1A1D27', border: '2px solid #1D9E75', borderRadius: 12,
                    color: '#F0F0F0', fontFamily: 'inherit', letterSpacing: '0.05em',
                  }}
                />
                <button
                  onClick={() => buscarProducto(sku)}
                  disabled={loading || !sku}
                  style={{ ...S.btn('#1D9E75'), padding: '18px 28px', fontSize: 18, opacity: loading || !sku ? 0.5 : 1 }}
                >
                  {loading ? '...' : '→'}
                </button>
              </div>

              <div style={{ fontSize: 13, color: '#4B5563', textAlign: 'center' }}>
                💡 Los lectores USB envían Enter automáticamente al escanear
              </div>
            </div>
          )}

          {/* PASO: TIPO — entrada o salida */}
          {paso === 'tipo' && producto && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Info producto */}
              <div style={{ ...S.card, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: '#0F1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Package size={28} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{producto.nombre}</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#6B7280', marginBottom: 8 }}>{producto.sku}</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 15, color: '#A0A0A0' }}>Stock actual:</span>
                      <span style={{ fontSize: 22, fontWeight: 700, color: estadoColor(producto.estado) }}>
                        {producto.stock_actual} {producto.unidad_medida}(s)
                      </span>
                    </div>
                  </div>
                  <button onClick={reiniciar} style={{ ...S.btn('#2A2D3A', '#A0A0A0'), padding: '10px 16px', fontSize: 13 }}>✕ Cancelar</button>
                </div>
              </div>

              {/* Botones entrada / salida */}
              <div style={{ fontSize: 18, fontWeight: 600, color: '#A0A0A0', textAlign: 'center' }}>¿Qué vas a registrar?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <button
                  onClick={() => { setTipo('salida'); setPaso('cantidad') }}
                  style={{ ...S.btn('#2A1A1A', '#FF6B6B', '2px solid #D85A30'), padding: '40px 20px', fontSize: 20, borderRadius: 16 }}
                >
                  <div style={{ marginBottom: 10 }}><ArrowUp size={48} /></div>
                  <div>Salida</div>
                  <div style={{ fontSize: 13, fontWeight: 400, marginTop: 6, color: '#FF8B8B' }}>Despacho, venta, uso</div>
                </button>
                <button
                  onClick={() => { setTipo('entrada'); setPaso('cantidad') }}
                  style={{ ...S.btn('#0F2A1A', '#4ADE80', '2px solid #1D9E75'), padding: '40px 20px', fontSize: 20, borderRadius: 16 }}
                >
                  <div style={{ marginBottom: 10 }}><ArrowDown size={48} /></div>
                  <div>Entrada</div>
                  <div style={{ fontSize: 13, fontWeight: 400, marginTop: 6, color: '#6EEFAA' }}>Reposición, recepción</div>
                </button>
              </div>
            </div>
          )}

          {/* PASO: CANTIDAD */}
          {paso === 'cantidad' && producto && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ ...S.card, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <Package size={20} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{producto.nombre}</div>
                  <div style={{ fontSize: 13, color: tipo === 'salida' ? '#FF6B6B' : '#4ADE80', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {tipo === 'salida' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    {tipo === 'salida' ? 'SALIDA' : 'ENTRADA'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>Stock actual</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: estadoColor(producto.estado) }}>
                    {producto.stock_actual} u.
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'center', fontSize: 18, color: '#A0A0A0' }}>¿Cuántas unidades?</div>

              {/* Display cantidad grande */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 96, fontWeight: 800, lineHeight: 1,
                  color: tipo === 'salida' ? '#FF6B6B' : '#4ADE80',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {cantidad}
                </div>
                <div style={{ fontSize: 16, color: '#6B7280', marginTop: 4 }}>{producto.unidad_medida}(s)</div>
              </div>

              {/* Teclado numérico táctil */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 360, margin: '0 auto', width: '100%' }}>
                {[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map((k, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (k === '⌫') { setCantidad(c => Math.max(1, Math.floor(c / 10))) }
                      else if (k === '✓') { confirmarMovimiento() }
                      else { setCantidad(c => Math.min(9999, c === 1 && k === 0 ? 0 : parseInt(`${c}${k}`) || 1)) }
                    }}
                    disabled={loading && k === '✓'}
                    style={{
                      ...S.btn(
                        k === '✓' ? (tipo === 'salida' ? '#D85A30' : '#1D9E75') : k === '⌫' ? '#2A2D3A' : '#1A1D27',
                        'white',
                        k === '✓' ? 'none' : '1px solid #2A2D3A'
                      ),
                      padding: '22px 0', fontSize: k === '✓' || k === '⌫' ? 22 : 24,
                      borderRadius: 12,
                      opacity: (loading && k === '✓') ? 0.6 : 1,
                    }}
                  >
                    {k === '✓' ? (loading ? '...' : '✓') : k}
                  </button>
                ))}
              </div>

              {tipo === 'salida' && cantidad > producto.stock_actual && (
                <div style={{ background: '#2A1A1A', border: '1px solid #D85A30', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#FF6B6B', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <AlertTriangle className="w-4 h-4" /> Stock insuficiente — disponible: {producto.stock_actual} {producto.unidad_medida}(s)
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, maxWidth: 360, margin: '0 auto', width: '100%' }}>
                <button onClick={() => setPaso('tipo')} style={{ ...S.btn('#2A2D3A', '#A0A0A0'), padding: '14px 0', flex: 1, fontSize: 14 }}>
                  ← Atrás
                </button>
                <button
                  onClick={confirmarMovimiento}
                  disabled={loading || (tipo === 'salida' && cantidad > producto.stock_actual) || cantidad < 1}
                  style={{ ...S.btn(tipo === 'salida' ? '#D85A30' : '#1D9E75'), padding: '14px 0', flex: 2, fontSize: 16, opacity: (loading || (tipo === 'salida' && cantidad > producto.stock_actual) || cantidad < 1) ? 0.5 : 1 }}
                >
                  {loading ? 'Registrando...' : `Confirmar ${tipo === 'salida' ? 'salida' : 'entrada'} de ${cantidad} u.`}
                </button>
              </div>
            </div>
          )}

          {/* PASO: CONFIRMADO */}
          {paso === 'confirmado' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center' }}>
              <CheckCircle className="w-16 h-16" style={{ color: '#4ADE80', animation: 'bounce 0.5s ease' }} />
              <div style={{ fontSize: 28, fontWeight: 700, color: '#4ADE80' }}>¡Registrado!</div>
              <div style={{ fontSize: 18, color: '#A0A0A0' }}>{successMsg}</div>
              <div style={{ fontSize: 14, color: '#4B5563' }}>Volviendo al inicio en 3 segundos...</div>
              <style>{`@keyframes bounce { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }`}</style>
            </div>
          )}

          {/* PASO: ERROR */}
          {paso === 'error' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, textAlign: 'center' }}>
              <XCircle className="w-16 h-16" style={{ color: '#FF6B6B' }} />
              <div style={{ fontSize: 24, fontWeight: 700, color: '#FF6B6B' }}>Error</div>
              <div style={{ fontSize: 16, color: '#A0A0A0', maxWidth: 400 }}>{errorMsg}</div>
              <button onClick={reiniciar} style={{ ...S.btn('#1D9E75'), padding: '16px 40px', fontSize: 16, borderRadius: 12 }}>
                Intentar de nuevo
              </button>
            </div>
          )}
        </div>

        {/* Panel lateral — historial */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...S.card }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #2A2D3A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Últimos movimientos</span>
              <button onClick={cargarHistorial} style={{ ...S.btn('#2A2D3A', '#6B7280'), padding: '4px 10px', fontSize: 11 }}>↻</button>
            </div>
            {historial.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#4B5563', fontSize: 13 }}>Sin movimientos aún</div>
            ) : historial.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #2A2D3A' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: h.tipo === 'entrada' ? '#0F2A1A' : '#2A1A1A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {h.tipo === 'entrada' ? <ArrowDown size={14} style={{ color: '#4ADE80' }} /> : <ArrowUp size={14} style={{ color: '#FF6B6B' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.producto}</div>
                  <div style={{ fontSize: 10, color: '#4B5563', fontFamily: 'monospace' }}>{h.sku}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: h.tipo === 'entrada' ? '#4ADE80' : '#FF6B6B' }}>
                    {h.tipo === 'entrada' ? '+' : '-'}{h.cantidad}
                  </div>
                  <div style={{ fontSize: 10, color: '#4B5563' }}>{h.fecha?.slice(11, 16)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Estado de conexión */}
          <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', boxShadow: '0 0 6px #1D9E75' }} />
            <span style={{ fontSize: 12, color: '#6B7280' }}>Sistema conectado</span>
          </div>
        </div>
      </div>
    </div>
  )
}
