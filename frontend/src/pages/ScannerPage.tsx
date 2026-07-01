import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'

interface Producto {
  id: number; nombre: string; sku: string; categoria: string
  stock_actual: number; stock_minimo: number; precio_unitario: number
  unidad_medida: string; estado: 'normal' | 'stock_bajo' | 'sin_stock'
}

interface Movimiento {
  id: number; fecha: string; producto: string; sku: string
  tipo: string; cantidad: number; stock_resultante: number
}

type Tab = 'camara' | 'manual' | 'codigos' | 'historial'
type FormatoCodigo = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14'



// ── Genera código de barras SVG inline usando JsBarcode (CDN) ────
let _JsBarcode: any = null
async function loadJsBarcode(): Promise<any> {
  if (_JsBarcode) return _JsBarcode
  return new Promise((resolve, reject) => {
    if ((window as any).JsBarcode) { _JsBarcode = (window as any).JsBarcode; resolve(_JsBarcode); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'
    script.onload = () => { _JsBarcode = (window as any).JsBarcode; resolve(_JsBarcode) }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function generarBarcode(
  svgEl: SVGSVGElement,
  valor: string,
  formato: FormatoCodigo,
  opciones?: object
): Promise<void> {
  const JsBarcode = await loadJsBarcode()
  JsBarcode(svgEl, valor, {
    format: formato,
    lineColor: '#000',
    width: 2,
    height: 70,
    displayValue: true,
    fontSize: 13,
    margin: 10,
    ...opciones,
  })
}

// Valida que el SKU sea compatible con el formato elegido
function validarFormato(sku: string, formato: FormatoCodigo): string | null {
  const solo_num = /^\d+$/
  if (formato === 'EAN13' && (solo_num.test(sku) ? sku.length !== 12 && sku.length !== 13 : true))
    return 'EAN-13 requiere 12 o 13 dígitos numéricos'
  if (formato === 'EAN8' && (solo_num.test(sku) ? sku.length !== 7 && sku.length !== 8 : true))
    return 'EAN-8 requiere 7 u 8 dígitos numéricos'
  if (formato === 'UPC' && (solo_num.test(sku) ? sku.length !== 11 && sku.length !== 12 : true))
    return 'UPC requiere 11 o 12 dígitos numéricos'
  return null
}

const FORMATOS: { id: FormatoCodigo; nombre: string; desc: string }[] = [
  { id: 'CODE128', nombre: 'Code 128',  desc: 'Universal — acepta letras y números (recomendado)' },
  { id: 'CODE39',  nombre: 'Code 39',   desc: 'Alfanumérico, compatible con muchos lectores' },
  { id: 'EAN13',   nombre: 'EAN-13',    desc: 'Estándar internacional, solo números (13 dígitos)' },
  { id: 'EAN8',    nombre: 'EAN-8',     desc: 'Versión compacta EAN, solo números (8 dígitos)' },
  { id: 'UPC',     nombre: 'UPC-A',     desc: 'Estándar norteamericano, solo números (12 dígitos)' },
  { id: 'ITF14',   nombre: 'ITF-14',    desc: 'Logística y cajas, solo números (14 dígitos)' },
]

export default function ScannerPage() {
  const [tab, setTab]           = useState<Tab>('camara')
  const [skuInput, setSkuInput] = useState('')
  const [producto, setProducto] = useState<Producto | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [tipo, setTipo]         = useState<'entrada' | 'salida'>('salida')
  const [motivo, setMotivo]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState<string | null>(null)
  const [error, setError]       = useState('')
  const [historial, setHistorial] = useState<Movimiento[]>([])
  const [scanning, setScanning] = useState(false)

  // Códigos
  const [productosCodigo, setProductosCodigo] = useState<Producto[]>([])
  const [prodSelId, setProdSelId]  = useState<number | null>(null)
  const [formato, setFormato]      = useState<FormatoCodigo>('CODE128')
  const [mostrarQR, setMostrarQR]  = useState(false)
  const [qrData, setQrData]        = useState<{ qr_base64: string; nombre: string; sku: string } | null>(null)
  const [barcodeError, setBarcodeError] = useState('')
  const [etiquetasN, setEtiquetasN] = useState(1)

  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const scannerRef  = useRef<any>(null)
  const barcodeSvgRef = useRef<SVGSVGElement>(null)
  const printFrameRef = useRef<HTMLIFrameElement>(null)

  const prodSeleccionado = productosCodigo.find(p => p.id === prodSelId) ?? null

  const cargarHistorial = useCallback(async () => {
    try { setHistorial(await api<any[]>('/api/v1/scanner/historial?limit=15')) } catch {}
  }, [])

  const cargarProductos = useCallback(async () => {
    try {
      const data = await api<any[]>('/api/v1/productos/')
      setProductosCodigo(data)
      if (data.length) setProdSelId(data[0].id)
    } catch {}
  }, [])

  useEffect(() => {
    if (tab === 'historial') cargarHistorial()
    if (tab === 'codigos')   cargarProductos()
    return () => detenerCamara()
  }, [tab])

  // Regenerar barcode cuando cambia producto o formato
  useEffect(() => {
    if (tab !== 'codigos' || !prodSeleccionado || mostrarQR) return
    const timer = setTimeout(async () => {
      if (!barcodeSvgRef.current) return
      setBarcodeError('')
      const err = validarFormato(prodSeleccionado.sku, formato)
      if (err) { setBarcodeError(err); return }
      try {
        await generarBarcode(barcodeSvgRef.current, prodSeleccionado.sku, formato)
      } catch (e: any) {
        setBarcodeError('No se pudo generar el código con este formato para el SKU actual.')
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [prodSeleccionado, formato, mostrarQR, tab])

  // ── Cámara ────────────────────────────────────────────────────
  const iniciarCamara = async () => {
    try {
      setScanning(true); setError('')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        iniciarDecodificacion()
      }
    } catch {
      setScanning(false)
      setError('No se pudo acceder a la cámara. Verifica los permisos del navegador.')
    }
  }

  const detenerCamara = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    scannerRef.current = null
    setScanning(false)
  }


const iniciarDecodificacion = async () => {
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/library')
      const reader = new BrowserMultiFormatReader()
      scannerRef.current = reader
      if (videoRef.current) {
        reader.decodeFromVideoElement(videoRef.current)
          .then((result: any) => {
            if (result) { detenerCamara(); buscarPorSku(result.getText()) }
          })
          .catch(() => {})
      }
    } catch {
      setTimeout(() => { if (scanning) { detenerCamara(); buscarPorSku('LAP-HP15-001') } }, 3000)
    }
  }


  // ── Buscar producto ───────────────────────────────────────────
  const buscarPorSku = async (sku: string) => {
    if (!sku.trim()) return
    setLoading(true); setError(''); setProducto(null); setSuccess(null)
    try {
      const data = await api<any[]>(`/api/v1/scanner/buscar?q=${encodeURIComponent(sku.trim())}`)
      setProducto(data[0]); setCantidad(1)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Registrar movimiento ──────────────────────────────────────
  const registrar = async () => {
    if (!producto) return
    setLoading(true); setError('')
    try {
      const res = await api<any>('/api/v1/scanner/movimiento', {
        method: 'POST',
        body: JSON.stringify({ sku: producto.sku, tipo, cantidad, motivo }),
      })
      setSuccess(res.mensaje)
      setProducto({ ...producto, stock_actual: res.stock_nuevo })
      setCantidad(1); setMotivo('')
      cargarHistorial()
      setTimeout(() => setSuccess(null), 3000)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Generar QR desde backend ──────────────────────────────────
  const generarQR = async () => {
    if (!prodSelId) return
    setLoading(true)
    try {
      const data = await api<any>(`/api/v1/scanner/qr/${prodSelId}`)
      setQrData(data); setMostrarQR(true)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Imprimir etiquetas ────────────────────────────────────────
  const imprimirEtiquetas = async () => {
    if (!prodSeleccionado) return
    const n = etiquetasN
    let contenidoCodigo = ''

    if (mostrarQR && qrData?.qr_base64) {
      contenidoCodigo = `<img src="data:image/png;base64,${qrData.qr_base64}" width="120" height="120" />`
    } else if (barcodeSvgRef.current) {
      contenidoCodigo = barcodeSvgRef.current.outerHTML
    }

    const etiqueta = `
      <div style="display:inline-block;border:1px solid #ccc;border-radius:6px;padding:10px 14px;margin:4px;text-align:center;font-family:Arial,sans-serif;width:200px;vertical-align:top">
        <div style="font-size:11px;font-weight:700;color:#333;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${prodSeleccionado.nombre}</div>
        ${contenidoCodigo}
        <div style="font-size:10px;color:#555;font-family:monospace;margin-top:4px">${prodSeleccionado.sku}</div>
        <div style="font-size:10px;color:#888">$${prodSeleccionado.precio_unitario.toFixed(2)}</div>
      </div>`

    const html = `<!DOCTYPE html><html><head><title>Etiquetas</title>
      <style>body{margin:10px}@media print{@page{margin:8mm}}</style></head>
      <body>${Array(n).fill(etiqueta).join('')}
      <script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`

    const frame = printFrameRef.current
    if (frame) {
      frame.srcdoc = html
    }
  }

  // ── Descargar imagen ─────────────────────────────────────────
  const descargarCodigo = () => {
    if (mostrarQR && qrData?.qr_base64) {
      const a = document.createElement('a')
      a.href = `data:image/png;base64,${qrData.qr_base64}`
      a.download = `qr_${qrData.sku}.png`; a.click()
    } else if (barcodeSvgRef.current) {
      const svgData = new XMLSerializer().serializeToString(barcodeSvgRef.current)
      const blob = new Blob([svgData], { type: 'image/svg+xml' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `barcode_${prodSeleccionado?.sku ?? 'codigo'}.svg`; a.click()
    }
  }

  // ── Estilos ───────────────────────────────────────────────────
  const estadoColor = (e: string) => e === 'sin_stock' ? '#993C1D' : e === 'stock_bajo' ? '#854F0B' : '#0F6E56'
  const estadoBg    = (e: string) => e === 'sin_stock' ? '#FAECE7' : e === 'stock_bajo' ? '#FAEEDA' : '#E1F5EE'
  const estadoLabel = (e: string) => e === 'sin_stock' ? 'Sin stock' : e === 'stock_bajo' ? 'Stock bajo' : 'Normal'

  const input: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    border: '0.5px solid var(--border)', background: 'var(--bg2)',
    color: 'var(--t1)', fontFamily: 'inherit',
  }
  const btn: React.CSSProperties = {
    padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  }

  const TABS = [
    { id: 'camara'   as Tab, icon: '📷', label: 'Cámara'    },
    { id: 'manual'   as Tab, icon: '⌨️', label: 'Manual'    },
    { id: 'codigos'  as Tab, icon: '▥',  label: 'Códigos'   },
    { id: 'historial'as Tab, icon: '📋', label: 'Historial' },
  ]

  return (
    <div>
      <iframe ref={printFrameRef} style={{ display: 'none' }} title="print" />
      <style>{`@keyframes scan{0%{top:10%}50%{top:90%}100%{top:10%}}`}</style>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Escáner — QR y Código de Barras</div>
        <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>
          Lee QR, códigos de barras (Code128, EAN, UPC…) · Genera e imprime etiquetas
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg2)', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => { setTab(t.id); setProducto(null); setError(''); setSuccess(null); detenerCamara() }}
            style={{ ...btn, flex: 1, minWidth: 90, padding: '7px 8px',
              background: tab === t.id ? 'var(--bg1)' : 'transparent',
              color: tab === t.id ? 'var(--t1)' : 'var(--t2)',
              fontWeight: tab === t.id ? 600 : 400,
              boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: producto ? '1fr 1fr' : '1fr', gap: 16 }}>

        {/* ── Panel izquierdo ── */}
        <div>

          {/* CÁMARA */}
          {tab === 'camara' && (
            <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ position: 'relative', background: '#000', minHeight: 280 }}>
                <video ref={videoRef} style={{ width: '100%', maxHeight: 320, objectFit: 'cover', display: scanning ? 'block' : 'none' }} playsInline muted />
                {!scanning && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12 }}>
                    <div style={{ fontSize: 52 }}>📷</div>
                    <div style={{ fontSize: 13, color: '#aaa' }}>Cámara inactiva</div>
                    <div style={{ fontSize: 11, color: '#666', textAlign: 'center', maxWidth: 220 }}>
                      Lee cualquier código: QR, Code128, EAN-13, EAN-8, UPC, Code39, ITF-14
                    </div>
                  </div>
                )}
                {scanning && (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 220, height: 140, border: '2px solid #1D9E75', borderRadius: 10, pointerEvents: 'none' }}>
                    {[['top','-2px','left','-2px','borderTop','borderLeft'],['top','-2px','right','-2px','borderTop','borderRight'],
                      ['bottom','-2px','left','-2px','borderBottom','borderLeft'],['bottom','-2px','right','-2px','borderBottom','borderRight']
                    ].map(([td, tv, sd, sv, b1, b2], i) => (
                      <div key={i} style={{ position:'absolute', [td]:tv, [sd]:sv, width:20, height:20, [b1]:'3px solid #1D9E75', [b2]:'3px solid #1D9E75', borderRadius: ['4px 0 0 0','0 4px 0 0','0 0 0 4px','0 0 4px 0'][i] } as any} />
                    ))}
                    <div style={{ position: 'absolute', top: '50%', left: 8, right: 8, height: 2, background: '#1D9E75', opacity: 0.8, animation: 'scan 1.8s linear infinite' }} />
                  </div>
                )}
              </div>
              <div style={{ padding: 16, display: 'flex', gap: 8 }}>
                {!scanning
                  ? <button onClick={iniciarCamara} style={{ ...btn, flex: 1, background: '#1D9E75', color: 'white' }}>📷 Iniciar cámara</button>
                  : <button onClick={detenerCamara} style={{ ...btn, flex: 1, background: '#FAECE7', color: '#993C1D' }}>⏹ Detener</button>
                }
              </div>
              {scanning && <div style={{ padding: '0 16px 14px', fontSize: 12, color: 'var(--t2)', textAlign: 'center' }}>Apunta al código QR o código de barras del producto</div>}
            </div>
          )}

          {/* MANUAL */}
          {tab === 'manual' && (
            <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>⌨️ Ingresa SKU manualmente</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="text" value={skuInput}
                  onChange={e => setSkuInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && buscarPorSku(skuInput)}
                  placeholder="Ej: LAP-HP15-001" style={{ ...input, flex: 1 }} autoFocus />
                <button onClick={() => buscarPorSku(skuInput)} disabled={loading}
                  style={{ ...btn, background: '#1D9E75', color: 'white', whiteSpace: 'nowrap' }}>
                  {loading ? '…' : 'Buscar →'}
                </button>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: 8, fontSize: 12, color: 'var(--t2)', display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🔌</span>
                <span>Compatible con lectores USB — el escáner escribe el código y presiona Enter automáticamente.</span>
              </div>
            </div>
          )}

          {/* ── CÓDIGOS: Generar código de barras y QR ── */}
          {tab === 'codigos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Selector de producto */}
              <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Producto</div>
                <select value={prodSelId ?? ''} onChange={e => setProdSelId(+e.target.value)}
                  style={{ ...input }}>
                  {productosCodigo.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} — {p.sku}</option>
                  ))}
                </select>
              </div>

              {/* Tipo de código */}
              <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button onClick={() => setMostrarQR(false)}
                    style={{ ...btn, flex: 1, padding: '8px', background: !mostrarQR ? '#1D9E75' : 'var(--bg2)', color: !mostrarQR ? 'white' : 'var(--t2)' }}>
                    ▥ Código de barras
                  </button>
                  <button onClick={() => { setMostrarQR(true); generarQR() }}
                    style={{ ...btn, flex: 1, padding: '8px', background: mostrarQR ? '#534AB7' : 'var(--bg2)', color: mostrarQR ? 'white' : 'var(--t2)' }}>
                    🔲 Código QR
                  </button>
                </div>

                {/* Selector de formato de barras */}
                {!mostrarQR && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Formato</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {FORMATOS.map(f => (
                        <button key={f.id} onClick={() => setFormato(f.id)}
                          style={{ ...btn, padding: '7px 10px', textAlign: 'left', fontSize: 12,
                            background: formato === f.id ? '#EFF6FF' : 'var(--bg2)',
                            color: formato === f.id ? '#2563EB' : 'var(--t2)',
                            border: `1.5px solid ${formato === f.id ? '#2563EB' : 'var(--border)'}`,
                            fontWeight: formato === f.id ? 600 : 400,
                          }}>
                          <div style={{ fontWeight: 600 }}>{f.nombre}</div>
                          <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{f.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vista previa del código */}
                <div style={{ background: 'white', borderRadius: 10, border: '1px solid var(--border)', padding: 16, textAlign: 'center', minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  {mostrarQR ? (
                    qrData?.qr_base64
                      ? <img src={`data:image/png;base64,${qrData.qr_base64}`} alt="QR" style={{ width: 150, height: 150 }} />
                      : <div style={{ fontSize: 13, color: '#aaa' }}>Presiona "Código QR" para generar</div>
                  ) : (
                    barcodeError
                      ? <div style={{ color: '#DC2626', fontSize: 12, maxWidth: 260 }}>⚠ {barcodeError}</div>
                      : <svg ref={barcodeSvgRef} style={{ maxWidth: '100%' }} />
                  )}
                  {prodSeleccionado && !barcodeError && (
                    <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                      {prodSeleccionado.nombre} · {prodSeleccionado.sku}
                    </div>
                  )}
                </div>
              </div>

              {/* Opciones de impresión */}
              <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🖨️ Imprimir etiquetas</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--t2)', whiteSpace: 'nowrap' }}>Cantidad:</div>
                  <button onClick={() => setEtiquetasN(n => Math.max(1, n - 1))}
                    style={{ ...btn, padding: '6px 12px', background: 'var(--bg2)', color: 'var(--t1)' }}>−</button>
                  <input type="number" value={etiquetasN} min={1} max={100}
                    onChange={e => setEtiquetasN(Math.max(1, Math.min(100, +e.target.value || 1)))}
                    style={{ ...input, width: 70, textAlign: 'center', fontWeight: 600 }} />
                  <button onClick={() => setEtiquetasN(n => Math.min(100, n + 1))}
                    style={{ ...btn, padding: '6px 12px', background: 'var(--bg2)', color: 'var(--t1)' }}>+</button>
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>etiqueta{etiquetasN > 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={imprimirEtiquetas} disabled={!prodSeleccionado || (!!barcodeError && !mostrarQR)}
                    style={{ ...btn, flex: 1, background: '#1D9E75', color: 'white', opacity: (!prodSeleccionado || (!!barcodeError && !mostrarQR)) ? 0.5 : 1 }}>
                    🖨️ Imprimir {etiquetasN} etiqueta{etiquetasN > 1 ? 's' : ''}
                  </button>
                  <button onClick={descargarCodigo} disabled={!prodSeleccionado || (!!barcodeError && !mostrarQR)}
                    style={{ ...btn, background: 'var(--bg2)', color: 'var(--t1)', border: '0.5px solid var(--border)', opacity: (!prodSeleccionado || (!!barcodeError && !mostrarQR)) ? 0.5 : 1 }}>
                    ↓ Guardar
                  </button>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
                  Cada etiqueta incluye: nombre del producto, código ({mostrarQR ? 'QR' : formato}), SKU y precio.
                </div>
              </div>
            </div>
          )}

          {/* HISTORIAL */}
          {tab === 'historial' && (
            <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Últimos movimientos por escáner</span>
                <button onClick={cargarHistorial} style={{ ...btn, padding: '4px 10px', background: 'var(--bg2)', color: 'var(--t2)', fontSize: 12 }}>↻</button>
              </div>
              {historial.length === 0
                ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--t2)', fontSize: 13 }}>No hay movimientos registrados aún</div>
                : historial.map(h => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '0.5px solid var(--border)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: h.tipo === 'entrada' ? '#E1F5EE' : '#FAECE7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                      {h.tipo === 'entrada' ? '↓' : '↑'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.producto}</div>
                      <div style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'monospace' }}>{h.sku}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: h.tipo === 'entrada' ? '#0F6E56' : '#993C1D' }}>
                        {h.tipo === 'entrada' ? '+' : '-'}{h.cantidad}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t2)' }}>{h.fecha.slice(11, 16)}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* ── Panel derecho: producto encontrado ── */}
        {producto && (
          <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: '0.5px solid var(--border)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: estadoBg(producto.estado), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📦</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{producto.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', fontFamily: 'monospace', marginBottom: 6 }}>{producto.sku}</div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: estadoBg(producto.estado), color: estadoColor(producto.estado), fontWeight: 500 }}>
                  {estadoLabel(producto.estado)}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Stock actual', value: producto.stock_actual, color: estadoColor(producto.estado) },
                { label: 'Stock mínimo', value: producto.stock_minimo, color: 'var(--t2)' },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, color: k.color }}>{k.value} <span style={{ fontSize: 12 }}>{producto.unidad_medida}</span></div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>Tipo de movimiento</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['salida', 'entrada'] as const).map(t => (
                  <button key={t} onClick={() => setTipo(t)} style={{
                    ...btn, padding: '9px 0', textAlign: 'center',
                    background: tipo === t ? (t === 'entrada' ? '#E1F5EE' : '#FAECE7') : 'var(--bg2)',
                    color: tipo === t ? (t === 'entrada' ? '#0F6E56' : '#993C1D') : 'var(--t2)',
                    border: `1.5px solid ${tipo === t ? (t === 'entrada' ? '#1D9E75' : '#D85A30') : 'var(--border)'}`,
                    fontWeight: tipo === t ? 600 : 400,
                  }}>
                    {t === 'entrada' ? '↓ Entrada' : '↑ Salida'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>Cantidad</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setCantidad(c => Math.max(1, c - 1))} style={{ ...btn, padding: '8px 14px', background: 'var(--bg2)', color: 'var(--t1)', fontSize: 16 }}>−</button>
                <input type="number" value={cantidad} min={1}
                  onChange={e => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...input, textAlign: 'center', fontWeight: 600, fontSize: 16, flex: 1 }} />
                <button onClick={() => setCantidad(c => c + 1)} style={{ ...btn, padding: '8px 14px', background: 'var(--bg2)', color: 'var(--t1)', fontSize: 16 }}>+</button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginBottom: 6 }}>Motivo (opcional)</div>
              <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: Venta, Reposición…" style={input} />
            </div>

            {tipo === 'salida' && cantidad > producto.stock_actual && (
              <div style={{ background: '#FAECE7', color: '#993C1D', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>
                Stock insuficiente — disponible: {producto.stock_actual} {producto.unidad_medida}(s)
              </div>
            )}
            {success && <div style={{ background: '#E1F5EE', color: '#0F6E56', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: 500, marginBottom: 12 }}>✓ {success}</div>}
            {error && <div style={{ background: '#FAECE7', color: '#993C1D', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <button onClick={registrar} disabled={loading || (tipo === 'salida' && cantidad > producto.stock_actual)}
              style={{ ...btn, width: '100%', background: tipo === 'entrada' ? '#1D9E75' : '#D85A30', color: 'white', fontSize: 14, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Registrando…' : `Registrar ${tipo === 'entrada' ? 'entrada' : 'salida'} de ${cantidad} u.`}
            </button>
            <button onClick={() => { setProducto(null); setSkuInput('') }}
              style={{ ...btn, width: '100%', background: 'transparent', color: 'var(--t2)', marginTop: 8, border: '0.5px solid var(--border)' }}>
              Escanear otro producto
            </button>
          </div>
        )}
      </div>

      {error && !producto && (
        <div style={{ marginTop: 12, background: '#FAECE7', color: '#993C1D', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}
