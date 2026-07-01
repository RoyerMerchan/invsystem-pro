"""
Router: /api/v1/usuarios
Gestión de usuarios — solo administradores.
Permite listar, cambiar rol, activar/desactivar.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal

from app.core.database import get_db
from app.models.models import Usuario
from app.routers.auth import get_current_user

router = APIRouter()

ROLES_VALIDOS = {"administrador", "analista", "operador", "consulta"}


class UsuarioListItem(BaseModel):
    id: int
    nombre: str
    email: str
    rol: str
    activo: bool
    creado_en: datetime
    model_config = {"from_attributes": True}


class CambiarRolRequest(BaseModel):
    rol: Literal["administrador", "analista", "operador", "consulta"]


class CambiarEstadoRequest(BaseModel):
    activo: bool


def _require_admin(user: Usuario) -> None:
    if user.rol != "administrador":
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar usuarios.")


@router.get("/", response_model=list[UsuarioListItem], summary="Listar todos los usuarios")
async def listar_usuarios(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    result = await db.execute(select(Usuario).order_by(Usuario.creado_en.desc()))
    return result.scalars().all()


@router.patch("/{usuario_id}/rol", response_model=UsuarioListItem, summary="Cambiar rol de usuario")
async def cambiar_rol(
    usuario_id: int,
    data: CambiarRolRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    if usuario_id == current_user.id:
        raise HTTPException(400, detail="No puedes cambiar tu propio rol.")
    u = await db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(404, detail="Usuario no encontrado.")
    u.rol = data.rol
    await db.flush()
    await db.refresh(u)
    return u


@router.patch("/{usuario_id}/estado", response_model=UsuarioListItem, summary="Activar/desactivar usuario")
async def cambiar_estado(
    usuario_id: int,
    data: CambiarEstadoRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    if usuario_id == current_user.id:
        raise HTTPException(400, detail="No puedes desactivarte a ti mismo.")
    u = await db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(404, detail="Usuario no encontrado.")
    u.activo = data.activo
    await db.flush()
    await db.refresh(u)
    return u


@router.delete("/{usuario_id}", status_code=204, summary="Eliminar usuario")
async def eliminar_usuario(
    usuario_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _require_admin(current_user)
    if usuario_id == current_user.id:
        raise HTTPException(400, detail="No puedes eliminarte a ti mismo.")
    u = await db.get(Usuario, usuario_id)
    if not u:
        raise HTTPException(404, detail="Usuario no encontrado.")
    await db.delete(u)
