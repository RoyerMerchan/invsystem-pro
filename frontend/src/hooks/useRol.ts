import type { Usuario } from '../types'

export type Rol = 'administrador' | 'analista' | 'operador' | 'consulta'

export const ROL_CONFIG = {
  administrador: {
    label: 'Administrador',
    color: '#2563EB',
    bg: '#EFF6FF',
    badge: '👑',
    desc: 'Acceso total al sistema',
  },
  analista: {
    label: 'Analista',
    color: '#059669',
    bg: '#ECFDF5',
    badge: '📊',
    desc: 'Lectura, movimientos, proyecciones y reportes',
  },
  operador: {
    label: 'Operador',
    color: '#D97706',
    bg: '#FFFBEB',
    badge: '🔧',
    desc: 'Lectura y movimientos de inventario (escáner)',
  },
  consulta: {
    label: 'Consulta',
    color: '#6B7280',
    bg: '#F3F4F6',
    badge: '👁',
    desc: 'Solo lectura del inventario',
  },
} as const

export function useRol(usuario: Usuario | null) {
  const rol = (usuario?.rol ?? 'consulta') as Rol
  const permisos = usuario?.permisos ?? {}

  return {
    rol,
    esAdmin:    rol === 'administrador',
    esAnalista: rol === 'analista',
    esOperador: rol === 'operador',
    esConsulta: rol === 'consulta',

    puedeLeer:                true,
    puedeEscribir:            rol === 'administrador',
    puedeMovimientos:         rol === 'administrador' || rol === 'analista' || rol === 'operador',
    puedeGestionarUsuarios:   rol === 'administrador',
    puedeGestionarProveedores:rol === 'administrador',
    puedeProyecciones:        rol === 'administrador' || rol === 'analista',
    puedeReportes:            rol === 'administrador' || rol === 'analista',

    config: ROL_CONFIG[rol] ?? ROL_CONFIG.consulta,
  }
}
