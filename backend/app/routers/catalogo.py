"""
Router: /api/v1/catalogo
Datos maestros dinámicos (categorías, unidades, sedes).

Cualquier usuario autenticado puede LISTAR las opciones (las usan los
formularios). Solo el administrador puede crear o eliminar.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import OpcionCatalogo, Usuario
from app.routers.auth import get_current_user
from app.schemas import OpcionCatalogoCreate, OpcionCatalogoUpdate, OpcionCatalogoResponse, TIPOS_CATALOGO

router = APIRouter()


def _require_admin(user: Usuario) -> None:
    if user.rol != "administrador":
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar los datos maestros.")


@router.get("/", response_model=list[OpcionCatalogoResponse], summary="Listar opciones del catálogo")
async def listar_opciones(
    tipo: str | None = Query(default=None, description="Filtrar por tipo: categoria | unidad | sede"),
    incluir_inactivos: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    stmt = select(OpcionCatalogo)
    if tipo:
        if tipo not in TIPOS_CATALOGO:
            raise HTTPException(400, detail=f"Tipo inválido. Válidos: {', '.join(TIPOS_CATALOGO)}")
        stmt = stmt.where(OpcionCatalogo.tipo == tipo)
    if not incluir_inactivos:
        stmt = stmt.where(OpcionCatalogo.activo.is_(True))
    stmt = stmt.order_by(OpcionCatalogo.tipo, OpcionCatalogo.valor)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=OpcionCatalogoResponse, status_code=201, summary="Crear opción")
async def crear_opcion(
    data: OpcionCatalogoCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    opcion = OpcionCatalogo(tipo=data.tipo, valor=data.valor, activo=True)
    db.add(opcion)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail=f"Ya existe '{data.valor}' en {data.tipo}.")
    await db.refresh(opcion)
    return opcion


@router.patch("/{opcion_id}", response_model=OpcionCatalogoResponse, summary="Editar opción")
async def actualizar_opcion(
    opcion_id: int,
    data: OpcionCatalogoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    opcion = await db.get(OpcionCatalogo, opcion_id)
    if not opcion:
        raise HTTPException(404, detail="Opción no encontrada.")
    opcion.valor = data.valor
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail=f"Ya existe '{data.valor}' en {opcion.tipo}.")
    await db.refresh(opcion)
    return opcion


@router.delete("/{opcion_id}", status_code=204, summary="Eliminar opción")
async def eliminar_opcion(
    opcion_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    opcion = await db.get(OpcionCatalogo, opcion_id)
    if not opcion:
        raise HTTPException(404, detail="Opción no encontrada.")
    await db.delete(opcion)
