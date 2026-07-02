"""
Router: /api/v1/tipos-control
Tipos de control dinámicos con campos personalizados (form builder).

Cualquier usuario autenticado puede LISTAR (lo usa el formulario de productos).
Solo el administrador puede crear/eliminar tipos y campos.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import TipoControl, CampoControl, Usuario
from app.routers.auth import get_current_user
from app.schemas import (
    TipoControlCreate, TipoControlUpdate, TipoControlResponse,
    CampoControlCreate, CampoControlUpdate, CampoControlResponse,
)

router = APIRouter()


def _require_admin(user: Usuario) -> None:
    if user.rol != "administrador":
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar los tipos de control.")


@router.get("/", response_model=list[TipoControlResponse], summary="Listar tipos de control con sus campos")
async def listar_tipos(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    stmt = (
        select(TipoControl)
        .options(selectinload(TipoControl.campos))
        .where(TipoControl.activo.is_(True))
        .order_by(TipoControl.nombre)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", response_model=TipoControlResponse, status_code=201, summary="Crear tipo de control")
async def crear_tipo(
    data: TipoControlCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    tipo = TipoControl(nombre=data.nombre, descripcion=data.descripcion, activo=True)
    db.add(tipo)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail=f"Ya existe un tipo de control llamado '{data.nombre}'.")
    # Recargar con la relación campos (vacía) para la respuesta
    await db.refresh(tipo, attribute_names=["campos"])
    return tipo


@router.patch("/{tipo_id}", response_model=TipoControlResponse, summary="Editar tipo de control")
async def actualizar_tipo(
    tipo_id: int,
    data: TipoControlUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    tipo = await db.get(TipoControl, tipo_id)
    if not tipo:
        raise HTTPException(404, detail="Tipo de control no encontrado.")
    cambios = data.model_dump(exclude_unset=True)
    for campo, valor in cambios.items():
        setattr(tipo, campo, valor)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail=f"Ya existe un tipo de control llamado '{data.nombre}'.")
    await db.refresh(tipo, attribute_names=["campos"])
    return tipo


@router.delete("/{tipo_id}", status_code=204, summary="Eliminar tipo de control")
async def eliminar_tipo(
    tipo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    tipo = await db.get(TipoControl, tipo_id)
    if not tipo:
        raise HTTPException(404, detail="Tipo de control no encontrado.")
    await db.delete(tipo)  # cascade elimina sus campos


@router.post("/{tipo_id}/campos", response_model=CampoControlResponse, status_code=201, summary="Agregar campo a un tipo")
async def agregar_campo(
    tipo_id: int,
    data: CampoControlCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    tipo = await db.get(TipoControl, tipo_id)
    if not tipo:
        raise HTTPException(404, detail="Tipo de control no encontrado.")
    # Siguiente orden = cantidad actual de campos del tipo
    n = await db.scalar(
        select(func.count()).select_from(CampoControl).where(CampoControl.tipo_control_id == tipo_id)
    )
    campo = CampoControl(
        tipo_control_id=tipo_id,
        etiqueta=data.etiqueta,
        requerido=data.requerido,
        tipo_dato="texto",
        orden=n or 0,
    )
    db.add(campo)
    await db.flush()
    await db.refresh(campo)
    return campo


@router.patch("/campos/{campo_id}", response_model=CampoControlResponse, summary="Editar campo")
async def actualizar_campo(
    campo_id: int,
    data: CampoControlUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    campo = await db.get(CampoControl, campo_id)
    if not campo:
        raise HTTPException(404, detail="Campo no encontrado.")
    for attr, valor in data.model_dump(exclude_unset=True).items():
        setattr(campo, attr, valor)
    await db.flush()
    await db.refresh(campo)
    return campo


@router.delete("/campos/{campo_id}", status_code=204, summary="Eliminar campo")
async def eliminar_campo(
    campo_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    campo = await db.get(CampoControl, campo_id)
    if not campo:
        raise HTTPException(404, detail="Campo no encontrado.")
    await db.delete(campo)
