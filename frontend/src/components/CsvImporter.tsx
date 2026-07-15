import { useState, useRef } from 'react'
import { Upload, CheckCircle, XCircle, AlertTriangle, Download, Loader2, Table, Package, Receipt, Truck, RefreshCw, PlusCircle } from 'lucide-react'
import { apiUrl } from '../services/api'
import { FloatCard, FloatSection } from './FloatCard'

export type ImportTipo = 'ventas' | 'inventario' | 'proveedores'

interface TipoConfig {
  titulo: string
  subtitulo: string
  endpoint: string
  icono: React.ReactNode
  plantillaNombre: string
  plantilla: string[]
  columnas: string
  obligatorias: string
}

export const IMPORT_CONFIG: Record<ImportTipo, TipoConfig> = {
  ventas: {
    titulo: 'Importar ventas / demanda histórica',
    subtitulo: 'Sube un CSV con ventas pasadas para alimentar las proyecciones de demanda',
    endpoint: '/api/v1/ventas/importar',
    icono: <Receipt className="w-4 h-4" />,
    plantillaNombre: 'plantilla_ventas.csv',
    plantilla: [
      'sku,nombre,fecha,cantidad,tipo,precio,sede',
      'LAP-HP15-001,Laptop HP 15,2025-01-15,3,salida,850.00,Bogotá',
      'MOU-LOG-001,Mouse Logitech MX,2025-01-16,10,salida,29.00,Medellín',
      'LAP-HP15-001,Laptop HP 15,2025-01-17,20,entrada,0,Bogotá',
    ],
    columnas: 'sku, nombre, fecha, cantidad, tipo, precio, sede',
    obligatorias: 'fecha, cantidad y (sku o nombre)',
  },
  inventario: {
    titulo: 'Importar inventario',
    subtitulo: 'Sube un CSV de productos. Se empareja por SKU: si existe se actualiza, si no, se crea',
    endpoint: '/api/v1/productos/importar',
    icono: <Package className="w-4 h-4" />,
    plantillaNombre: 'plantilla_inventario.csv',
    plantilla: [
      'sku,nombre,categoria,stock_actual,stock_minimo,stock_maximo,precio_unitario,costo_unitario,unidad_medida,proveedor',
      'LAP-HP15-001,Laptop HP 15,Computadores,25,5,60,850.00,700.00,unidad,Distribuidora XYZ',
      'MOU-LOG-001,Mouse Logitech MX,Accesorios,120,20,200,29.00,18.00,unidad,Distribuidora XYZ',
    ],
    columnas: 'sku, nombre, categoria, stock_actual, stock_minimo, stock_maximo, precio_unitario, costo_unitario, unidad_medida, proveedor',
    obligatorias: 'sku y nombre',
  },
  proveedores: {
    titulo: 'Importar proveedores',
    subtitulo: 'Sube un CSV de proveedores. Se empareja por nombre: si existe se actualiza, si no, se crea',
    endpoint: '/api/v1/proveedores/importar',
    icono: <Truck className="w-4 h-4" />,
    plantillaNombre: 'plantilla_proveedores.csv',
    plantilla: [
      'nombre,contacto,email,telefono,direccion',
      'Distribuidora XYZ,Ana Pérez,ventas@xyz.com,3001234567,Cra 10 #20-30 Bogotá',
      'Importaciones ABC,Luis Gómez,contacto@abc.com,3109876543,Calle 5 #40-10 Medellín',
    ],
    columnas: 'nombre, contacto, email, telefono, direccion',
    obligatorias: 'nombre',
  },
}

interface ImportResult {
  ok: number
  creados?: number
  actualizados?: number
  total_registros: number
  errores: { linea: number; error: string; sku?: string }[]
  detalles?: any[]
}

// ── Parser CSV genérico (delimitador auto + comillas) ──────────────
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
    if (count > bestCount) { best = delimiter; bestCount = count }
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
    if (ch === '"' && quoted && next === '"') { value += '"'; i++ }
    else if (ch === '"') quoted = !quoted
    else if (!quoted && ch === delimiter) { values.push(value.trim()); value = '' }
    else value += ch
  }
  values.push(value.trim())
  return values
}

function parseCsvPreview(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('El CSV está vacío o no tiene filas de datos')
  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter)
  const rows = lines.slice(1, 6).map(l => parseCsvLine(l, delimiter))
  return { headers, rows }
}

export default function CsvImporter({ tipo, onDone }: { tipo: ImportTipo; onDone?: () => void }) {
  const cfg = IMPORT_CONFIG[tipo]
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) { setError('Solo se aceptan archivos CSV'); return }
    setError(''); setResult(null); setFile(f)
    const reader = new FileReader()
    reader.onload = () => {
      try { setPreview(parseCsvPreview(reader.result as string)) }
      catch (err: any) { setPreview(null); setError(err.message) }
    }
    reader.readAsText(f)
    // permite volver a elegir el mismo archivo
    e.target.value = ''
  }

  async function importar() {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(apiUrl(cfg.endpoint), {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al importar')
      setResult(data)
      onDone?.()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const descargarPlantilla = () => {
    const blob = new Blob([cfg.plantilla.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = cfg.plantillaNombre
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const tieneDesglose = result && (result.creados != null || result.actualizados != null)

  return (
    <div>
      {/* Zona de carga única: seleccionar → vista previa → importar en un solo recuadro */}
      <FloatCard hover={false} style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
        <div
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center px-6 cursor-pointer border-2 border-dashed border-border hover:border-primary hover:bg-primary-subtle/50 transition-all duration-200 ${preview ? 'py-6 rounded-t-xl' : 'py-12 rounded-xl'}`}
        >
          <Upload className="w-9 h-9 text-muted mb-3" />
          <div className="text-sm font-semibold text-t1 mb-1">
            {file ? `Archivo seleccionado: ${file.name} — clic para cambiar` : 'Haz clic para seleccionar tu archivo CSV'}
          </div>
          <div className="text-xs text-muted text-center">Columnas: <b>{cfg.columnas}</b></div>
          <div className="text-[11px] text-muted/70 mt-1 text-center">
            Obligatorias: {cfg.obligatorias} · delimitador , ; tab o | · se adapta a otros nombres de columna
          </div>
          <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </div>

        {/* Vista previa + importar dentro del mismo recuadro */}
        {preview && (
          <div className="border-t border-border p-4">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
              Vista previa · primeras {preview.rows.length} filas del archivo
            </div>
            <div className="table-wrap">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {preview.headers.map((h, i) => (
                      <th key={i} className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border hover:bg-bg2 transition-colors">
                      {preview.headers.map((_, j) => (
                        <td key={j} className="px-3 py-2.5 text-t1 whitespace-nowrap">{r[j] ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={importar} disabled={loading || !file}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold border-none cursor-pointer hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</>
                : <><Upload className="w-4 h-4" /> Importar archivo</>}
            </button>
          </div>
        )}
      </FloatCard>

      {/* Plantilla */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={descargarPlantilla}
          className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary-hover bg-primary-subtle px-3 py-2 rounded-lg transition-colors border-none cursor-pointer">
          <Download className="w-4 h-4" /> Descargar plantilla CSV
        </button>
      </div>

      {error && (
        <FloatCard color="#EF4444" style={{ padding: '14px 18px', marginBottom: 16 }}>
          <div className="flex items-center gap-2 text-sm text-danger">
            <XCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        </FloatCard>
      )}

      {/* Resultados */}
      {result && (
        <div className="space-y-4">
          <div className={`grid grid-cols-1 gap-3 ${tieneDesglose ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            <FloatCard color="#10B981" style={{ padding: '16px 20px' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-success-subtle flex items-center justify-center"><CheckCircle className="w-5 h-5 text-success" /></div>
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Procesados</span>
              </div>
              <div className="text-[28px] font-bold text-success">{result.ok}</div>
              <div className="text-xs text-muted mt-1">registros aplicados</div>
            </FloatCard>
            {tieneDesglose && (
              <FloatCard color="#3B82F6" style={{ padding: '16px 20px' }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-info-subtle flex items-center justify-center"><PlusCircle className="w-5 h-5 text-info" /></div>
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Nuevos / Editados</span>
                </div>
                <div className="text-[28px] font-bold text-info">{result.creados ?? 0}<span className="text-base text-muted"> / {result.actualizados ?? 0}</span></div>
                <div className="text-xs text-muted mt-1 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> creados / actualizados</div>
              </FloatCard>
            )}
            <FloatCard color="#F59E0B" style={{ padding: '16px 20px' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-warning-subtle flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-warning" /></div>
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Errores</span>
              </div>
              <div className="text-[28px] font-bold text-warning">{result.errores.length}</div>
              <div className="text-xs text-muted mt-1">de {result.total_registros} registros</div>
            </FloatCard>
            <FloatCard color="#6366F1" style={{ padding: '16px 20px' }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-primary-subtle flex items-center justify-center"><Table className="w-5 h-5 text-primary" /></div>
                <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Total</span>
              </div>
              <div className="text-[28px] font-bold text-t1">{result.total_registros}</div>
              <div className="text-xs text-muted mt-1">filas en el archivo</div>
            </FloatCard>
          </div>

          {result.errores.length > 0 && (
            <FloatSection title="Errores" sub="Registros que no se pudieron importar">
              <div className="table-wrap">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Línea</th>
                      <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Ref.</th>
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
        </div>
      )}

      {!file && !result && (
        <div className="text-[11px] text-muted/80 leading-relaxed px-1">
          {cfg.subtitulo}. Obligatorias: <b>{cfg.obligatorias}</b>.
        </div>
      )}
    </div>
  )
}
