export interface Usuario {
  id: number
  nombre: string
  email: string
  rol: 'administrador' | 'analista' | 'operador' | 'consulta'
  permisos?: Record<string, boolean>
}

export type TipoCatalogo = 'categoria' | 'unidad' | 'sede'

export interface OpcionCatalogo {
  id: number
  tipo: TipoCatalogo
  valor: string
  activo: boolean
  creado_en: string
}

export interface Proveedor {
  id: number
  nombre: string
  contacto: string
  email?: string
  telefono: string
  direccion: string
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export interface ProveedorResumen {
  id: number
  nombre: string
  activo: boolean
}

export interface Producto {
  id: number
  nombre: string
  descripcion?: string
  categoria: string
  sku: string
  stock_actual: number
  stock_minimo: number
  stock_maximo: number
  precio_unitario: number
  costo_unitario?: number
  unidad_medida?: string
  activo: boolean
  proveedor_id?: number
  proveedor?: ProveedorResumen
  creado_en?: string
  actualizado_en?: string
}

export interface Movimiento {
  id: number
  producto_id: number
  tipo: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  stock_resultante: number
  motivo: string
  fecha: string
}

export interface AlertaResumen {
  sin_stock: number
  stock_bajo: number
  stock_exceso: number
  normal: number
  total: number
}

export interface Alerta {
  resumen: AlertaResumen
  sin_stock: Producto[]
  stock_bajo: Producto[]
  stock_exceso: Producto[]
}

export interface PuntoProyeccion {
  fecha: string
  valor: number
  lower_95: number
  upper_95: number
}

export interface Metricas {
  mae: number
  rmse: number
  mape: number
  aic: number | null
}

export interface ComparacionModelo {
  modelo: string
  mae: number
  rmse: number
  mape: number
}

export interface Proyeccion {
  producto_id: number
  producto_nombre: string
  stock_actual: number
  stock_minimo: number
  modelo_usado: string
  horizonte_dias: number
  puntos: PuntoProyeccion[]
  metricas: Metricas | null
  dias_hasta_agotamiento: number | null
  fecha_agotamiento: string | null
  reposicion_recomendada: number
  advertencias: string[]
  comparacion_modelos: ComparacionModelo[] | null
  guardado_id?: number | null
}

export interface ProyeccionHistorialItem {
  id: number
  producto_id: number
  producto_nombre: string
  modelo_utilizado: string
  horizonte_dias: number
  reposicion_recomendada: number
  dias_agotamiento: number | null
  creado_en: string
  creado_por_nombre: string
}

export interface ProyeccionComparacion {
  proyeccion_id: number
  producto_id: number
  producto_nombre: string
  modelo_usado: string
  demanda_proyectada: number
  demanda_real: number
  diferencia: number
  error_absoluto: number
  porcentaje_error: number
  precision: number
}

export interface VentaDetalle {
  id: number
  producto_id: number
  producto_nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface VentaCreateDetalle {
  producto_id: number
  cantidad: number
  precio_unitario: number
}

export interface Venta {
  id: number
  fecha_venta: string
  usuario_nombre: string
  total: number
  sede: string
  detalles: VentaDetalle[]
  creado_en: string
}

export interface VentaHistorialItem {
  id: number
  venta_id: number
  fecha: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  sede: string
}

export interface UsuarioAdmin {
  id: number
  nombre: string
  email: string
  rol: 'administrador' | 'analista' | 'operador' | 'consulta'
  activo: boolean
  creado_en: string
}

// Extend Usuario to include permisos
declare module './index' {
  interface Usuario {
    permisos?: Record<string, boolean>
  }
}
