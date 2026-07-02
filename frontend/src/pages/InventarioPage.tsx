import { useState, useEffect, useCallback } from 'react'
import { api, fmt } from '../services/api'
import type { Producto, Usuario, OpcionCatalogo } from '../types'
import { FloatCard } from '../components/FloatCard'
import { PageHeader } from './DashboardPage'
import { useRol } from '../hooks/useRol'

interface ProductoForm {
  nombre: string; descripcion: string; categoria: string; sku: string
  stock_actual: number; stock_minimo: number; stock_maximo: number
  precio_unitario: number; costo_unitario: number; unidad_medida: string; activo: boolean
}

const BLANK: ProductoForm = {
  nombre: '', descripcion: '', categoria: '', sku: '',
  stock_actual: 0, stock_minimo: 0, stock_maximo: 0,
  precio_unitario: 0, costo_unitario: 0, unidad_medida: 'unidad', activo: true,
}

function estadoBadge(p: Producto) {
  if (!p.activo) return <Badge txt="Inactivo" color="#6B6B6B" bg="#EFEEEA" />
  if (p.stock_actual === 0) return <Badge txt="Sin stock" color="#993C1D" bg="#FAECE7" />
  if (p.stock_actual < p.stock_minimo) return <Badge txt="Stock bajo" color="#854F0B" bg="#FAEEDA" />
  return <Badge txt="Normal" color="#0F6E56" bg="#E1F5EE" />
}

function Badge({ txt, color, bg }: { txt: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500, color, background: bg }}>
      {txt}
    </span>
  )
}

const INPUT: React.CSSProperties = {
  fontSize: 13, padding: '7px 10px', borderRadius: 8,
  border: '0.5px solid var(--border)',
  background: 'var(--bg1)', color: 'var(--t1)', fontFamily: 'inherit', width: '100%',
}

export default function InventarioPage({ usuario }: { usuario: Usuario | null }) {
  const { esAdmin } = useRol(usuario)
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [inactivos, setInactivos] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [movModalOpen, setMovModalOpen] = useState(false)
  const [form, setForm] = useState<ProductoForm>(BLANK)
  const [movForm, setMovForm] = useState({ producto_id: 0, tipo: 'entrada', cantidad: 1, motivo: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [categorias, setCategorias] = useState<string[]>([])
  const [unidades, setUnidades] = useState<string[]>([])

  const cargar = useCallback(() => {
    setLoading(true)
    api<Producto[]>('/api/v1/productos/?solo_activos=false')
      .then(setProductos)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    api<OpcionCatalogo[]>('/api/v1/catalogo/')
      .then(ops => {
        setCategorias(ops.filter(o => o.tipo === 'categoria').map(o => o.valor))
        setUnidades(ops.filter(o => o.tipo === 'unidad').map(o => o.valor))
      })
      .catch(() => { /* si falla el catálogo, los selects quedan vacíos */ })
  }, [])

  const filtrados = productos.filter(p => {
    const matchQ = p.nombre.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase())
    const matchC = !catFilter || p.categoria === catFilter
    const matchA = inactivos || p.activo
    return matchQ && matchC && matchA
  })

  async function guardar() {
    setSaving(true); setError('')
    try {
      if (editId) {
        await api(`/api/v1/productos/${editId}`, { method: 'PATCH', body: JSON.stringify(form) })
      } else {
        await api('/api/v1/productos/', { method: 'POST', body: JSON.stringify(form) })
      }
      setModalOpen(false); setForm(BLANK); setEditId(null)
      cargar()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function desactivar(id: number, activo: boolean) {
    const accion = activo ? 'desactivar' : 'activar'
    if (!confirm(`¿${activo ? 'Desactivar' : 'Activar'} este producto?`)) return
    await api(`/api/v1/productos/${id}`, { method: 'PATCH', body: JSON.stringify({ activo: !activo }) })
    cargar()
  }

  async function registrarMovimiento() {
    setSaving(true); setError('')
    try {
      await api('/api/v1/movimientos/', { method: 'POST', body: JSON.stringify(movForm) })
      setMovModalOpen(false)
      setMovForm({ producto_id: 0, tipo: 'entrada', cantidad: 1, motivo: '' })
      cargar()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function abrirEditar(p: Producto) {
    setForm({
      nombre: p.nombre, descripcion: p.descripcion ?? '', categoria: p.categoria, sku: p.sku,
      stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, stock_maximo: p.stock_maximo,
      precio_unitario: p.precio_unitario, costo_unitario: p.costo_unitario ?? 0,
      unidad_medida: p.unidad_medida ?? 'unidad', activo: p.activo,
    })
    setEditId(p.id); setModalOpen(true)
  }

  function abrirMovimiento(p: Producto) {
    setMovForm({ producto_id: p.id, tipo: 'entrada', cantidad: 1, motivo: '' })
    setMovModalOpen(true)
  }

  const set = (k: keyof ProductoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: (e.target.type === 'number' || e.target.type === 'range') ? +e.target.value : e.target.value }))

  return (
    <div>
      <PageHeader title="Inventario" sub={`${productos.length} productos registrados`} />

      {/* Barra de herramientas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input style={{ ...INPUT, maxWidth: 280 }} placeholder="Buscar por nombre o SKU…"
          value={query} onChange={e => setQuery(e.target.value)} />
        <select style={{ ...INPUT, maxWidth: 180 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map(c => <option key={c}>{c}</option>)}
        </select>
        <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--t2)', cursor:'pointer' }}>
          <input type="checkbox" checked={inactivos} onChange={e => setInactivos(e.target.checked)} />
          Ver inactivos
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn label="+ Movimiento" onClick={() => { setMovForm({ producto_id: productos[0]?.id ?? 0, tipo: 'entrada', cantidad: 1, motivo: '' }); setMovModalOpen(true) }} />
          {esAdmin && <Btn label="+ Producto" primary onClick={() => { setForm({ ...BLANK, categoria: categorias[0] ?? '', unidad_medida: unidades[0] ?? 'unidad' }); setEditId(null); setModalOpen(true) }} />}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ background: 'var(--bg1)', border: '0.5px solid var(--border)', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,0.055), 0 1px 3px rgba(0,0,0,0.03)' }}>
        <div className="table-wrap"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
              {['SKU', 'Producto', 'Categoría', 'Stock', 'Mín.', 'Máx.', 'Precio', 'Valor', 'Estado', 'Acciones'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--t2)', padding: '10px 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={9} style={{ padding: 12 }}><div style={{ background: 'var(--bg2)', height: 20, borderRadius: 4 }} /></td></tr>
              ))
              : filtrados.length === 0
                ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--t2)', fontSize: 13 }}>No se encontraron productos</td></tr>
                : filtrados.map(p => (
                  <tr key={p.id} style={{ borderBottom: '0.5px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '9px 12px', color: 'var(--t3)', fontFamily: 'monospace', fontSize: 11 }}>{p.sku}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 500 }}>{p.nombre}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{p.categoria}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 500, color: p.stock_actual < p.stock_minimo ? '#D85A30' : 'var(--t1)' }}>{p.stock_actual}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{p.stock_minimo}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{p.stock_maximo}</td>
                    <td style={{ padding: '9px 12px' }}>{fmt(p.precio_unitario)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{fmt(p.stock_actual * p.precio_unitario)}</td>
                    <td style={{ padding: '9px 12px' }}>{estadoBadge(p)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <BtnSm label="Mov." onClick={() => abrirMovimiento(p)} />
                        {esAdmin && <BtnSm label="Editar" onClick={() => abrirEditar(p)} />}
                        {esAdmin && <BtnSm label="✕" danger onClick={() => desactivar(p.id, p.activo)} />}
                      </div>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table></div>
      </div>

      {/* Totales */}
      <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 12, color: 'var(--t2)', padding: '0 4px' }}>
        <span>Mostrando <b>{filtrados.length}</b> de {productos.length} productos</span>
        <span>Valor total filtrado: <b>{fmt(filtrados.reduce((a, p) => a + p.stock_actual * p.precio_unitario, 0))}</b></span>
      </div>

      {/* Modal nuevo/editar producto */}
      {modalOpen && (
        <Modal title={editId ? 'Editar producto' : 'Nuevo producto'} onClose={() => setModalOpen(false)}>
          <div style={{ marginBottom: 12 }}>
            <FormField label="Descripción">
              <textarea style={{ ...INPUT, minHeight: 60, resize: 'vertical' }} value={form.descripcion} onChange={set('descripcion')} placeholder="Descripción del producto…" />
            </FormField>
          </div>
          <FormGrid>
            <FormField label="Nombre"><input style={INPUT} value={form.nombre} onChange={set('nombre')} placeholder="Ej. Laptop HP 15" /></FormField>
            <FormField label="SKU"><input style={INPUT} value={form.sku} onChange={set('sku')} placeholder="LAP-001" /></FormField>
            <FormField label="Categoría">
              <select style={INPUT} value={form.categoria} onChange={set('categoria')}>
                <option value="" disabled>Selecciona…</option>
                {form.categoria && !categorias.includes(form.categoria) && <option>{form.categoria}</option>}
                {categorias.map(c => <option key={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Unidad de medida">
              <select style={INPUT} value={form.unidad_medida} onChange={set('unidad_medida')}>
                {form.unidad_medida && !unidades.includes(form.unidad_medida) && <option>{form.unidad_medida}</option>}
                {unidades.map(u => <option key={u}>{u}</option>)}
              </select>
            </FormField>
            <FormField label="Stock actual"><input style={INPUT} type="number" min={0} value={form.stock_actual} onChange={set('stock_actual')} /></FormField>
            <FormField label="Stock mínimo"><input style={INPUT} type="number" min={0} value={form.stock_minimo} onChange={set('stock_minimo')} /></FormField>
            <FormField label="Stock máximo"><input style={INPUT} type="number" min={0} value={form.stock_maximo} onChange={set('stock_maximo')} /></FormField>
            <FormField label="Precio venta ($)"><input style={INPUT} type="number" min={0} step={0.01} value={form.precio_unitario} onChange={set('precio_unitario')} /></FormField>
            <FormField label="Costo unitario ($)"><input style={INPUT} type="number" min={0} step={0.01} value={form.costo_unitario} onChange={set('costo_unitario')} /></FormField>
          </FormGrid>
          {error && <ErrMsg msg={error} />}
          <ModalActions onCancel={() => setModalOpen(false)} onConfirm={guardar} loading={saving} confirmLabel={editId ? 'Guardar cambios' : 'Crear producto'} />
        </Modal>
      )}

      {/* Modal movimiento */}
      {movModalOpen && (
        <Modal title="Registrar movimiento" onClose={() => setMovModalOpen(false)}>
          <FormGrid>
            <FormField label="Producto">
              <select style={INPUT} value={movForm.producto_id} onChange={e => setMovForm(f => ({ ...f, producto_id: +e.target.value }))}>
                {productos.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre} (stock: {p.stock_actual})</option>)}
              </select>
            </FormField>
            <FormField label="Tipo">
              <select style={INPUT} value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="entrada">Entrada (compra/recepción)</option>
                <option value="salida">Salida (venta/consumo)</option>
                <option value="ajuste">Ajuste de inventario</option>
              </select>
            </FormField>
            <FormField label="Cantidad">
              <input style={INPUT} type="number" min={1} value={movForm.cantidad} onChange={e => setMovForm(f => ({ ...f, cantidad: +e.target.value }))} />
            </FormField>
            <FormField label="Motivo / referencia">
              <input style={INPUT} value={movForm.motivo} onChange={e => setMovForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Orden #1234" />
            </FormField>
          </FormGrid>
          {error && <ErrMsg msg={error} />}
          <ModalActions onCancel={() => setMovModalOpen(false)} onConfirm={registrarMovimiento} loading={saving} confirmLabel="Registrar" />
        </Modal>
      )}
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────
function Btn({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
      border: primary ? 'none' : '0.5px solid var(--border)',
      background: primary ? '#1D9E75' : 'transparent',
      color: primary ? 'white' : 'var(--t1)',
    }}>{label}</button>
  )
}

function BtnSm({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
      border: danger ? '0.5px solid #D85A30' : '0.5px solid var(--border)',
      background: 'transparent',
      color: danger ? '#993C1D' : 'var(--t2)',
    }}>{label}</button>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg1)', borderRadius: 12, border: '0.5px solid var(--border)', padding: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16, color: 'var(--t1)' }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

function ModalActions({ onCancel, onConfirm, loading, confirmLabel }: { onCancel: () => void; onConfirm: () => void; loading: boolean; confirmLabel: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
      <Btn label="Cancelar" onClick={onCancel} />
      <button onClick={onConfirm} disabled={loading} style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', background: '#1D9E75', color: 'white', border: 'none', opacity: loading ? 0.7 : 1 }}>
        {loading ? 'Guardando…' : confirmLabel}
      </button>
    </div>
  )
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>{children}</div>
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--t2)' }}>{label}</label>
      {children}
    </div>
  )
}

function ErrMsg({ msg }: { msg: string }) {
  return <div style={{ fontSize: 12, color: '#993C1D', background: '#FAECE7', padding: '8px 12px', borderRadius: 8, marginTop: 8 }}>{msg}</div>
}
