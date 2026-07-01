import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Download, Loader2, Table } from 'lucide-react'
import { api } from '../services/api'
import { FloatCard, FloatSection } from '../components/FloatCard'

interface FilaPreview {
  sku: string; fecha: string; cantidad: number; precio_unitario: number; sede: string
}

interface ImportResult {
  ok: number
  total_registros: number
  errores: { linea: number; error: string; sku?: string }[]
  detalles: { venta_id: number; producto: string; sku: string; cantidad: number; fecha: string }[]
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
    if (!f.name.endsWith('.csv')) { setError('Solo archivos CSV'); return }
    setError(''); setResult(null); setFile(f)

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const lines = text.split('\n').filter(l => l.trim())
      if (lines.length < 2) { setError('CSV vacio o sin datos'); return }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      if (!headers.includes('sku') || !headers.includes('fecha') || !headers.includes('cantidad')) {
        setError('CSV debe tener columnas: sku, fecha, cantidad');
        return
      }

      const parsed: FilaPreview[] = []
      for (let i = 1; i < Math.min(lines.length, 6); i++) {
        const vals = lines[i].split(',').map(v => v.trim())
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = vals[idx] || '' })
        parsed.push({
          sku: row.sku?.toUpperCase() || '',
          fecha: row.fecha || '',
          cantidad: parseInt(row.cantidad) || 0,
          precio_unitario: parseFloat(row.precio_unitario) || 0,
          sede: row.sede || '',
        })
      }
      setPreview(parsed)
    }
    reader.readAsText(f)
  }

  async function importar() {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/v1/ventas/importar', {
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
    const csv = 'sku,fecha,cantidad,precio_unitario,sede\nLAP-HP15-001,2025-01-15,3,850.00,Sede Centro\nMOU-INL-002,2025-01-16,10,29.00,Sede Norte'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'plantilla_importacion.csv'
    a.click()
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
          <div className="text-xs text-muted">Columnas requeridas: sku, fecha, cantidad</div>
          <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </div>
      </FloatCard>

      {/* Plantilla */}
      <div className="flex items-center gap-2 mb-5">
        <button onClick={descargarPlantilla}
          className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary-hover bg-primary-subtle px-3 py-2 rounded-lg transition-colors border-none cursor-pointer">
          <Download className="w-4 h-4" /> Descargar plantilla CSV
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
                  <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Fecha</th>
                  <th className="text-right font-medium text-muted px-3 py-2 uppercase tracking-wider">Cantidad</th>
                  <th className="text-right font-medium text-muted px-3 py-2 uppercase tracking-wider">Precio</th>
                  <th className="text-left font-medium text-muted px-3 py-2 uppercase tracking-wider">Sede</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className="border-b border-border hover:bg-bg2 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-t1">{r.sku}</td>
                    <td className="px-3 py-2.5 text-t1">{r.fecha}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-t1">{r.cantidad}</td>
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
              <div className="text-xs text-muted mt-1">ventas registradas</div>
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
                        <td className="px-3 py-2 font-mono text-t1">#{d.venta_id}</td>
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
            El sistema creara automaticamente las ventas y los movimientos de inventario.
            Las columnas <b>sku</b>, <b>fecha</b> y <b>cantidad</b> son obligatorias.
          </div>
        </FloatCard>
      )}
    </div>
  )
}
