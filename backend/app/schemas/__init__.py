"""
Schemas Pydantic centralizados — InvSystem Pro
Todos los contratos de entrada/salida de la API viven aquí.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import sanitizar_texto, validar_password


# ══════════════════════════════════════════════════════════════════
# USUARIOS / AUTH
# ══════════════════════════════════════════════════════════════════

class UsuarioBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    email: EmailStr

class RegistroRequest(UsuarioBase):
    password: str = Field(..., min_length=8, max_length=72)
    rol: Literal["analista", "operador", "consulta"] = "analista"

    @field_validator("nombre")
    @classmethod
    def limpiar_nombre(cls, v: str) -> str:
        return sanitizar_texto(v, max_len=100)

    @field_validator("password")
    @classmethod
    def validar_pass(cls, v: str) -> str:
        ok, msg = validar_password(v)
        if not ok:
            raise ValueError(msg)
        return v

class UsuarioResponse(BaseModel):
    id: int
    nombre: str
    email: str
    rol: str
    activo: bool
    creado_en: datetime
    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: dict


# ══════════════════════════════════════════════════════════════════
# PROVEEDORES
# ══════════════════════════════════════════════════════════════════

class ProveedorBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=200)
    contacto: str = Field(default="", max_length=100)
    email: EmailStr | None = None
    telefono: str = Field(default="", max_length=30)
    direccion: str = Field(default="", max_length=300)
    activo: bool = True

    @field_validator("nombre", "contacto", "direccion")
    @classmethod
    def limpiar_texto(cls, v: str) -> str:
        return sanitizar_texto(v)

class ProveedorCreate(ProveedorBase):
    pass

class ProveedorUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=200)
    contacto: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    telefono: str | None = Field(default=None, max_length=30)
    direccion: str | None = Field(default=None, max_length=300)
    activo: bool | None = None

class ProveedorResponse(ProveedorBase):
    id: int
    creado_en: datetime
    actualizado_en: datetime
    model_config = {"from_attributes": True}

class ProveedorResumen(BaseModel):
    id: int
    nombre: str
    activo: bool
    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════
# PRODUCTOS
# ══════════════════════════════════════════════════════════════════

class ProductoBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=200)
    descripcion: str = Field(default="", max_length=500)
    categoria: str = Field(..., min_length=1, max_length=50)
    sku: str = Field(..., min_length=1, max_length=50)
    stock_actual: int = Field(ge=0, default=0)
    stock_minimo: int = Field(ge=0, default=0)
    stock_maximo: int = Field(ge=0, default=0)
    precio_unitario: float = Field(ge=0, default=0.0)
    costo_unitario: float = Field(ge=0, default=0.0)
    unidad_medida: str = Field(default="unidad", max_length=20)
    activo: bool = True
    proveedor_id: int | None = None

    @field_validator("nombre", "categoria", "descripcion")
    @classmethod
    def limpiar(cls, v: str) -> str:
        return sanitizar_texto(v)

class ProductoCreate(ProductoBase):
    pass

class ProductoUpdate(BaseModel):
    nombre: str | None = None
    descripcion: str | None = None
    categoria: str | None = None
    stock_minimo: int | None = Field(default=None, ge=0)
    stock_maximo: int | None = Field(default=None, ge=0)
    precio_unitario: float | None = Field(default=None, ge=0)
    costo_unitario: float | None = Field(default=None, ge=0)
    unidad_medida: str | None = None
    activo: bool | None = None
    proveedor_id: int | None = None

class ProductoResponse(ProductoBase):
    id: int
    creado_en: datetime
    actualizado_en: datetime
    proveedor: ProveedorResumen | None = None
    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════
# MOVIMIENTOS
# ══════════════════════════════════════════════════════════════════

class MovimientoCreate(BaseModel):
    producto_id: int
    tipo: Literal["entrada", "salida", "ajuste"]
    cantidad: int = Field(..., gt=0)
    motivo: str = Field(default="", max_length=200)

    @field_validator("motivo")
    @classmethod
    def limpiar_motivo(cls, v: str) -> str:
        return sanitizar_texto(v)

class MovimientoResponse(BaseModel):
    id: int
    producto_id: int
    tipo: str
    cantidad: int
    stock_resultante: int
    motivo: str
    fecha: datetime
    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════
# ALERTAS
# ══════════════════════════════════════════════════════════════════

class ResumenAlertas(BaseModel):
    sin_stock: int
    stock_bajo: int
    stock_exceso: int
    normal: int
    total: int

class AlertasResponse(BaseModel):
    resumen: ResumenAlertas
    sin_stock: list[ProductoResponse]
    stock_bajo: list[ProductoResponse]
    stock_exceso: list[ProductoResponse]


# ══════════════════════════════════════════════════════════════════
# REPORTES
# ══════════════════════════════════════════════════════════════════

class PreviewReporte(BaseModel):
    total_productos: int
    total_movimientos: int
    valor_inventario: float
    sin_stock: int
    stock_bajo: int
    fecha: str
    formatos_disponibles: list[str]


# ══════════════════════════════════════════════════════════════════
# VENTAS
# ══════════════════════════════════════════════════════════════════

class VentaDetalleCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(..., gt=0)
    precio_unitario: float = Field(..., ge=0)

class VentaCreate(BaseModel):
    fecha_venta: datetime | None = None
    sede: str = Field(default="", max_length=100)
    detalles: list[VentaDetalleCreate] = Field(..., min_length=1)

class VentaDetalleResponse(BaseModel):
    id: int
    producto_id: int
    producto_nombre: str = ""
    cantidad: int
    precio_unitario: float
    subtotal: float
    model_config = {"from_attributes": True}

class VentaResponse(BaseModel):
    id: int
    fecha_venta: datetime
    usuario_nombre: str = ""
    total: float
    sede: str
    detalles: list[VentaDetalleResponse] = []
    creado_en: datetime
    model_config = {"from_attributes": True}


# ══════════════════════════════════════════════════════════════════
# SCANNER
# ══════════════════════════════════════════════════════════════════

class MovimientoScannerRequest(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    tipo: Literal["entrada", "salida"]
    cantidad: int = Field(..., gt=0, le=9999)
    motivo: str = Field(default="", max_length=200)

class MovimientoScannerResponse(BaseModel):
    ok: bool
    mensaje: str
    producto: str
    sku: str
    tipo: str
    cantidad: int
    stock_anterior: int
    stock_nuevo: int
