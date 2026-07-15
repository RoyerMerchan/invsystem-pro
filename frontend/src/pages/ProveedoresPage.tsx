import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import type { Proveedor, Usuario } from '../types'
import { FloatCard, FloatSection, KpiFloat } from '../components/FloatCard'
import ImportCsvModal from '../components/ImportCsvModal'
import { useRol } from '../hooks/useRol'
import { Truck, Building2, Phone, Mail, MapPin, Edit3, Trash2, Plus, Search, CheckCircle, PauseCircle, AlertCircle, Eye, User, Upload } from 'lucide-react'

const BLANK = { nombre: '', contacto: '', email: '', telefono: '', direccion: '', activo: true }

interface Props { usuario: Usuario | null }

function ProveedorCard({ p, esAdmin, onEditar, onDesactivar }: {
  p: Proveedor; esAdmin: boolean
  onEditar: (p: Proveedor) => void; onDesactivar: (id: number, nombre: string) => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`bg-bg1 rounded-xl overflow-hidden transition-all duration-[220ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${hov ? 'shadow-xl -translate-y-[3px]' : 'shadow-sm'} ${p.activo ? 'opacity-100' : 'opacity-60'}`}
      style={{
        border: `0.5px solid ${hov ? 'color-mix(in srgb, var(--primary) 25%, transparent)' : 'var(--border)'}`,
      }}
    >
      <div className="h-[3px]" style={{ background: p.activo ? 'linear-gradient(90deg,var(--primary),color-mix(in srgb, var(--primary) 33%, transparent))' : 'var(--border)' }} />
      <div className="p-[14px_16px]">
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold mb-0.5 truncate">{p.nombre}</div>
            {p.contacto && <div className="text-[11px] text-t2 flex items-center gap-1"><User className="w-3 h-3 shrink-0" /> {p.contacto}</div>}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ml-2 ${
            p.activo ? 'bg-success-subtle text-success' : 'bg-bg2 text-t3'
          }`}>
            {p.activo ? '● Activo' : '○ Inactivo'}
          </span>
        </div>

        <div className="flex flex-col gap-[5px] mb-3 text-xs text-t2">
          {p.email    && <div className="flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" /> {p.email}</div>}
          {p.telefono && <div className="flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" /> {p.telefono}</div>}
          {p.direccion && <div className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" /> {p.direccion}</div>}
        </div>

        {esAdmin && (
          <div className="flex gap-1.5 border-t-[0.5px] border-border pt-2.5">
            <button onClick={() => onEditar(p)}
              className="flex-1 text-[11px] py-1.5 rounded-lg border-[0.5px] border-border bg-bg2 text-t2 cursor-pointer font-medium inline-flex items-center gap-1 justify-center">
              <Edit3 className="w-3 h-3" /> Editar
            </button>
            {p.activo && (
              <button onClick={() => onDesactivar(p.id, p.nombre)}
                className="text-[11px] py-1.5 px-2.5 rounded-lg cursor-pointer font-medium inline-flex items-center gap-1 justify-center border-[0.5px] text-danger border-danger/25 bg-transparent">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProveedoresPage({ usuario }: Props) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { esAdmin } = useRol(usuario)

  const cargar = useCallback(() => {
    setLoading(true)
    api<Proveedor[]>(`/api/v1/proveedores/?solo_activos=${soloActivos}`)
      .then(setProveedores).finally(() => setLoading(false))
  }, [soloActivos])

  useEffect(() => { cargar() }, [cargar])

  const filtrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(query.toLowerCase()) ||
    p.contacto.toLowerCase().includes(query.toLowerCase())
  )

  function abrirModal(p?: Proveedor) {
    setForm(p ? { nombre: p.nombre, contacto: p.contacto, email: p.email || '', telefono: p.telefono, direccion: p.direccion, activo: p.activo } : BLANK)
    setEditId(p?.id ?? null); setError(''); setModalOpen(true)
  }

  async function guardar() {
    setSaving(true); setError('')
    try {
      const payload = { ...form, email: form.email || null }
      if (editId) await api(`/api/v1/proveedores/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      else await api('/api/v1/proveedores/', { method: 'POST', body: JSON.stringify(payload) })
      setModalOpen(false); cargar()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function desactivar(id: number, nombre: string) {
    if (!confirm(`¿Desactivar proveedor "${nombre}"?`)) return
    try { await api(`/api/v1/proveedores/${id}`, { method: 'DELETE' }); cargar() }
    catch (e: any) { alert(e.message) }
  }

  const activos = proveedores.filter(p => p.activo).length

  return (
    <div>
      <div className="mb-6">
        <div className="text-xl font-bold tracking-tight">Proveedores</div>
        <div className="text-sm text-t2 mt-[3px]">Gestión de proveedores del inventario</div>
      </div>

      {/* KPIs */}
      <div className="grid-3 mb-5">
        <FloatCard style={{ padding: '18px 20px' }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center" style={{ background: 'var(--primary-subtle)' }}>
              <Building2 className="w-5 h-5" style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--primary)' }}>Total proveedores</div>
              <div className="text-[10px] text-t3">registrados</div>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[32px] font-extrabold leading-none" style={{ color: 'var(--primary)' }}>{proveedores.length}</div>
            <div className="text-[11px] text-t2">registrados</div>
          </div>
        </FloatCard>
        <FloatCard style={{ padding: '18px 20px' }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center" style={{ background: 'var(--info-subtle)' }}>
              <CheckCircle className="w-5 h-5" style={{ color: 'var(--info)' }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--info)' }}>Activos</div>
              <div className="text-[10px] text-t3">en operación</div>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[32px] font-extrabold leading-none" style={{ color: 'var(--info)' }}>{activos}</div>
            <div className="text-[11px] text-t2">en operación</div>
          </div>
        </FloatCard>
        <FloatCard style={{ padding: '18px 20px' }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center" style={{ background: 'var(--warning-subtle)' }}>
              <PauseCircle className="w-5 h-5" style={{ color: 'var(--warning)' }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--warning)' }}>Inactivos</div>
              <div className="text-[10px] text-t3">desactivados</div>
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[32px] font-extrabold leading-none" style={{ color: 'var(--warning)' }}>{proveedores.length - activos}</div>
            <div className="text-[11px] text-t2">desactivados</div>
          </div>
        </FloatCard>
      </div>

      {/* Barra de acciones */}
      <FloatCard hover={false} style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div className="flex gap-2 items-center flex-wrap">
          <input placeholder="Buscar por nombre o contacto…" value={query}
            onChange={e => setQuery(e.target.value)}
            className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 w-full max-w-[280px]" />
          <label className="flex items-center gap-1.5 text-sm text-t2 cursor-pointer select-none">
            <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} />
            Solo activos
          </label>
          {esAdmin && (
            <div className="ml-auto flex gap-2">
              <button onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 text-sm px-3.5 py-2 rounded-lg bg-transparent text-t1 cursor-pointer font-medium"
                style={{ border: '0.5px solid var(--border)' }}>
                <Upload className="w-3.5 h-3.5" /> Cargar CSV
              </button>
              <button onClick={() => abrirModal()}
                className="text-sm px-4 py-2 rounded-lg border-none bg-primary text-white cursor-pointer font-semibold"
                style={{ boxShadow: '0 4px 12px rgba(29,158,117,0.3)' }}>
                + Nuevo proveedor
              </button>
            </div>
          )}
        </div>
      </FloatCard>

      {!esAdmin && (
        <FloatCard color="var(--primary)" style={{ padding: '10px 16px', marginBottom: 14 }}>
          <div className="text-sm flex items-center gap-1.5" style={{ color: 'var(--primary-hover)' }}><Eye className="w-4 h-4" /> Modo solo lectura — contacta a un administrador para modificar proveedores.</div>
        </FloatCard>
      )}

      {/* Grid de tarjetas */}
      {loading ? (
        <div className="grid-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-bg2 rounded-xl" style={{ height: 160, animation: 'pulse 1.5s infinite', animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <FloatCard hover={false} style={{ padding: 48, textAlign: 'center' }}>
          <div className="flex justify-center mb-2.5">
            <Building2 className="w-10 h-10 text-t2" />
          </div>
          <div className="text-sm font-semibold text-t2">No hay proveedores</div>
        </FloatCard>
      ) : (
        <div className="grid-3">
          {filtrados.map(p => (
            <ProveedorCard key={p.id} p={p} esAdmin={esAdmin} onEditar={abrirModal} onDesactivar={desactivar} />
          ))}
        </div>
      )}

      {/* Modal cargar CSV de proveedores */}
      {importOpen && (
        <ImportCsvModal tipo="proveedores" onClose={() => setImportOpen(false)} onDone={cargar} />
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease]" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-bg1 rounded-2xl p-6 w-full max-w-[440px] border border-border"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div className="text-base font-bold mb-[18px]">{editId ? 'Editar proveedor' : 'Nuevo proveedor'}</div>
            {[
              { label: 'Nombre *', key: 'nombre', type: 'text' },
              { label: 'Contacto', key: 'contacto', type: 'text' },
              { label: 'Email', key: 'email', type: 'email' },
              { label: 'Teléfono', key: 'telefono', type: 'text' },
              { label: 'Dirección', key: 'direccion', type: 'text' },
            ].map(f => (
              <div key={f.key} className="mb-3">
                <label className="text-xs font-semibold text-t2 block mb-[5px]">{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]}
                  onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  className="text-sm px-2.5 py-2 rounded-lg border-[0.5px] border-border bg-bg1 text-t1 w-full" />
              </div>
            ))}
            {error && <div className="bg-danger-subtle text-danger px-3 py-2 rounded-lg text-sm mb-3 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {error}</div>}
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setModalOpen(false)}
                className="text-sm px-4 py-2 rounded-lg border-[0.5px] border-border bg-transparent text-t1 cursor-pointer">Cancelar</button>
              <button onClick={guardar} disabled={saving}
                className="text-sm px-5 py-2 rounded-lg border-none bg-primary text-white cursor-pointer font-semibold"
                style={{ boxShadow: '0 4px 12px rgba(29,158,117,0.3)' }}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
