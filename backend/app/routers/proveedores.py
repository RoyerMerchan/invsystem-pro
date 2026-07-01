"""
Router: /api/v1/proveedores
CRUD completo de proveedores con validación de roles.
Solo administradores pueden crear, actualizar o eliminar.
Cualquier usuario autenticado puede listar.
"""


from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import Proveedor, Producto, Usuario
from app.routers.auth import get_current_user
from app.schemas import (
    ProveedorCreate, ProveedorUpdate,
    ProveedorResponse, ProveedorResumen,
)

router = APIRouter()



def _require_admin(user: Usuario) -> None:
    """Lanza 403 si el usuario no es administrador."""
    if user.rol != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requiere rol de administrador para esta acción.",
        )


# ── GET /  ── Listar proveedores ─────────────────────────────────
@router.get("/", response_model=list[ProveedorResponse], summary="Listar proveedores")
async def listar_proveedores(
    solo_activos: bool = Query(True, description="Filtrar solo proveedores activos"),
    q: str | None = Query(None, description="Buscar por nombre"),
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    stmt = select(Proveedor).order_by(Proveedor.nombre)
    if solo_activos:
        stmt = stmt.where(Proveedor.activo == True)
    if q:
        stmt = stmt.where(Proveedor.nombre.ilike(f"%{q}%"))
    result = await db.execute(stmt)
    return result.scalars().all()


# ── GET /resumen ── Lista ligera para dropdowns ──────────────────
@router.get("/resumen", response_model=list[ProveedorResumen], summary="Lista ligera para selects")
async def resumen_proveedores(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    result = await db.execute(
        select(Proveedor).where(Proveedor.activo == True).order_by(Proveedor.nombre)
    )
    return result.scalars().all()


# ── GET /{id} ── Detalle proveedor ────────────────────────────────
@router.get("/{proveedor_id}", response_model=ProveedorResponse, summary="Obtener proveedor")
async def obtener_proveedor(
    proveedor_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")
    return p


# ── GET /{id}/productos ── Productos de un proveedor ─────────────
@router.get("/{proveedor_id}/productos", summary="Productos de un proveedor")
async def productos_del_proveedor(
    proveedor_id: int,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")
    result = await db.execute(
        select(Producto)
        .where(Producto.proveedor_id == proveedor_id)
        .order_by(Producto.nombre)
    )
    productos = result.scalars().all()
    return {
        "proveedor": p.nombre,
        "total": len(productos),
        "productos": productos,
    }


# ── POST / ── Crear proveedor (solo admin) ────────────────────────
@router.post(
    "/",
    response_model=ProveedorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear proveedor (admin)",
)
async def crear_proveedor(
    data: ProveedorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)

    # Verificar nombre único
    existing = await db.execute(
        select(Proveedor).where(func.lower(Proveedor.nombre) == data.nombre.lower())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, detail=f"Ya existe un proveedor con el nombre '{data.nombre}'.")

    proveedor = Proveedor(**data.model_dump())
    db.add(proveedor)
    await db.flush()
    await db.refresh(proveedor)
    return proveedor


# ── PATCH /{id} ── Actualizar proveedor (solo admin) ─────────────
@router.patch(
    "/{proveedor_id}",
    response_model=ProveedorResponse,
    summary="Actualizar proveedor (admin)",
)
async def actualizar_proveedor(
    proveedor_id: int,
    data: ProveedorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)

    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")

    for campo, valor in data.model_dump(exclude_none=True).items():
        setattr(p, campo, valor)

    await db.flush()
    await db.refresh(p)
    return p


# ── DELETE /{id} ── Desactivar proveedor (solo admin) ─────────────
@router.delete(
    "/{proveedor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Desactivar proveedor (admin)",
)
async def desactivar_proveedor(
    proveedor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """
    No elimina físicamente el proveedor (para preservar historial).
    Marca el proveedor como inactivo (soft delete).
    """
    _require_admin(current_user)

    p = await db.get(Proveedor, proveedor_id)
    if not p:
        raise HTTPException(404, detail="Proveedor no encontrado.")

    p.activo = False
    await db.flush()
