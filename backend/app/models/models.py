"""Modelos de base de datos — InvSystem Pro"""
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Boolean, Text, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), default="usuario")  # admin | usuario | invitado
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Proveedor(Base):
    __tablename__ = "proveedores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    contacto: Mapped[str] = mapped_column(String(100), default="")
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    telefono: Mapped[str] = mapped_column(String(30), default="")
    direccion: Mapped[str] = mapped_column(Text, default="")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    productos: Mapped[list["Producto"]] = relationship(
        "Producto", back_populates="proveedor"
    )


class Producto(Base):
    __tablename__ = "productos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, default="")
    categoria: Mapped[str] = mapped_column(String(50), nullable=False)
    sku: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    stock_actual: Mapped[int] = mapped_column(Integer, default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, default=0)
    stock_maximo: Mapped[int] = mapped_column(Integer, default=0)
    precio_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    costo_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    unidad_medida: Mapped[str] = mapped_column(String(20), default="unidad")
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    proveedor_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True, index=True
    )
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    movimientos: Mapped[list["Movimiento"]] = relationship(
        "Movimiento", back_populates="producto", cascade="all, delete-orphan"
    )
    proveedor: Mapped["Proveedor | None"] = relationship(
        "Proveedor", back_populates="productos"
    )


class Movimiento(Base):
    __tablename__ = "movimientos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    producto_id: Mapped[int] = mapped_column(Integer, ForeignKey("productos.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    stock_resultante: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo: Mapped[str] = mapped_column(String(200), default="")
    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    producto: Mapped["Producto"] = relationship("Producto", back_populates="movimientos")


class ProyeccionGuardada(Base):
    __tablename__ = "proyecciones_guardadas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    producto_id: Mapped[int] = mapped_column(Integer, ForeignKey("productos.id"), nullable=False, index=True)
    modelo_utilizado: Mapped[str] = mapped_column(String(50), nullable=False)
    horizonte_dias: Mapped[int] = mapped_column(Integer, default=30)
    rango_desde: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rango_hasta: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    agrupacion: Mapped[str] = mapped_column(String(20), default="diaria")
    parametros: Mapped[dict] = mapped_column(JSON, default=dict)
    puntos: Mapped[dict] = mapped_column(JSON, default=dict)
    metricas: Mapped[dict] = mapped_column(JSON, default=dict)
    reposicion_recomendada: Mapped[int] = mapped_column(Integer, default=0)
    dias_agotamiento: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    producto: Mapped["Producto"] = relationship("Producto")
    creado_por: Mapped["Usuario"] = relationship("Usuario")


class Venta(Base):
    __tablename__ = "ventas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    fecha_venta: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    sede: Mapped[str] = mapped_column(String(100), default="")
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    usuario: Mapped["Usuario"] = relationship("Usuario")
    detalles: Mapped[list["VentaDetalle"]] = relationship(
        "VentaDetalle", back_populates="venta", cascade="all, delete-orphan"
    )


class VentaDetalle(Base):
    __tablename__ = "ventas_detalle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    venta_id: Mapped[int] = mapped_column(Integer, ForeignKey("ventas.id", ondelete="CASCADE"), nullable=False)
    producto_id: Mapped[int] = mapped_column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Float, default=0.0)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)

    venta: Mapped["Venta"] = relationship("Venta", back_populates="detalles")
    producto: Mapped["Producto"] = relationship("Producto")


class OpcionCatalogo(Base):
    """Datos maestros dinámicos gestionables por el administrador.

    En vez de listas fijas en el código (categorías, unidades, sedes),
    cada opción se guarda como una fila con un `tipo` que la agrupa.
    """
    __tablename__ = "catalogo_opciones"
    __table_args__ = (
        UniqueConstraint("tipo", "valor", name="uq_catalogo_tipo_valor"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # categoria | unidad | sede
    valor: Mapped[str] = mapped_column(String(100), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
