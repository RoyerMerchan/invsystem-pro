import { useState, useEffect, useCallback } from 'react'
import { Tags, Ruler, Building2, Plus, X, SlidersHorizontal, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import type { OpcionCatalogo, TipoCatalogo, TipoControl, Usuario } from '../types'
import { FloatSection } from '../components/FloatCard'
import { PageHeader } from './DashboardPage'
import { useRol } from '../hooks/useRol'

const GRUPOS: { tipo: TipoCatalogo; titulo: string; sub: string; icon: React.ReactNode; placeholder: string }[] = [
  { tipo: 'categoria', titulo: 'Categorías', sub: 'Se usan al clasificar productos en el inventario.', icon: <Tags className="w-4 h-4" />, placeholder: 'Ej. Electrodomésticos' },
  { tipo: 'unidad',    titulo: 'Unidades de medida', sub: 'Cómo se cuenta cada producto (unidad, caja, kg…).', icon: <Ruler className="w-4 h-4" />, placeholder: 'Ej. docena' },
  { tipo: 'sede',      titulo: 'Sedes', sub: 'Ubicaciones donde se registran ventas y movimientos.', icon: <Building2 className="w-4 h-4" />, placeholder: 'Ej. Sede Sur' },
]

export default function CatalogosPage({ usuario }: { usuario: Usuario | null }) {
  const { esAdmin } = useRol(usuario)
  const [opciones, setOpciones] = useState<OpcionCatalogo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    setLoading(true)
    api<OpcionCatalogo[]>('/api/v1/catalogo/')
      .then(setOpciones)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (!esAdmin) {
    return (
      <div>
        <PageHeader title="Datos maestros" sub="Gestión de listas del sistema" />
        <div className="text-sm text-danger bg-danger-subtle rounded-xl px-4 py-3">
          Solo los administradores pueden gestionar los datos maestros.
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Datos maestros" sub="Crea y gestiona las listas dinámicas del sistema" />
      {error && (
        <div className="text-sm text-danger bg-danger-subtle rounded-xl px-4 py-3 mb-4">{error}</div>
      )}
      {GRUPOS.map(g => (
        <GrupoCatalogo
          key={g.tipo}
          grupo={g}
          loading={loading}
          items={opciones.filter(o => o.tipo === g.tipo)}
          onChange={cargar}
          onError={setError}
        />
      ))}

      <TiposControlManager onError={setError} />
    </div>
  )
}

// ── Constructor de tipos de control (form builder) ────────────────
function TiposControlManager({ onError }: { onError: (msg: string) => void }) {
  const [tipos, setTipos] = useState<TipoControl[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(() => {
    setLoading(true)
    api<TipoControl[]>('/api/v1/tipos-control/')
      .then(setTipos)
      .catch(e => onError(e.message))
      .finally(() => setLoading(false))
  }, [onError])

  useEffect(() => { cargar() }, [cargar])

  async function crearTipo() {
    const n = nombre.trim()
    if (!n) return
    setSaving(true); onError('')
    try {
      await api('/api/v1/tipos-control/', { method: 'POST', body: JSON.stringify({ nombre: n }) })
      setNombre('')
      cargar()
    } catch (e: any) {
      onError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function borrarTipo(id: number) {
    if (!confirm('¿Eliminar este tipo de control y todos sus campos?')) return
    onError('')
    try {
      await api(`/api/v1/tipos-control/${id}`, { method: 'DELETE' })
      cargar()
    } catch (e: any) {
      onError(e.message)
    }
  }

  return (
    <FloatSection
      title={<span className="inline-flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" />Tipos de control</span>}
      sub="Crea tipos de control y define qué campos lleva cada uno. Al asignar un tipo a un producto, esos campos aparecen en su formulario."
    >
      {/* Crear tipo */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && crearTipo()}
          placeholder="Nuevo tipo de control (ej. Serializado)"
          className="flex-1 min-w-[200px] text-[13px] px-3 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans"
        />
        <button
          onClick={crearTipo}
          disabled={saving || !nombre.trim()}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-lg text-white"
          style={{ background: '#1D9E75', opacity: saving || !nombre.trim() ? 0.6 : 1, cursor: saving || !nombre.trim() ? 'not-allowed' : 'pointer' }}
        >
          <Plus className="w-4 h-4" /> Crear tipo
        </button>
      </div>

      {loading ? (
        <div className="text-[13px] text-muted">Cargando…</div>
      ) : tipos.length === 0 ? (
        <div className="text-[13px] text-muted">Sin tipos de control. Crea el primero arriba.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {tipos.map(t => (
            <TipoControlCard key={t.id} tipo={t} onChange={cargar} onDelete={() => borrarTipo(t.id)} onError={onError} />
          ))}
        </div>
      )}
    </FloatSection>
  )
}

function TipoControlCard({
  tipo, onChange, onDelete, onError,
}: {
  tipo: TipoControl
  onChange: () => void
  onDelete: () => void
  onError: (msg: string) => void
}) {
  const [etiqueta, setEtiqueta] = useState('')
  const [requerido, setRequerido] = useState(false)
  const [saving, setSaving] = useState(false)

  async function agregarCampo() {
    const e = etiqueta.trim()
    if (!e) return
    setSaving(true); onError('')
    try {
      await api(`/api/v1/tipos-control/${tipo.id}/campos`, { method: 'POST', body: JSON.stringify({ etiqueta: e, requerido }) })
      setEtiqueta(''); setRequerido(false)
      onChange()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function borrarCampo(id: number) {
    onError('')
    try {
      await api(`/api/v1/tipos-control/campos/${id}`, { method: 'DELETE' })
      onChange()
    } catch (err: any) {
      onError(err.message)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg1 p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[13px] font-semibold text-t1">{tipo.nombre}</div>
        <button
          onClick={onDelete}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          aria-label={`Eliminar tipo ${tipo.nombre}`}
          title="Eliminar tipo"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Campos existentes */}
      {tipo.campos.length === 0 ? (
        <div className="text-[12px] text-muted mb-2.5">Sin campos todavía.</div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {tipo.campos.map(c => (
            <span key={c.id} className="inline-flex items-center gap-1.5 text-[12px] pl-3 pr-1.5 py-1 rounded-full bg-bg2 border border-border text-t1">
              {c.etiqueta}{c.requerido && <span className="text-danger" title="Obligatorio">*</span>}
              <button
                onClick={() => borrarCampo(c.id)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                aria-label={`Eliminar campo ${c.etiqueta}`}
                title="Eliminar campo"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Agregar campo */}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          value={etiqueta}
          onChange={e => setEtiqueta(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && agregarCampo()}
          placeholder="Nuevo campo (ej. Número de serie)"
          className="flex-1 min-w-[180px] text-[12px] px-2.5 py-1.5 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-t2 cursor-pointer select-none">
          <input type="checkbox" checked={requerido} onChange={e => setRequerido(e.target.checked)} />
          Obligatorio
        </label>
        <button
          onClick={agregarCampo}
          disabled={saving || !etiqueta.trim()}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border text-t1 bg-bg2 hover:bg-bg1 transition-colors disabled:opacity-60"
        >
          <Plus className="w-3.5 h-3.5" /> Campo
        </button>
      </div>
    </div>
  )
}

function GrupoCatalogo({
  grupo, items, loading, onChange, onError,
}: {
  grupo: { tipo: TipoCatalogo; titulo: string; sub: string; icon: React.ReactNode; placeholder: string }
  items: OpcionCatalogo[]
  loading: boolean
  onChange: () => void
  onError: (msg: string) => void
}) {
  const [valor, setValor] = useState('')
  const [saving, setSaving] = useState(false)

  async function agregar() {
    const v = valor.trim()
    if (!v) return
    setSaving(true); onError('')
    try {
      await api('/api/v1/catalogo/', { method: 'POST', body: JSON.stringify({ tipo: grupo.tipo, valor: v }) })
      setValor('')
      onChange()
    } catch (e: any) {
      onError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function eliminar(id: number) {
    onError('')
    try {
      await api(`/api/v1/catalogo/${id}`, { method: 'DELETE' })
      onChange()
    } catch (e: any) {
      onError(e.message)
    }
  }

  return (
    <FloatSection title={<span className="inline-flex items-center gap-2">{grupo.icon}{grupo.titulo}</span>} sub={grupo.sub}>
      {/* Formulario de alta */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && agregar()}
          placeholder={grupo.placeholder}
          className="flex-1 min-w-[200px] text-[13px] px-3 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans"
        />
        <button
          onClick={agregar}
          disabled={saving || !valor.trim()}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-4 py-2 rounded-lg text-white"
          style={{ background: '#1D9E75', opacity: saving || !valor.trim() ? 0.6 : 1, cursor: saving || !valor.trim() ? 'not-allowed' : 'pointer' }}
        >
          <Plus className="w-4 h-4" /> Agregar
        </button>
      </div>

      {/* Lista de chips */}
      {loading ? (
        <div className="text-[13px] text-muted">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="text-[13px] text-muted">Sin opciones. Agrega la primera arriba.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map(o => (
            <span key={o.id} className="inline-flex items-center gap-1.5 text-[13px] pl-3 pr-1.5 py-1.5 rounded-full bg-bg2 border border-border text-t1">
              {o.valor}
              <button
                onClick={() => eliminar(o.id)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                aria-label={`Eliminar ${o.valor}`}
                title="Eliminar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </FloatSection>
  )
}
