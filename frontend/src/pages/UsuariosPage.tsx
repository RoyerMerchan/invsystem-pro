import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import type { UsuarioAdmin, Usuario } from '../types'
import { useRol, ROL_CONFIG } from '../hooks/useRol'
import { Users, Shield, ShieldCheck, ShieldAlert, ShieldOff, UserCheck, UserX, Trash2, ToggleLeft, ToggleRight, Filter, Settings, Play, Pause, BarChart3, Wrench, Eye } from 'lucide-react'

interface Props { usuario: Usuario | null }
const ROLES = ['administrador', 'analista', 'operador', 'consulta'] as const

const ROL_ICON = {
  administrador: Shield,
  analista: BarChart3,
  operador: Wrench,
  consulta: Eye,
} as const

// ── Tarjeta flotante base ─────────────────────────────────────────
function FloatCard({ children, style = {}, color, className = '' }: {
  children: React.ReactNode; style?: React.CSSProperties; color?: string; className?: string
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`bg-bg1 rounded-2xl border-[0.5px] border-border transition-all duration-[220ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${hov ? 'shadow-xl -translate-y-[3px]' : 'shadow-sm'} ${className}`}
      style={{
        ...(color ? { border: `1px solid ${color}30` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

// ── Tarjeta de usuario individual ────────────────────────────────
function UserCard({ u, esMiCuenta, cambiando, onRol, onEstado, onEliminar }: {
  u: UsuarioAdmin
  esMiCuenta: boolean
  cambiando: boolean
  onRol: (id: number, rol: string) => void
  onEstado: (id: number, activo: boolean) => void
  onEliminar: (id: number, nombre: string) => void
}) {
  const cfg = ROL_CONFIG[u.rol as keyof typeof ROL_CONFIG] ?? ROL_CONFIG.consulta
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`bg-bg1 rounded-2xl transition-all duration-[220ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden relative ${hov ? 'shadow-xl -translate-y-[4px]' : 'shadow-sm'} ${cambiando ? 'opacity-50' : 'opacity-100'}`}
      style={{
        border: esMiCuenta ? `1.5px solid ${cfg.color}50` : '0.5px solid var(--border)',
      }}
    >
      {/* Badge "tú" */}
      {esMiCuenta && (
        <div className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
          background: `${cfg.color}18`, color: cfg.color,
        }}>
          Tú
        </div>
      )}

      <div className="p-4 pb-[14px]">
        {/* Avatar + nombre */}
        <div className="flex items-center gap-3 mb-[14px]">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-extrabold text-white shrink-0" style={{
            background: cfg.color,
          }}>
            {u.nombre.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-t1 truncate">{u.nombre}</div>
            <div className="text-[11px] text-t2 truncate">{u.email}</div>
          </div>
        </div>

        {/* Rol selector + estado */}
        <div className="flex gap-2 mb-[14px] items-center">
          {esMiCuenta ? (
            <span className="text-xs px-3 py-1 rounded-full font-bold" style={{
              background: cfg.bg, color: cfg.color,
            }}>
              {cfg.badge} {cfg.label}
            </span>
          ) : (
            <select
              value={u.rol}
              disabled={cambiando}
              onChange={e => onRol(u.id, e.target.value)}
              className="flex-1 text-xs px-2 py-[5px] rounded-lg font-bold cursor-pointer"
              style={{
                border: `1.5px solid ${cfg.color}44`,
                background: cfg.bg, color: cfg.color,
              }}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{ROL_CONFIG[r].badge} {ROL_CONFIG[r].label}</option>
              ))}
            </select>
          )}
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${u.activo ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
            {u.activo ? '● Activo' : '○ Inactivo'}
          </span>
        </div>

        {/* Fecha */}
        <div className="text-[10px] text-t3 mb-3">
          Registrado: {new Date(u.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>

        {/* Acciones */}
        {!esMiCuenta && (
          <div className="flex gap-1.5 border-t-[0.5px] border-border pt-3">
            <button
              onClick={() => onEstado(u.id, !u.activo)}
              disabled={cambiando}
              className="flex-1 text-[11px] py-1.5 rounded-lg border-[0.5px] border-border bg-bg2 text-t2 cursor-pointer font-medium inline-flex items-center gap-1 justify-center"
            >
              {u.activo ? <><Pause className="w-4 h-4" /> Desactivar</> : <><Play className="w-4 h-4" /> Activar</>}
            </button>
            <button
              onClick={() => onEliminar(u.id, u.nombre)}
              disabled={cambiando}
              className="text-[11px] py-1.5 px-2.5 rounded-lg cursor-pointer font-medium inline-flex items-center gap-1 justify-center border-[0.5px] text-danger border-danger/25 bg-transparent"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function UsuariosPage({ usuario }: Props) {
  const { esAdmin } = useRol(usuario)
  const [lista, setLista] = useState<UsuarioAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [cambiando, setCambiando] = useState<number | null>(null)
  const [filtroRol, setFiltroRol] = useState<string>('todos')

  const cargar = useCallback(() => {
    setLoading(true)
    api<UsuarioAdmin[]>('/api/v1/usuarios/').then(setLista).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar() }, [cargar])

  if (!esAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
      <ShieldOff className="w-12 h-12 text-t2" />
      <div className="text-base font-bold">Acceso restringido</div>
      <div className="text-sm text-t2">Solo los administradores pueden gestionar usuarios.</div>
    </div>
  )

  async function cambiarRol(id: number, rol: string) {
    setCambiando(id)
    try {
      await api(`/api/v1/usuarios/${id}/rol`, { method: 'PATCH', body: JSON.stringify({ rol }) })
      setLista(l => l.map(u => u.id === id ? { ...u, rol: rol as any } : u))
    } catch (e: any) { alert(e.message) }
    finally { setCambiando(null) }
  }

  async function cambiarEstado(id: number, activo: boolean) {
    setCambiando(id)
    try {
      await api(`/api/v1/usuarios/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ activo }) })
      setLista(l => l.map(u => u.id === id ? { ...u, activo } : u))
    } catch (e: any) { alert(e.message) }
    finally { setCambiando(null) }
  }

  async function eliminar(id: number, nombre: string) {
    if (!confirm(`¿Eliminar a "${nombre}"? Esta acción no se puede deshacer.`)) return
    setCambiando(id)
    try {
      await api(`/api/v1/usuarios/${id}`, { method: 'DELETE' })
      setLista(l => l.filter(u => u.id !== id))
    } catch (e: any) { alert(e.message) }
    finally { setCambiando(null) }
  }

  const stats = ROLES.map(r => ({
    rol: r, cfg: ROL_CONFIG[r],
    total: lista.filter(u => u.rol === r).length,
    activos: lista.filter(u => u.rol === r && u.activo).length,
  }))

  const filtrados = filtroRol === 'todos' ? lista : lista.filter(u => u.rol === filtroRol)

  return (
    <div>
      <div className="mb-6">
        <div className="text-xl font-bold tracking-tight">Gestión de Usuarios</div>
        <div className="text-sm text-t2 mt-[3px]">
          {lista.length} usuarios registrados · {lista.filter(u => u.activo).length} activos
        </div>
      </div>

      {/* Stats flotantes por rol */}
      <div className="grid-3 mb-6">
        {stats.map(s => {
          const IconComponent = ROL_ICON[s.rol as keyof typeof ROL_ICON] || Shield
          return (
            <FloatCard key={s.rol} color={s.cfg.color} className="cursor-pointer" style={{ padding: '18px 20px' }}
              // @ts-ignore
              onClick={() => setFiltroRol(filtroRol === s.rol ? 'todos' : s.rol)}
            >
              <div className="absolute inset-0 rounded-2xl transition-[background] duration-200" style={{
                background: filtroRol === s.rol ? `${s.cfg.color}08` : 'transparent',
              }} />
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center" style={{
                  background: `${s.cfg.color}18`,
                }}>
                  <IconComponent className="w-5 h-5" style={{ color: s.cfg.color }} />
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ color: s.cfg.color }}>{s.cfg.label}</div>
                  <div className="text-[10px] text-t3">{s.cfg.desc}</div>
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <div className="text-[32px] font-extrabold leading-none" style={{ color: s.cfg.color }}>{s.total}</div>
                <div className="text-[11px] text-t2">{s.activos} activos</div>
              </div>
              {filtroRol === s.rol && (
                <div className="text-[10px] mt-1.5 font-semibold" style={{ color: s.cfg.color }}>
                  ← Filtrando por este rol
                </div>
              )}
            </FloatCard>
          )
        })}
      </div>

      {/* Filtros rápidos */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {['todos', ...ROLES].map(r => (
          <button key={r} onClick={() => setFiltroRol(r)}
            className={`text-xs px-3.5 py-[5px] rounded-full border-none cursor-pointer transition-all duration-150 ${
              filtroRol === r ? 'bg-primary text-white font-bold' : 'bg-bg2 text-t2 font-normal'
            }`}
          >
            {r === 'todos' ? 'Todos' : ROL_CONFIG[r as keyof typeof ROL_CONFIG]?.badge + ' ' + ROL_CONFIG[r as keyof typeof ROL_CONFIG]?.label}
          </button>
        ))}
      </div>

      {/* Grid de tarjetas de usuario */}
      {loading ? (
        <div className="grid-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-bg2 rounded-2xl" style={{ height: 200, animation: 'pulse 1.5s infinite', animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <FloatCard className="text-center" style={{ padding: 40 }}>
          <div className="flex justify-center mb-3">
            <Users className="w-10 h-10 text-t2" />
          </div>
          <div className="text-sm font-semibold text-t2">No hay usuarios en esta categoría</div>
        </FloatCard>
      ) : (
        <div className="grid-3">
          {filtrados.map(u => (
            <UserCard
              key={u.id}
              u={u}
              esMiCuenta={u.id === usuario?.id}
              cambiando={cambiando === u.id}
              onRol={cambiarRol}
              onEstado={cambiarEstado}
              onEliminar={eliminar}
            />
          ))}
        </div>
      )}

      {/* Tabla de permisos flotante */}
      <div className="mt-6">
        <FloatCard style={{ padding: 20 }}>
          <div className="text-sm font-bold mb-4">Tabla de permisos por rol</div>
          <div className="grid-3">
            {ROLES.map(r => {
              const cfg = ROL_CONFIG[r]
              const perms: [string, boolean][] = [
                ['Ver inventario', true],
                ['Ver alertas', true],
                ['Ver proyecciones y reportes', r !== 'consulta'],
                ['Registrar movimientos', r !== 'consulta'],
                ['Usar escáner / Kiosko', r !== 'consulta'],
                ['Registrar ventas', r !== 'consulta'],
                ['Crear / editar productos', r === 'administrador'],
                ['Gestionar proveedores', r === 'administrador'],
                ['Gestionar usuarios', r === 'administrador'],
              ]
              return (
                <div key={r} className="p-3.5 rounded-xl" style={{ border: `1px solid ${cfg.color}22`, background: `${cfg.color}05` }}>
                  <div className="text-sm font-bold mb-2.5 flex items-center gap-1.5" style={{ color: cfg.color }}>
                    <span>{cfg.badge}</span> {cfg.label}
                  </div>
                  {perms.map(([perm, ok]) => (
                    <div key={perm} className={`flex items-center gap-1.5 text-[11px] mb-[5px] ${ok ? 'text-t1' : 'text-t3'}`}>
                      <span className="font-bold shrink-0" style={{ color: ok ? cfg.color : undefined }}>{ok ? '✓' : '✗'}</span>
                      {perm}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </FloatCard>
      </div>
    </div>
  )
}
