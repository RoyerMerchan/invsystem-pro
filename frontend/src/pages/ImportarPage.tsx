import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Download, Loader2, Table } from 'lucide-react'
import { apiUrl } from '../services/api'
import { FloatCard, FloatSection } from '../components/FloatCard'

interface FilaPreview {
  sku: string; nombre: string; fecha: string; cantidad: number; tipo: string; precio_unitario: number; sede: string
}

interface ImportResult {
  ok: number
  total_registros: number
  errores: { linea: number; error: string; sku?: string }[]
  detalles: { venta_id: number | null; producto: string; sku: string; cantidad: number; fecha: string; tipo?: string }[]
}

// Alias de columnas: mismo criterio que el backend. El formato PRINCIPAL es
// sku,nombre,fecha,cantidad,tipo,precio,sede — pero se aceptan muchos más.
const CAMPOS_ALIAS: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'cod', 'code', 'referencia', 'ref', 'id_producto', 'producto_id', 'cod_producto', 'codigo_producto', 'item', 'articulo', 'clave'],
  nombre: ['nombre', 'producto', 'descripcion', 'detalle', 'product', 'name', 'nombre_producto', 'articulo_nombre', 'item_name', 'descripcion_producto'],
  fecha: ['fecha', 'date', 'dia', 'periodo', 'fecha_venta', 'fecha_movimiento', 'fecha_salida', 'fecha_operacion', 'timestamp'],
  cantidad: ['cantidad', 'cant', 'qty', 'quantity', 'unidades', 'und', 'uds', 'ventas', 'demanda', 'vendidos', 'salidas', 'volumen', 'cantidad_vendida'],
  precio: ['precio_unitario', 'precio', 'price', 'unit_price', 'valor', 'valor_unitario', 'costo', 'precio_venta', 'importe', 'pu'],
  sede: ['sede', 'tienda', 'sucursal', 'store', 'location', 'ubicacion', 'ciudad', 'bodega', 'almacen', 'punto_venta', 'local', 'region'],
  tipo: ['tipo', 'type', 'movimiento', 'operacion', 'clase', 'tipo_movimiento'],
}

// Normaliza una cabecera: sin acentos, minúsculas, separadores -> '_'.
function normHeader(s: string) {
  return (s || '')
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .trim().toLowerCase()
    .replace(/[\s\-./\\]+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '')
}

// Devuelve el campo canónico para una cabecera normalizada, o la propia cabecera.
function canonicalOf(normalized: string): string {
  for (const [canon, aliases] of Object.entries(CAMPOS_ALIAS)) {
    if (aliases.includes(normalized)) return canon
  }
  return normalized
}

function detectDelimiter(line: string) {
  const options = [',', ';', '\t', '|']
  let best = ','
  let bestCount = -1
  for (const delimiter of options) {
    let count = 0
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (!quoted && ch === delimiter) count++
    }
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = []
  let value = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    const next = line[i + 1]

    if (ch === '"' && quoted && next === '"') {
      value += '"'
      i++
    } else if (ch === '"') {
      quoted = !quoted
    } else if (!quoted && ch === delimiter) {
      values.push(value.trim())
      value = ''
    } else {
      value += ch
    }
  }

  values.push(value.trim())
  return values
}

function parseCsv(text: string) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV vacio o sin datos')

  const delimiter = detectDelimiter(lines[0])
  // Cada cabecera se resuelve a su campo can\u00F3nico (sku, nombre, fecha, ...).
  const keys = parseCsvLine(lines[0], delimiter).map(h => canonicalOf(normHeader(h)))
  const present = new Set(keys)
  const missing: string[] = []
  if (!present.has('fecha')) missing.push('fecha')
  if (!present.has('cantidad')) missing.push('cantidad')
  if (!present.has('sku') && !present.has('nombre')) missing.push('sku o nombre')
  if (missing.length) {
    throw new Error(`El CSV debe incluir: fecha, cantidad y (sku o nombre). Faltan: ${missing.join(', ')}`)
  }

  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line, delimiter)
    const row: Record<string, string> = {}
    keys.forEach((k, idx) => { if (!(k in row)) row[k] = vals[idx] || '' })
    return row
  })
}

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<FilaPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) { setError('Solo archivos CSV'); return }
    setError(''); setResult(null); setFile(f)

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const rows = parseCsv(reader.result as string)
        const parsed = rows.slice(0, 5).map(row => ({
          sku: row.sku?.toUpperCase() || '',
          nombre: row.nombre || '',
          fecha: row.fecha || '',
          cantidad: parseInt(row.cantidad) || 0,
          tipo: (row.tipo || 'salida').toLowerCase(),
          precio_unitario: parseFloat((row.precio || '').replace(',', '.')) || 0,
          sede: row.sede || '',
        }))
        setPreview(parsed)
      } catch (e: any) {
        setPreview([])
        setError(e.message)
      }
    }
    reader.readAsText(f)
  }

  async function importar() {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(apiUrl('/api/v1/ventas/importar'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al importar')
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const descargarPlantilla = () => {
    const csv = [
      'sku,nombre,fecha,cantidad,tipo,precio,sede',
      'LAP-HP15-001,Laptop HP 15,2025-01-15,3,salida,850.00,Bogotá',
      'MOU-LOG-001,Mouse Logitech MX,2025-01-16,10,salida,29.00,Medellín',
      'LAP-HP15-001,Laptop HP 15,2025-01-17,20,entrada,0,Bogotá',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'plantilla_historial_demanda.csv'
    a.click()
  }

  const [exportando, setExportando] = useState(false)
  const exportarVentas = async () => {
    setExportando(true); setError('')
    try {
      const res = await fetch(apiUrl('/api/v1/ventas/exportar'), {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      if (!res.ok) throw new Error('No se pudieron exportar las ventas')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `ventas_exportadas_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-xl font-bold text-t1 tracking-tight">Importar datos hist&oacute;ricos</div>
        <div className="text-xs text-muted mt-1">Sube un CSV con ventas pasadas para alimentar las proyecciones de demanda</div>
      </div>

      {/* Drop zone */}
      <FloatCard hover={false} style={{ padding: 0, marginBottom: 20 }}>
        <div
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center py-16 px-6 cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary-subtle/50 transition-all duration-200"
        >
          <Upload className="w-10 h-10 text-muted mb-4" />
          <div className="text-sm font-semibold text-t1 mb-1">Haz clic para seleccionar archivo CSV</div>
          <div className="text-xs text-muted">Formato principal: <b>sku, nombre, fecha, cantidad, tipo, precio, sede</b></div>
          <div className="text-[11px] text-muted/70 mt-1">Obligatorias: fecha, cantidad y (sku o nombre) · se adapta a otros formatos y nombres de columna · delimitador , ; tab o | · fechas AAAA-MM-DD o DD/MM/AAAA</div>
          <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </div>
      </FloatCard>

      {/* Plantilla / Exportar */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button onClick={descargarPlantilla}
          className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary-hover bg-primary-subtle px-3 py-2 rounded-lg transition-colors border-none cursor-pointer">
          <Download className="w-4 h-4" /> Descargar plantilla CSV
        </button>
        <button onClick={exportarVentas} disabled={exportando}
          className="flex items-center gap-2 text-xs font-medium text-t2 hover:text-t1 bg-bg2 px-3 py-2 rounded-lg transition-colors border-none cursor-pointer disabled:opacity-60">
          {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
          Exportar ventas (re-importable)
        </button>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <FloatSection title="Vista previa" sub={`Primeras ${preview.length} filas del archivo`}>
          <div className="table-wrap">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">SKU</th>
                  <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Nombre</th>
                  <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Fecha</th>
                  <th className="text-right font-medium text-muted px-3 py-2 uppercase tracking-wider">Cantidad</th>
                  <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Tipo</th>
                  <th className="text-right font-medium text-muted px-3 py-2 uppercase tracking-wider">Precio</th>
                  <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Sede</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b border-border hover:bg-bg2 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-t1">{r.sku || '—'}</td>
                    <td className="px-3 py-2.5 text-t1">{r.nombre || '—'}</td>
                    <td className="px-3 py-2.5 text-t1">{r.fecha}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-t1">{r.cantidad}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${r.tipo === 'entrada' ? 'bg-info-subtle text-info' : 'bg-success-subtle text-success'}`}>
                        {r.tipo === 'entrada' ? 'entrada' : 'salida'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted">${r.precio_unitario.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-muted">{r.sede || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={importar} disabled={loading || !file}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold border-none cursor-pointer hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
            ) : (
              <><Upload className="w-4 h-4" /> Importar {file?.name}</>
            )}
          </button>
        </FloatSection>
      )}

      {error && (
        <FloatCard color="#EF4444" style={{ padding: '14px 18px', marginBottom: 16 }}>
          <div className="flex items-center gap-2 text-sm text-danger">
            <XCircle className="w-4 h-4" /> {error}
          </div>
        </FloatCard>
      )}

      {/* Resultados */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FloatCard color="#10B981" style={{ padding: '16px 20px' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-success-subtle flex items-center justify-center"><CheckCircle className="w-5 h-5 text-success" /></div>
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Importadas</span>
              </div>
              <div className="text-[28px] font-bold text-success">{result.ok}</div>
              <div className="text-xs text-muted mt-1">registros importados</div>
            </FloatCard>
            <FloatCard color="#F59E0B" style={{ padding: '16px 20px' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-warning-subtle flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-warning" /></div>
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Errores</span>
              </div>
              <div className="text-[28px] font-bold text-warning">{result.errores.length}</div>
              <div className="text-xs text-muted mt-1">de {result.total_registros} registros</div>
            </FloatCard>
            <FloatCard color="#3B82F6" style={{ padding: '16px 20px' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-info-subtle flex items-center justify-center"><Table className="w-5 h-5 text-info" /></div>
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total</span>
              </div>
              <div className="text-[28px] font-bold text-info">{result.total_registros}</div>
              <div className="text-xs text-muted mt-1">registros en el archivo</div>
            </FloatCard>
          </div>

          {result.errores.length > 0 && (
            <FloatSection title="Errores" sub="Registros que no se pudieron importar">
              <div className="table-wrap">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Linea</th>
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">SKU</th>
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errores.map((e, i) => (
                      <tr key={i} className="border-b border-border">
                        <td className="px-3 py-2.5 text-t1">{e.linea}</td>
                        <td className="px-3 py-2.5 font-mono text-muted">{e.sku || '—'}</td>
                        <td className="px-3 py-2.5 text-danger">{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FloatSection>
          )}

          {result.detalles.length > 0 && (
            <FloatSection title="Detalle" sub="Ventas importadas correctamente">
              <div className="table-wrap">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Tipo</th>
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Venta #</th>
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Producto</th>
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">SKU</th>
                      <th className="text-right font-medium text-muted px-3 py-2 uppercase tracking-wider">Cantidad</th>
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.detalles.slice(0, 50).map((d, i) => (
                      <tr key={i} className="border-b border-border hover:bg-bg2">
                        <td className="px-3 py-2">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${d.tipo === 'entrada' ? 'bg-info-subtle text-info' : 'bg-success-subtle text-success'}`}>
                            {d.tipo === 'entrada' ? 'entrada' : 'salida'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-t1">{d.venta_id ? `#${d.venta_id}` : '—'}</td>
                        <td className="px-3 py-2 text-t1">{d.producto}</td>
                        <td className="px-3 py-2 font-mono text-muted">{d.sku}</td>
                        <td className="px-3 py-2 text-right font-semibold text-t1">{d.cantidad}</td>
                        <td className="px-3 py-2 text-muted">{d.fecha}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FloatSection>
          )}
        </div>
      )}

      {!file && !result && (
        <FloatCard hover={false} style={{ padding: '60px 20px', textAlign: 'center' }}>
          <FileSpreadsheet className="w-12 h-12 text-muted mx-auto mb-4" />
          <div className="text-sm font-semibold text-t1 mb-2">Sube un archivo CSV</div>
          <div className="text-xs text-muted max-w-md mx-auto leading-relaxed">
            Formato principal: <b>sku, nombre, fecha, cantidad, tipo, precio, sede</b>.
            El sistema crea automáticamente las ventas (tipo <b>salida</b>) y los movimientos de inventario;
            las filas <b>entrada</b> suman stock. Obligatorias: <b>fecha</b>, <b>cantidad</b> y (<b>sku</b> o <b>nombre</b>).
          </div>
        </FloatCard>
      )}
    </div>
  )
}
