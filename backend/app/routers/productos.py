"""Router: /api/v1/productos"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import date, timedelta

from sqlalchemy import func, desc

from app.core.database import get_db
from app.models.models import Producto, Movimiento, Usuario
from app.routers.auth import get_current_user
from app.schemas import ProductoCreate, ProductoUpdate, ProductoResponse

router = APIRouter()


@router.get("/", response_model=list[ProductoResponse], summary="Listar productos")
async def listar_productos(
    categoria: str | None = Query(None),
    solo_activos: bool = Query(True, description="Filtrar solo productos activos"),
    q: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = select(Producto).order_by(Producto.nombre)
    if solo_activos:
        stmt = stmt.where(Producto.activo == True)
    if categoria:
        stmt = stmt.where(Producto.categoria == categoria)
    if q:
        stmt = stmt.where(Producto.nombre.ilike(f"%{q}%") | Producto.sku.ilike(f"%{q}%"))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/top-demanda", summary="Productos con mayor demanda (últimos 30 días)")
async def top_demanda(
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    desde = date.today() - timedelta(days=30)
    stmt = (
        select(
            Producto.id, Producto.nombre, Producto.sku, Producto.stock_actual,
            func.coalesce(func.sum(Movimiento.cantidad), 0).label("total_salidas")
        )
        .join(Movimiento, Movimiento.producto_id == Producto.id)
        .where(Movimiento.tipo == "salida", Movimiento.fecha >= desde, Producto.activo == True)
        .group_by(Producto.id)
        .order_by(desc("total_salidas"))
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [{"id": r.id, "nombre": r.nombre, "sku": r.sku, "stock_actual": r.stock_actual, "total_vendido": int(r.total_salidas)} for r in result.all()]


@router.get("/menor-rotacion", summary="Productos con menor rotación")
async def menor_rotacion(
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    desde = date.today() - timedelta(days=60)
    stmt = (
        select(
            Producto.id, Producto.nombre, Producto.sku, Producto.stock_actual, Producto.stock_minimo,
            func.coalesce(func.sum(Movimiento.cantidad), 0).label("total_salidas")
        )
        .outerjoin(Movimiento, Movimiento.producto_id == Producto.id)
        .where(Movimiento.tipo == "salida", Movimiento.fecha >= desde, Producto.activo == True)
        .group_by(Producto.id)
        .order_by(desc("total_salidas"))
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [{"id": r.id, "nombre": r.nombre, "sku": r.sku, "stock_actual": r.stock_actual, "total_vendido_60d": int(r.total_salidas)} for r in result.all()]

# ── Ventas historicas ──────────────────────────────────────
@router.get("/ventas-historicas", summary="Ventas diarias totales de los últimos N días")
async def ventas_historicas(
    dias: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    desde = date.today() - timedelta(days=dias)
    stmt = (
        select(
            func.date(Movimiento.fecha).label("dia"),
            func.coalesce(func.sum(Movimiento.cantidad), 0).label("total")
        )
        .where(Movimiento.tipo == "salida", Movimiento.fecha >= desde)
        .group_by(func.date(Movimiento.fecha))
        .order_by("dia")
    )
    result = await db.execute(stmt)
    return [{"fecha": str(r.dia), "total": int(r.total)} for r in result.all()]


@router.post("/", response_model=ProductoResponse, status_code=201, summary="Crear producto")
async def crear_producto(
    data: ProductoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != "administrador":
        raise HTTPException(403, detail="Solo administradores pueden crear productos.")
    # data.sku ya llega normalizado (mayúsculas, sin espacios) por el validador del schema.
    # La comparación es insensible a mayúsculas/espacios para detectar duplicados legados.
    existing = await db.execute(
        select(Producto).where(func.upper(func.trim(Producto.sku)) == data.sku)
    )
    if existing.scalars().first():
        raise HTTPException(400, detail=f"SKU '{data.sku}' ya existe.")
    producto = Producto(**data.model_dump())
    db.add(producto)
    await db.flush()
    await db.refresh(producto)
    return producto


@router.get("/{producto_id}", response_model=ProductoResponse, summary="Obtener producto")
async def obtener_producto(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    p = await db.get(Producto, producto_id)
    if not p:
        raise HTTPException(404, detail="Producto no encontrado")
    return p


@router.patch("/{producto_id}", response_model=ProductoResponse, summary="Actualizar producto")
async def actualizar_producto(
    producto_id: int,
    data: ProductoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != "administrador":
        raise HTTPException(403, detail="Solo administradores pueden modificar productos.")
    p = await db.get(Producto, producto_id)
    if not p:
        raise HTTPException(404, detail="Producto no encontrado")
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(p, campo, valor)
    await db.flush()
    await db.refresh(p)
    return p


@router.delete("/{producto_id}", status_code=204, summary="Desactivar producto (soft-delete)")
async def desactivar_producto(
    producto_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != "administrador":
        raise HTTPException(403, detail="Solo administradores pueden desactivar productos.")
    p = await db.get(Producto, producto_id)
    if not p:
        raise HTTPException(404, detail="Producto no encontrado")
    p.activo = False
    await db.flush()
