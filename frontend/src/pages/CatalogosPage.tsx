import { useState, useEffect, useCallback } from 'react'
import { Tags, Ruler, Building2, Plus, X, SlidersHorizontal, Trash2, Pencil, Check } from 'lucide-react'
import { api } from '../services/api'
import type { OpcionCatalogo, TipoCatalogo, TipoControl, CampoControl, Usuario } from '../types'
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
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nombreVal, setNombreVal] = useState(tipo.nombre)

  useEffect(() => { setNombreVal(tipo.nombre) }, [tipo.nombre])

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

  async function guardarNombre() {
    const n = nombreVal.trim()
    setEditandoNombre(false)
    if (!n || n === tipo.nombre) { setNombreVal(tipo.nombre); return }
    onError('')
    try {
      await api(`/api/v1/tipos-control/${tipo.id}`, { method: 'PATCH', body: JSON.stringify({ nombre: n }) })
      onChange()
    } catch (err: any) {
      onError(err.message); setNombreVal(tipo.nombre)
    }
  }

  async function editarCampo(id: number, data: { etiqueta?: string; requerido?: boolean }) {
    onError('')
    try {
      await api(`/api/v1/tipos-control/campos/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
      onChange()
    } catch (err: any) {
      onError(err.message)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg1 p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        {editandoNombre ? (
          <div className="flex items-center gap-1">
            <input
              value={nombreVal}
              autoFocus
              onChange={e => setNombreVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') guardarNombre(); if (e.key === 'Escape') { setNombreVal(tipo.nombre); setEditandoNombre(false) } }}
              className="text-[13px] font-semibold px-2 py-1 rounded-md border border-primary bg-bg1 text-t1 outline-none font-sans"
            />
            <button onClick={guardarNombre} className="w-6 h-6 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" title="Guardar">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setNombreVal(tipo.nombre); setEditandoNombre(false) }} className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:bg-bg2" title="Cancelar">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="text-[13px] font-semibold text-t1">{tipo.nombre}</div>
            <button onClick={() => setEditandoNombre(true)} className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-colors" aria-label={`Editar tipo ${tipo.nombre}`} title="Editar nombre">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
            <EditableCampo
              key={c.id}
              campo={c}
              onSave={data => editarCampo(c.id, data)}
              onDelete={() => borrarCampo(c.id)}
            />
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

// ── Campo editable en línea (etiqueta + obligatorio) ──────────────
function EditableCampo({ campo, onSave, onDelete }: {
  campo: CampoControl
  onSave: (data: { etiqueta?: string; requerido?: boolean }) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [et, setEt] = useState(campo.etiqueta)
  const [req, setReq] = useState(campo.requerido)

  useEffect(() => { setEt(campo.etiqueta); setReq(campo.requerido) }, [campo.etiqueta, campo.requerido])

  function guardar() {
    const e = et.trim()
    setEditing(false)
    if (!e) { setEt(campo.etiqueta); return }
    if (e !== campo.etiqueta || req !== campo.requerido) onSave({ etiqueta: e, requerido: req })
  }
  function cancelar() { setEt(campo.etiqueta); setReq(campo.requerido); setEditing(false) }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] pl-2 pr-1 py-1 rounded-full bg-bg1 border border-primary">
        <input
          value={et}
          autoFocus
          onChange={e => setEt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
          className="w-[120px] text-[12px] px-1 bg-transparent text-t1 outline-none font-sans"
        />
        <label className="flex items-center gap-1 text-[11px] text-t2 cursor-pointer select-none" title="Obligatorio">
          <input type="checkbox" checked={req} onChange={e => setReq(e.target.checked)} />*
        </label>
        <button onClick={guardar} className="w-5 h-5 rounded-full flex items-center justify-center text-primary hover:bg-primary/10" title="Guardar">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={cancelar} className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:bg-bg2" title="Cancelar">
          <X className="w-3 h-3" />
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[12px] pl-3 pr-1 py-1 rounded-full bg-bg2 border border-border text-t1">
      {campo.etiqueta}{campo.requerido && <span className="text-danger" title="Obligatorio">*</span>}
      <button onClick={() => setEditing(true)} className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-colors" aria-label={`Editar campo ${campo.etiqueta}`} title="Editar campo">
        <Pencil className="w-3 h-3" />
      </button>
      <button onClick={onDelete} className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors" aria-label={`Eliminar campo ${campo.etiqueta}`} title="Eliminar campo">
        <X className="w-3 h-3" />
      </button>
    </span>
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

  async function editar(id: number, nuevoValor: string) {
    onError('')
    try {
      await api(`/api/v1/catalogo/${id}`, { method: 'PATCH', body: JSON.stringify({ valor: nuevoValor }) })
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
            <EditableChip
              key={o.id}
              valor={o.valor}
              onSave={v => editar(o.id, v)}
              onDelete={() => eliminar(o.id)}
            />
          ))}
        </div>
      )}
    </FloatSection>
  )
}

// ── Chip editable en línea (renombrar / eliminar) ─────────────────
function EditableChip({ valor, onSave, onDelete }: {
  valor: string
  onSave: (v: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(valor)

  useEffect(() => { setVal(valor) }, [valor])

  function guardar() {
    const v = val.trim()
    if (v && v !== valor) onSave(v)
    setEditing(false)
  }
  function cancelar() { setVal(valor); setEditing(false) }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] pl-2 pr-1 py-1 rounded-full bg-bg1 border border-primary">
        <input
          value={val}
          autoFocus
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') cancelar() }}
          className="w-[130px] text-[13px] px-1 bg-transparent text-t1 outline-none font-sans"
        />
        <button onClick={guardar} className="w-5 h-5 rounded-full flex items-center justify-center text-primary hover:bg-primary/10" title="Guardar">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={cancelar} className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:bg-bg2" title="Cancelar">
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-[13px] pl-3 pr-1 py-1.5 rounded-full bg-bg2 border border-border text-t1">
      {valor}
      <button onClick={() => setEditing(true)} className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 transition-colors" aria-label={`Editar ${valor}`} title="Editar">
        <Pencil className="w-3 h-3" />
      </button>
      <button onClick={onDelete} className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors" aria-label={`Eliminar ${valor}`} title="Eliminar">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  )
}
