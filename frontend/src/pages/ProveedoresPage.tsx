import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import type { Proveedor, Usuario } from '../types'
import { FloatCard, FloatSection, KpiFloat } from '../components/FloatCard'
import { useRol } from '../hooks/useRol'

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
        border: `0.5px solid ${hov ? '#1D9E7540' : 'var(--border)'}`,
      }}
    >
      <div className="h-[3px]" style={{ background: p.activo ? 'linear-gradient(90deg,#1D9E75,#1D9E7555)' : 'var(--border)' }} />
      <div className="p-[14px_16px]">
        <div className="flex items-start justify-between mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold mb-0.5 truncate">{p.nombre}</div>
            {p.contacto && <div className="text-[11px] text-t2">👤 {p.contacto}</div>}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ml-2 ${
            p.activo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
          }`}>
            {p.activo ? '● Activo' : '○ Inactivo'}
          </span>
        </div>

        <div className="flex flex-col gap-[5px] mb-3 text-xs text-t2">
          {p.email    && <div>✉ {p.email}</div>}
          {p.telefono && <div>📞 {p.telefono}</div>}
          {p.direccion && <div className="truncate">📍 {p.direccion}</div>}
        </div>

        {esAdmin && (
          <div className="flex gap-1.5 border-t-[0.5px] border-border pt-2.5">
            <button onClick={() => onEditar(p)}
              className="flex-1 text-[11px] py-1.5 rounded-lg border-[0.5px] border-border bg-bg2 text-t2 cursor-pointer font-medium">
              ✏ Editar
            </button>
            {p.activo && (
              <button onClick={() => onDesactivar(p.id, p.nombre)}
                className="text-[11px] py-1.5 px-2.5 rounded-lg cursor-pointer font-medium"
                style={{ border: '0.5px solid #DC262640', background: 'transparent', color: '#DC2626' }}>
                🗑
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
        <KpiFloat label="Total proveedores" value={proveedores.length} sub="registrados" color="#1D9E75" icon="🏭" />
        <KpiFloat label="Activos"           value={activos}            sub="en operación"  color="#2563EB" icon="✅" />
        <KpiFloat label="Inactivos"         value={proveedores.length - activos} sub="desactivados" color="#D97706" icon="⏸" />
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
            <button onClick={() => abrirModal()}
              className="ml-auto text-sm px-4 py-2 rounded-lg border-none bg-primary text-white cursor-pointer font-semibold"
              style={{ boxShadow: '0 4px 12px rgba(29,158,117,0.3)' }}>
              + Nuevo proveedor
            </button>
          )}
        </div>
      </FloatCard>

      {!esAdmin && (
        <FloatCard color="#1D9E75" style={{ padding: '10px 16px', marginBottom: 14 }}>
          <div className="text-sm" style={{ color: '#0F6E56' }}>👁 Modo solo lectura — contacta a un administrador para modificar proveedores.</div>
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
          <div className="text-[40px] mb-2.5">🏭</div>
          <div className="text-sm font-semibold text-t2">No hay proveedores</div>
        </FloatCard>
      ) : (
        <div className="grid-3">
          {filtrados.map(p => (
            <ProveedorCard key={p.id} p={p} esAdmin={esAdmin} onEditar={abrirModal} onDesactivar={desactivar} />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-bg1 rounded-2xl p-6 w-full max-w-[440px] border-[0.5px] border-border"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
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
            {error && <div className="bg-red-50 text-red-600 px-3 py-2 rounded-lg text-sm mb-3">⚠ {error}</div>}
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
