import { X } from 'lucide-react'
import CsvImporter, { IMPORT_CONFIG, type ImportTipo } from './CsvImporter'

/**
 * Modal de carga de CSV reutilizable por sección (Inventario, Ventas, Proveedores).
 * Envuelve al importador genérico <CsvImporter/> en una ventana flotante.
 * `onDone` se dispara tras una importación exitosa (para refrescar la lista).
 */
export default function ImportCsvModal({
  tipo, onClose, onDone,
}: {
  tipo: ImportTipo
  onClose: () => void
  onDone?: () => void
}) {
  const cfg = IMPORT_CONFIG[tipo]
  return (
    <div
      className="fixed inset-0 bg-black/45 z-[100] flex items-start justify-center p-4 overflow-y-auto animate-[fadeIn_0.15s_ease]"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-[760px] my-6 animate-[slideIn_0.2s_ease]"
        onClick={e => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary-subtle text-primary flex items-center justify-center shrink-0">
              {cfg.icono}
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-t1 truncate">{cfg.titulo}</div>
              <div className="text-xs text-muted truncate">{cfg.subtitulo}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="text-muted hover:text-t1 p-1.5 rounded-md hover:bg-bg2 transition-colors border-none bg-transparent cursor-pointer shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-6 py-5">
          <CsvImporter tipo={tipo} onDone={onDone} />
        </div>
      </div>
    </div>
  )
}
