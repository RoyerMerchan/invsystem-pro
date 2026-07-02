import { useState, useEffect } from 'react'
import {
  Package, Wallet, RefreshCw, CircleX, AlertTriangle,
  Download, Loader2, CheckCircle, FileSpreadsheet, ClipboardList, Bell, FileText,
  type LucideIcon,
} from 'lucide-react'
import { api, apiUrl, fmt } from '../services/api'
import { FloatCard, KpiFloat } from '../components/FloatCard'

interface Preview {
  total_productos: number; total_movimientos: number
  valor_inventario: number; sin_stock: number; stock_bajo: number; fecha: string
}

interface FormatoEntry {
  id: Format
  icon: LucideIcon
  nombre: string
  desc: string
  color: string
  ext: string
  tags: string[]
}

const FORMATOS: FormatoEntry[] = [
  { id: 'excel'          as Format, icon: FileSpreadsheet, nombre:'Excel completo',     desc:'Inventario + movimientos + resumen en 3 hojas.',  color:'var(--primary)', ext:'.xlsx', tags:['Hoja: Inventario','Hoja: Movimientos','Hoja: Resumen'] },
  { id: 'pdf_inventario' as Format, icon: ClipboardList,   nombre:'PDF Inventario',     desc:'Reporte completo con KPIs y tabla detallada.',    color:'var(--info)', ext:'.pdf',  tags:['KPIs','Tabla completa','Estado por producto'] },
  { id: 'pdf_alertas'    as Format, icon: Bell,            nombre:'PDF Alertas',        desc:'Solo sin stock y stock bajo. Ideal para compras.', color:'var(--danger)', ext:'.pdf',  tags:['Sin stock','Stock bajo','Diferencia vs mínimo'] },
  { id: 'pdf_completo'   as Format, icon: FileText,        nombre:'PDF Completo',       desc:'KPIs + inventario + alertas en un documento.',    color:'#7C3AED', ext:'.pdf',  tags:['KPIs','Inventario','Alertas'] },
  { id: 'csv_inventario' as Format, icon: FileText,        nombre:'CSV Inventario',     desc:'Exportación en CSV del inventario completo.',     color:'var(--info)', ext:'.csv',  tags:['SKU','Stock','Precio'] },
  { id: 'csv_movimientos'as Format, icon: FileText,        nombre:'CSV Movimientos',    desc:'Exportación en CSV de los movimientos.',          color:'var(--info)', ext:'.csv',  tags:['Fecha','Producto','Tipo'] },
  { id: 'csv_ventas'     as Format, icon: FileText,        nombre:'CSV Ventas',         desc:'Exportación en CSV de las ventas registradas.',   color:'var(--info)', ext:'.csv',  tags:['Venta','Total','Sede'] },
]

export default function ReportesPage() {
  const [preview, setPreview]       = useState<Preview | null>(null)
  const [loading, setLoading]       = useState(true)
  const [downloading, setDownloading] = useState<Format | null>(null)
  const [error, setError]           = useState('')
  const [lastDownload, setLastDownload] = useState<string | null>(null)

  useEffect(() => {
    api<Preview>('/api/v1/reportes/preview').then(setPreview).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const descargar = async (formato: Format) => {
    setDownloading(formato); setError('')
    try {
      const token = localStorage.getItem('token')
      let url: string
      if (formato === 'excel') url = '/api/v1/reportes/excel'
      else if (formato.startsWith('pdf_')) url = `/api/v1/reportes/pdf?tipo=${formato.replace('pdf_','')}`
      else url = `/api/v1/reportes/${formato.replace('_','/')}`
      const res = await fetch(apiUrl(url), { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        const text = await res.text()
        let msg = 'Error al generar el reporte'
        if (text) { try { msg = JSON.parse(text).detail || msg } catch { msg = text } }
        throw new Error(msg)
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const f = FORMATOS.find(f => f.id === formato)!
      a.download = `invsystem_${formato}_${new Date().toISOString().slice(0,10)}${f.ext}`
      a.click(); URL.revokeObjectURL(a.href)
      setLastDownload(f.nombre)
    } catch (e: any) { setError(e.message) }
    finally { setDownloading(null) }
  }

  const kpis = preview ? [
    { label:'Productos',        value: preview.total_productos,          color:'var(--primary)', icon: <Package className="w-5 h-5" />, sub:'en inventario' },
    { label:'Valor inventario', value: fmt(preview.valor_inventario),    color:'var(--info)',    icon: <Wallet className="w-5 h-5" />, sub:'total valorizado' },
    { label:'Movimientos',      value: preview.total_movimientos,        color:'#7C3AED',        icon: <RefreshCw className="w-5 h-5" />, sub:'registrados' },
    { label:'Sin stock',        value: preview.sin_stock,                color:'var(--danger)',  icon: <CircleX className="w-5 h-5" />, sub:'agotados' },
    { label:'Stock bajo',       value: preview.stock_bajo,               color:'var(--warning)', icon: <AlertTriangle className="w-5 h-5" />, sub:'por reabastecer' },
  ] : []

  return (
    <div>
      <div className="mb-6">
        <div className="text-xl font-bold tracking-tight">Reportes exportables</div>
        <div className="text-xs text-t2 mt-1">Descarga el inventario en Excel o PDF con un clic</div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="grid-4 mb-6">
          {[...Array(4)].map((_,i) => <div key={i} className="h-[110px] bg-bg2 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 mb-6">
          {kpis.map(k => <KpiFloat key={k.label} {...k} />)}
        </div>
      )}

      {/* Tarjetas de formato */}
      <div className="grid-2 mb-4">
        {FORMATOS.map(f => (
          <ReporteCard key={f.id} f={f} downloading={downloading} onDescargar={descargar} />
        ))}
      </div>

      {lastDownload && !downloading && (
        <FloatCard style={{ padding:'14px 18px', marginBottom:12 }}>
          <div className="flex items-center gap-2.5 text-success text-xs font-semibold">
            <CheckCircle className="w-4 h-4" /> {lastDownload} descargado correctamente
          </div>
        </FloatCard>
      )}
      {error && (
        <FloatCard style={{ padding:'14px 18px', marginBottom:12 }}>
          <div className="text-danger text-xs">{error}</div>
        </FloatCard>
      )}

      <FloatCard style={{ padding:'14px 18px' }} hover={false}>
        <div className="text-xs text-t2">
          Datos al {preview?.fecha || 'día de hoy'} — cada descarga genera un archivo actualizado en tiempo real.
        </div>
      </FloatCard>
    </div>
  )
}

function ReporteCard({ f, downloading, onDescargar }: { f: FormatoEntry; downloading: Format | null; onDescargar: (id: Format) => void }) {
  const [hov, setHov] = useState(false)
  const isActive = downloading === f.id
  const isDisabled = !!downloading && !isActive
  const IconComp = f.icon

  return (
    <div
      onMouseEnter={() => !isDisabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="bg-bg1 rounded-2xl overflow-hidden transition-all duration-[0.22s]"
      style={{
        border: `1px solid ${hov ? f.color + '44' : 'var(--border)'}`,
        boxShadow: hov ? `0 16px 48px ${f.color}18, 0 4px 16px rgba(0,0,0,0.08)` : '0 2px 12px rgba(0,0,0,0.06)',
        transform: hov ? 'translateY(-4px)' : 'translateY(0)',
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      {/* Acento superior */}
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg,${f.color},${f.color}55)` }} />
      <div className="p-5">
        <div className="flex items-start gap-3.5 mb-3.5">
          <div className="w-12 h-12 rounded-[13px] flex items-center justify-center shrink-0 transition-shadow duration-200" style={{ background: `${f.color}15`, boxShadow: hov ? `0 4px 16px ${f.color}30` : 'none' }}>
            <IconComp className="w-6 h-6" style={{ color: f.color }} />
          </div>
          <div className="flex-1">
            <div className="text-base font-bold text-t1 mb-1">{f.nombre}</div>
            <div className="text-xs text-t2 leading-normal">{f.desc}</div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {f.tags.map(t => (
            <span key={t} className="text-[11px] px-2.5 py-[3px] rounded-full font-semibold" style={{ background: `${f.color}12`, color: f.color, border: `1px solid ${f.color}22` }}>
              {t}
            </span>
          ))}
        </div>

        <button
          onClick={() => !isDisabled && onDescargar(f.id)}
          disabled={!!downloading}
          className="w-full py-2.5 rounded-[10px] text-xs font-bold font-sans flex items-center justify-center gap-2 transition-all duration-[0.18s]"
          style={{
            background: isActive ? `${f.color}15` : hov ? f.color : `${f.color}12`,
            color: isActive ? f.color : hov ? 'white' : f.color,
            border: `1.5px solid ${f.color}`,
            cursor: downloading ? 'wait' : 'pointer',
          }}
        >
          {isActive ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generando {f.ext}…</>
          ) : (
            <><Download className="w-4 h-4" /> Descargar {f.ext}</>
          )}
        </button>
      </div>
    </div>
  )
}

type Format = 'excel' | 'pdf_inventario' | 'pdf_alertas' | 'pdf_completo' | 'csv_inventario' | 'csv_movimientos' | 'csv_ventas'
