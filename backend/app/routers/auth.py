"""
Router: /api/v1/auth
Roles soportados: admin | usuario | invitado
  - admin:    acceso total, gestión de usuarios y proveedores
  - usuario:  lectura + movimientos de inventario
  - invitado: solo lectura, sin movimientos
"""
import os
from datetime import datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    limiter, validar_password, sanitizar_texto,
    log_evento_seguridad, registrar_intento_fallido, resetear_intentos
)
from app.models.models import Usuario

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

PERMISOS = {
    "administrador": {"leer": True,  "escribir": True,  "movimientos": True,  "gestionar_usuarios": True,  "gestionar_proveedores": True,  "proyecciones": True,  "reportes": True},
    "analista":      {"leer": True,  "escribir": False, "movimientos": True,  "gestionar_usuarios": False, "gestionar_proveedores": False, "proyecciones": True,  "reportes": True},
    "operador":      {"leer": True,  "escribir": False, "movimientos": True,  "gestionar_usuarios": False, "gestionar_proveedores": False, "proyecciones": False, "reportes": False},
    "consulta":      {"leer": True,  "escribir": False, "movimientos": False, "gestionar_usuarios": False, "gestionar_proveedores": False, "proyecciones": False, "reportes": False},
}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: dict


class RegistroRequest(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)
    # Los usuarios pueden auto-registrarse como analista, operador o consulta
    rol: Literal["analista", "operador", "consulta"] = "analista"

    @field_validator("nombre")
    @classmethod
    def validar_nombre(cls, v: str) -> str:
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
    permisos: dict | None = None

    class Config:
        from_attributes = True


def crear_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verificar_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> Usuario:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str | None = payload.get("sub")
        if not email:
            raise exc
    except JWTError:
        raise exc

    result = await db.execute(select(Usuario).where(Usuario.email == email))
    usuario = result.scalar_one_or_none()
    if not usuario or not usuario.activo:
        raise exc
    return usuario


def require_permiso(permiso: str):
    """Dependencia que verifica un permiso específico según el rol."""
    async def _check(current_user: Usuario = Depends(get_current_user)):
        rol = current_user.rol
        perms = PERMISOS.get(rol, {})
        if not perms.get(permiso, False):
            raise HTTPException(
                status_code=403,
                detail=f"Tu rol '{rol}' no tiene permiso para esta acción."
            )
        return current_user
    return _check


@router.post("/registro", response_model=UsuarioResponse, status_code=201)
@limiter.limit("10/minute")
async def registro(
    request: Request,
    data: RegistroRequest,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Usuario).where(Usuario.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Ya existe una cuenta con ese correo.")

    now = datetime.utcnow()
    usuario = Usuario(
        nombre=data.nombre,
        email=data.email,
        hashed_password=hash_password(data.password),
        rol=data.rol,
        activo=True,
        creado_en=now,
    )
    db.add(usuario)
    await db.flush()
    await db.refresh(usuario)

    log_evento_seguridad("REGISTRO_NUEVO", request.client.host, f"{data.email} [{data.rol}]")
    resp = UsuarioResponse.model_validate(usuario)
    resp.permisos = PERMISOS.get(usuario.rol, {})
    return resp


@router.post("/token", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    ip = request.client.host
    result = await db.execute(select(Usuario).where(Usuario.email == form.username))
    usuario = result.scalar_one_or_none()

    if not usuario or not verificar_password(form.password, usuario.hashed_password):
        bloqueado = registrar_intento_fallido(ip)
        log_evento_seguridad("LOGIN_FALLIDO", ip, form.username)
        if bloqueado:
            raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espera unos minutos.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not usuario.activo:
        raise HTTPException(status_code=403, detail="Cuenta desactivada. Contacta al administrador.")

    resetear_intentos(ip)
    token = crear_token({"sub": usuario.email, "rol": usuario.rol})
    log_evento_seguridad("LOGIN_OK", ip, f"{usuario.email} [{usuario.rol}]")

    return Token(
        access_token=token,
        usuario={
            "id": usuario.id,
            "nombre": usuario.nombre,
            "email": usuario.email,
            "rol": usuario.rol,
            "permisos": PERMISOS.get(usuario.rol, {}),
        },
    )


@router.get("/me", response_model=UsuarioResponse)
async def me(current_user: Annotated[Usuario, Depends(get_current_user)]):
    resp = UsuarioResponse.model_validate(current_user)
    resp.permisos = PERMISOS.get(current_user.rol, {})
    return resp


@router.get("/permisos")
async def mis_permisos(current_user: Annotated[Usuario, Depends(get_current_user)]):
    return {"rol": current_user.rol, "permisos": PERMISOS.get(current_user.rol, {})}


@router.post("/logout")
async def logout(
    request: Request,
    current_user: Annotated[Usuario, Depends(get_current_user)],
):
    log_evento_seguridad("LOGOUT", request.client.host, current_user.email)
    return {"message": "Sesión cerrada correctamente"}
