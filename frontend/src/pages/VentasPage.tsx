import { useState, useEffect, useCallback } from 'react'
import { api, fmt } from '../services/api'
import type { Venta, Producto, VentaCreateDetalle, VentaHistorialItem, Usuario, OpcionCatalogo } from '../types'
import { useRol } from '../hooks/useRol'
import { FloatCard, FloatSection } from '../components/FloatCard'

export default function VentasPage({ usuario }: { usuario: Usuario | null }) {
  const { esAdmin } = useRol(usuario)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [historialVentas, setHistorialVentas] = useState<VentaHistorialItem[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState<number | null>(null)
  const [tab, setTab] = useState<'lista' | 'historial'>('lista')
  const [historialProdId, setHistorialProdId] = useState<number>(0)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [form, setForm] = useState({ sede: '', items: [] as VentaCreateDetalle[] })
  const [sedes, setSedes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<OpcionCatalogo[]>('/api/v1/catalogo/?tipo=sede')
      .then(ops => setSedes(ops.map(o => o.valor)))
      .catch(() => { /* si falla, el select solo muestra el placeholder */ })
  }, [])

  const cargar = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    Promise.all([
      api<Venta[]>(`/api/v1/ventas/?${params}`),
      api<Producto[]>('/api/v1/productos/?solo_activos=true'),
    ]).then(([v, p]) => {
      setVentas(v)
      setProductos(p)
    }).finally(() => setLoading(false))
  }, [desde, hasta])

  useEffect(() => { cargar() }, [cargar])

  function agregarItem() {
    setForm(f => ({ ...f, items: [...f.items, { producto_id: 0, cantidad: 1, precio_unitario: 0 }] }))
  }

  function setItem(i: number, k: keyof VentaCreateDetalle, v: number) {
    setForm(f => {
      const items = [...f.items]
      items[i] = { ...items[i], [k]: v }
      if (k === 'producto_id') {
        const p = productos.find(x => x.id === v)
        if (p) items[i].precio_unitario = p.precio_unitario
      }
      return { ...f, items }
    })
  }

  function quitarItem(i: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  }

  async function guardar() {
    setSaving(true); setError('')
    try {
      await api('/api/v1/ventas/', {
        method: 'POST',
        body: JSON.stringify({ sede: form.sede, detalles: form.items }),
      })
      setModalOpen(false)
      setForm({ sede: '', items: [] })
      cargar()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function cargarHistorial() {
    if (!historialProdId) return
    setLoading(true)
    try {
      const data = await api<VentaHistorialItem[]>(`/api/v1/ventas/producto/${historialProdId}`)
      setHistorialVentas(data)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  const totalIngresos = ventas.reduce((a, v) => a + v.total, 0)

  return (
    <div>
      <div className="mb-6">
        <div className="text-xl font-bold tracking-tight">Ventas</div>
        <div className="text-xs text-t2 mt-1">
          {ventas.length} ventas · {fmt(totalIngresos)} ingresos totales
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['lista', 'historial'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-[7px] rounded-lg border-[0.5px] border-border cursor-pointer font-sans text-xs ${
              tab === t ? 'bg-[#1D9E75] text-white font-semibold' : 'bg-transparent text-t2 font-normal'
            }`}>
            {t === 'lista' ? '📋 Lista de ventas' : '📊 Historial por producto'}
          </button>
        ))}
      </div>

      {tab === 'lista' && <>
        {/* Filtros + boton */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <input type="date" className="text-xs px-2.5 py-[7px] rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans w-full max-w-[160px]" value={desde} onChange={e => setDesde(e.target.value)} />
          <span className="text-xs text-t2">a</span>
          <input type="date" className="text-xs px-2.5 py-[7px] rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans w-full max-w-[160px]" value={hasta} onChange={e => setHasta(e.target.value)} />
          <div className="ml-auto flex gap-2">
            <button onClick={() => { setForm({ sede: '', items: [{ producto_id: 0, cantidad: 1, precio_unitario: 0 }] }); setModalOpen(true) }}
              className="text-xs px-3.5 py-[7px] rounded-lg cursor-pointer font-sans border-0 bg-[#1D9E75] text-white">
              + Nueva venta
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-bg1 border-[0.5px] border-border rounded-2xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.055),0_1px_3px_rgba(0,0,0,0.03)]">
          <div className="table-wrap"><table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-[0.5px] border-border">
                {['#', 'Fecha', 'Usuario', 'Sede', 'Productos', 'Total', ''].map(h => (
                  <th key={h} className="text-left text-[11px] font-medium text-t2 px-3 py-2.5 uppercase tracking-[0.04em]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={7} className="p-3"><div className="bg-bg2 h-5 rounded" /></td></tr>
                ))
                : ventas.length === 0
                  ? <tr><td colSpan={7} className="text-center p-8 text-t2 text-xs">No hay ventas registradas</td></tr>
                  : ventas.map(v => (
                  <tr key={v.id} className="border-b-[0.5px] border-border hover:bg-bg2 transition-colors">
                    <td className="px-3 py-[9px] text-t3 font-mono text-[11px]">{v.id}</td>
                    <td className="px-3 py-[9px]">{new Date(v.fecha_venta).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</td>
                    <td className="px-3 py-[9px] text-t2">{v.usuario_nombre}</td>
                    <td className="px-3 py-[9px] text-t2">{v.sede}</td>
                    <td className="px-3 py-[9px] text-t2 max-w-[260px]">
                      <span className="block truncate" title={v.detalles?.map(d => d.producto_nombre).join(', ')}>
                        {v.detalles?.length ? v.detalles.map(d => d.producto_nombre).join(', ') : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-[9px] font-semibold">{fmt(v.total)}</td>
                    <td className="px-3 py-[9px]">
                      <button onClick={() => setDetalleOpen(detalleOpen === v.id ? null : v.id)}
                        className="text-[11px] px-[9px] py-[3px] rounded-md cursor-pointer font-sans border-[0.5px] border-border bg-transparent text-t2">
                        {detalleOpen === v.id ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table></div>
      </div>

      {/* Detalle expandido */}
      {detalleOpen && ventas.filter(v => v.id === detalleOpen).map(v => (
        <div key={`det-${v.id}`} className="mt-2 bg-bg2 rounded-xl p-4 border-[0.5px] border-border">
          <div className="text-xs font-semibold mb-2">Detalle venta #{v.id}</div>
          <div className="text-xs flex flex-col gap-1.5">
            {v.detalles?.map(d => (
              <div key={d.id} className="flex justify-between py-1 border-b-[0.5px] border-border">
                <span>{d.producto_nombre} × {d.cantidad}</span>
                <span className="font-medium">{fmt(d.subtotal)} ({fmt(d.precio_unitario)} c/u)</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-right text-sm font-bold">Total: {fmt(v.total)}</div>
        </div>
      ))}

      </>}

      {tab === 'historial' && <>
        <FloatCard hover={false} style={{ padding: 20, marginBottom: 20 }}>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="min-w-[250px]">
              <label className="text-[11px] font-bold text-t2 block mb-1.5 uppercase tracking-[0.05em]">Producto</label>
              <select className="text-xs px-2.5 py-[7px] rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans w-full" value={historialProdId} onChange={e => setHistorialProdId(+e.target.value)}>
                <option value={0}>Seleccionar producto</option>
                {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <button onClick={cargarHistorial} disabled={!historialProdId}
              className="px-5 py-[9px] rounded-lg border-0 cursor-pointer bg-[#1D9E75] text-white font-sans text-xs font-semibold">
              🔍 Ver historial
            </button>
          </div>
        </FloatCard>

        {historialVentas.length === 0
          ? <div className="p-10 text-center text-t2">Selecciona un producto para ver su historial de ventas.</div>
          : <FloatSection title={`📊 Historial de ventas`} sub={`${historialVentas.length} registros`}>
              <div className="flex flex-col gap-2">
                {historialVentas.map(h => (
                  <div key={h.id} className="flex justify-between py-2 border-b-[0.5px] border-border text-xs">
                    <span>{h.fecha.slice(0, 10)} · {h.sede}</span>
                    <span className="font-semibold">{h.cantidad} u. × {fmt(h.precio_unitario)} = {fmt(h.subtotal)}</span>
                  </div>
                ))}
                <div className="text-right text-xs font-bold mt-2 pt-2 border-t-[0.5px] border-border">
                  Total: {fmt(historialVentas.reduce((a, h) => a + h.subtotal, 0))}
                </div>
              </div>
            </FloatSection>
        }
      </>}

      {/* Modal nueva venta */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/35 z-[100] flex items-center justify-center">
          <div className="bg-bg1 rounded-xl border-[0.5px] border-border p-5 w-full max-w-[560px] max-h-[90vh] overflow-y-auto">
            <div className="text-base font-medium mb-4">Nueva venta</div>

            <div className="mb-3">
              <label className="text-xs text-t2 block mb-1">Sede</label>
              <select className="text-xs px-2.5 py-[7px] rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans w-full" value={form.sede} onChange={e => setForm(f => ({ ...f, sede: e.target.value }))}>
                <option value="">Seleccionar sede</option>
                {sedes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="text-xs font-semibold mb-2">Productos</div>
            {form.items.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <select className="text-xs px-2.5 py-[7px] rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans w-full flex-[2]" value={item.producto_id} onChange={e => setItem(i, 'producto_id', +e.target.value)}>
                  <option value={0}>Seleccionar producto</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} (stock: {p.stock_actual})</option>)}
                </select>
                <input className="text-xs px-2.5 py-[7px] rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans w-full flex-1" type="number" min={1} value={item.cantidad} placeholder="Cant" onChange={e => setItem(i, 'cantidad', +e.target.value)} />
                <input className="text-xs px-2.5 py-[7px] rounded-lg border-[0.5px] border-border bg-bg1 text-t1 font-sans w-full flex-1" type="number" min={0} step={0.01} value={item.precio_unitario} placeholder="$" onChange={e => setItem(i, 'precio_unitario', +e.target.value)} />
                <button onClick={() => quitarItem(i)} className="text-base p-1 border-0 bg-transparent text-[#D85A30] cursor-pointer">✕</button>
              </div>
            ))}
            <button onClick={agregarItem} className="text-xs px-3 py-1.5 rounded-lg border-[0.5px] border-border bg-transparent cursor-pointer text-t2 mb-3">
              + Agregar producto
            </button>

            {error && <div className="text-xs text-[#993C1D] bg-[#FAECE7] px-3 py-2 rounded-lg mt-2">{error}</div>}

            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setModalOpen(false)} className="text-xs px-3.5 py-[7px] rounded-lg cursor-pointer font-sans border-[0.5px] border-border bg-transparent text-t1">Cancelar</button>
              <button onClick={guardar} disabled={saving} className={`text-xs px-4 py-[7px] rounded-lg cursor-pointer font-sans bg-[#1D9E75] text-white border-0 ${saving ? 'opacity-70' : 'opacity-100'}`}>
                {saving ? 'Guardando…' : 'Registrar venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
